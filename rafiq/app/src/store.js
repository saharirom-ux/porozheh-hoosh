import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as requestApi from './api';
import { sendEvent, connectRealtime, disconnectRealtime, isSocketOpen } from './realtime';
import {
  getIdentity,
  publishPublicKey,
  getChatKey,
  ensureDmKey,
  distributeGroupKey,
  shareHeldKey,
  acceptWrappedKey,
  syncStoredKeys,
  requestKeyFrom,
  fetchPublicKeys,
} from './keys';
import { openJson, messageAad, encryptText, bytesToBase64, base64ToBytes, newChatKey, encryptFile } from './crypto';
import * as Crypto from 'expo-crypto';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const byId = (id) => String(id);

/**
 * Decrypt one stored message. Returns `pending: true` when we do not hold the
 * right key yet — the UI shows a lock and we ask the members for it.
 */
export function decryptMessage(raw, key) {
  if (!key) return { ...raw, pending: true, kind: raw.kind };
  try {
    const payload = openJson(key, messageAad(raw), raw.body);
    return { ...raw, pending: false, kind: raw.kind, ...payload };
  } catch {
    return { ...raw, pending: true, kind: raw.kind };
  }
}

export function AppProvider({ children }) {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState({});
  const [typing, setTyping] = useState({});
  const [presence, setPresence] = useState({});
  const [decryptTick, setDecryptTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const meRef = useRef(null);
  meRef.current = me;
  const chatsRef = useRef([]);
  chatsRef.current = chats;
  const bump = useCallback(() => setDecryptTick((t) => t + 1), []);

  const chatEntry = useCallback((chatId) => chatsRef.current.find((c) => c.chat.id === chatId) || null, []);

  const userById = useCallback((userId) => {
    for (const entry of chatsRef.current) {
      const hit = entry.members.find((m) => m.id === userId);
      if (hit) return hit;
    }
    return null;
  }, []);

  const upsertChat = useCallback((payload) => {
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.chat.id === payload.chat.id);
      const next = idx >= 0 ? [...prev] : [payload, ...prev];
      if (idx >= 0) {
        next[idx] = { ...prev[idx], ...payload, receipts: { ...prev[idx].receipts, ...payload.receipts } };
      }
      return next.sort((a, b) => (b.lastMessage?.id || b.chat.id) - (a.lastMessage?.id || a.chat.id));
    });
  }, []);

  const refreshChats = useCallback(async () => {
    const { chats: list } = await requestApi.request('/chats');
    setChats(list);
    // Fetch any keys the server was holding for us while we were away.
    for (const entry of list) {
      const had = await getChatKey(entry.chat.id, entry.chat.keyVersion);
      if (!had) {
        const ok = await syncStoredKeys(entry.chat.id, entry.chat.keyVersion);
        if (ok) bump();
      }
    }
    return list;
  }, [bump]);

  // ------------------------------------------------------- key plumbing

  const ensureKeyFor = useCallback(
    async (entry) => {
      const { chat, members } = entry;
      const existing = await getChatKey(chat.id, chat.keyVersion);
      if (existing) return existing;

      if (chat.type === 'dm') {
        const peer = members.find((m) => m.id !== meRef.current?.id);
        if (!peer) return null;
        if (!peer.publicKey) {
          const map = await fetchPublicKeys([peer.username]);
          peer.publicKey = map[peer.username] || null;
        }
        if (!peer.publicKey) return null;
        const key = await ensureDmKey(chat, peer.publicKey);
        if (key) bump();
        return key;
      }

      const stored = await syncStoredKeys(chat.id, chat.keyVersion);
      if (stored) {
        const again = await getChatKey(chat.id, chat.keyVersion);
        if (again) {
          bump();
          return again;
        }
      }
      requestKeyFrom(chat.id, chat.keyVersion, sendEvent);
      return null;
    },
    [bump],
  );

  const handlePacket = useCallback(
    (packet) => {
      switch (packet.t) {
        case 'msg': {
          const chatId = packet.msg.chatId;
          setMessages((prev) => {
            const list = prev[byId(chatId)] || [];
            if (list.some((m) => m.id === packet.msg.id)) return prev;
            return { ...prev, [byId(chatId)]: [...list, packet.msg] };
          });
          setChats((prev) =>
            prev.map((entry) => {
              if (entry.chat.id !== chatId) return entry;
              const mine = packet.msg.senderId === meRef.current?.id;
              return {
                ...entry,
                lastMessage: packet.msg,
                unread: mine ? entry.unread : entry.unread + 1,
              };
            }),
          );
          bump();
          break;
        }
        case 'typing': {
          const chatId = byId(packet.chatId);
          setTyping((prev) => ({
            ...prev,
            [chatId]: { ...(prev[chatId] || {}), [packet.userId]: Date.now() + 6000 },
          }));
          break;
        }
        case 'presence':
          setPresence((prev) => ({ ...prev, [packet.userId]: { online: packet.online, lastSeen: packet.lastSeen } }));
          break;
        case 'read':
          setChats((prev) =>
            prev.map((entry) =>
              entry.chat.id === packet.chatId
                ? { ...entry, receipts: { ...entry.receipts, [packet.userId]: packet.lastId } }
                : entry,
            ),
          );
          break;
        case 'key':
          acceptWrappedKey(packet, userById(packet.fromUserId)?.publicKey).then((ok) => ok && bump());
          break;
        case 'keyreq': {
          const entry = chatEntry(packet.chatId);
          if (entry) {
            const missing = (packet.userIds || [packet.userId]).filter(Boolean);
            shareHeldKey(entry.chat, missing, meRef.current?.id).catch(() => {});
          }
          break;
        }
        case 'chat':
          upsertChat(packet);
          break;
        case 'removed':
          setChats((prev) => prev.filter((entry) => entry.chat.id !== packet.chatId));
          break;
        case 'rotate': {
          // The lowest-id current member rotates, so everyone agrees who acts.
          const entry = chatEntry(packet.chatId);
          const members = entry?.members || [];
          const leader = members.length ? Math.min(...members.map((m) => m.id)) : null;
          if (entry && leader === meRef.current?.id) {
            distributeGroupKey({ ...entry.chat, keyVersion: packet.keyVersion }, members, meRef.current.id)
              .then(() => bump())
              .catch(() => {});
          }
          break;
        }
        case 'chat:update':
          refreshChats().catch(() => {});
          break;
        default:
          break;
      }
    },
    [bump, chatEntry, refreshChats, upsertChat, userById],
  );

  // ------------------------------------------------------------- session

  useEffect(() => {
    (async () => {
      try {
        await requestApi.loadServer();
        if (!requestApi.hasServer()) {
          setNeedsSetup(true);
          setReady(true);
          return;
        }
        const token = await requestApi.loadToken();
        if (!token) {
          setNeedsSetup(true);
          setReady(true);
          return;
        }
        const { user } = await requestApi.request('/me');
        await getIdentity();
        await publishPublicKey();
        setMe(user);
        await refreshChats();
        connectRealtime(handlePacket);
        setNeedsSetup(false);
      } catch {
        await requestApi.saveToken(null);
        setNeedsSetup(true);
      } finally {
        setReady(true);
      }
    })();
    return () => disconnectRealtime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // typing indicators expire on their own
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        let changed = false;
        const next = {};
        for (const [chatId, holders] of Object.entries(prev)) {
          const alive = {};
          for (const [userId, until] of Object.entries(holders)) {
            if (until > now) alive[userId] = until;
            else changed = true;
          }
          next[chatId] = alive;
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------- actions

  const configureServer = useCallback(async (url) => {
    await requestApi.saveServer(url);
    setNeedsSetup(true);
  }, []);

  const completeSignIn = useCallback(
    async (payload) => {
      await requestApi.saveToken(payload.token);
      await getIdentity();
      await publishPublicKey();
      setMe(payload.user);
      setNeedsSetup(false);
      const list = await refreshChats();
      connectRealtime(handlePacket);
      for (const entry of list) await ensureKeyFor(entry);
      return list;
    },
    [ensureKeyFor, handlePacket, refreshChats],
  );

  const login = useCallback(
    async (username, password) => completeSignIn(await requestApi.request('/login', { method: 'POST', body: { username, password } })),
    [completeSignIn],
  );

  const register = useCallback(
    async (username, displayName, password) =>
      completeSignIn(await requestApi.request('/register', { method: 'POST', body: { username, displayName, password } })),
    [completeSignIn],
  );

  const logout = useCallback(async () => {
    disconnectRealtime();
    await requestApi.saveToken(null);
    setMe(null);
    setChats([]);
    setMessages({});
    setNeedsSetup(true);
  }, []);

  const openChat = useCallback(
    async (entry) => {
      const { chat } = entry;
      const existing = messages[byId(chat.id)] || [];
      if (!existing.length) {
        const { messages: history } = await requestApi.request(`/chats/${chat.id}/messages?limit=100`);
        setMessages((prev) => ({ ...prev, [byId(chat.id)]: history }));
      }
      const key = await ensureKeyFor(entry);
      if (!key) await ensureKeyFor(entry);
      return key;
    },
    [ensureKeyFor, messages],
  );

  const markRead = useCallback(
    async (chatId) => {
      const list = messages[byId(chatId)] || [];
      const lastId = list.length ? list[list.length - 1].id : 0;
      if (lastId) sendEvent({ t: 'read', chatId, lastId });
      await requestApi.request(`/chats/${chatId}/read`, { method: 'POST', body: { lastId } }).catch(() => {});
      setChats((prev) => prev.map((entry) => (entry.chat.id === chatId ? { ...entry, unread: 0 } : entry)));
    },
    [messages],
  );

  const sendPayload = useCallback(
    async (entry, kind, payload) => {
      const key = await ensureKeyFor(entry);
      if (!key) throw new Error('کلید رمزنگاری این گفتگو هنوز آماده نیست؛ چند لحظه دیگر دوباره تلاش کن');

      const raw = { ...payload, sentAt: Date.now() };
      const body = encryptText(key, messageAad({ chatId: entry.chat.id, senderId: meRef.current.id, keyVersion: entry.chat.keyVersion, kind }), JSON.stringify(raw));
      const sent = sendEvent({
        t: 'send',
        chatId: entry.chat.id,
        keyVersion: entry.chat.keyVersion,
        kind,
        body: bytesToBase64(body),
      });
      if (!sent) throw new Error('اتصال به سرور برقرار نیست');
    },
    [ensureKeyFor],
  );

  const sendText = useCallback((entry, text, replyTo) => sendPayload(entry, 'text', { t: 'text', text, replyTo: replyTo || null }), [sendPayload]);

  const sendReaction = useCallback(
    (entry, target, emoji) => sendPayload(entry, 'reaction', { t: 'reaction', target, emoji }),
    [sendPayload],
  );

  const sendFile = useCallback(
    async (entry, { name, mime, base64 }) => {
      setBusy(true);
      try {
        const bytes = base64ToBytes(base64);
        const fileId = Crypto.randomUUID();
        const fileKey = newChatKey();
        const encrypted = encryptFile(fileKey, fileId, bytes);

        await requestApi.request('/upload', {
          method: 'POST',
          body: { id: fileId, name, mime, dataBase64: bytesToBase64(encrypted) },
        });

        await sendPayload(entry, 'file', {
          t: 'file',
          fileId,
          fileKey: bytesToBase64(fileKey),
          name,
          mime,
          size: bytes.length,
        });
      } finally {
        setBusy(false);
      }
    },
    [sendPayload],
  );

  const createDm = useCallback(async (username) => {
    const payload = await requestApi.request('/chats/dm', { method: 'POST', body: { username } });
    upsertChat(payload);
    return payload;
  }, [upsertChat]);

  const createGroup = useCallback(
    async (name, usernames) => {
      const payload = await requestApi.request('/chats/group', { method: 'POST', body: { name, usernames } });
      upsertChat(payload);
      await distributeGroupKey(payload.chat, payload.members, meRef.current.id).catch(() => {});
      bump();
      return payload;
    },
    [bump, upsertChat],
  );

  const addMembers = useCallback(
    async (entry, usernames) => {
      const payload = await requestApi.request(`/chats/${entry.chat.id}/members`, { method: 'POST', body: { usernames } });
      upsertChat(payload);
      // Existing holders hand the key to the newcomers.
      await shareHeldKey(entry.chat, payload.members.map((m) => m.id), meRef.current?.id).catch(() => {});
      return payload;
    },
    [upsertChat],
  );

  const removeMember = useCallback(async (entry, userId) => {
    await requestApi.request(`/chats/${entry.chat.id}/members/${userId}`, { method: 'DELETE' });
  }, []);

  const setTypingNow = useCallback((chatId) => sendEvent({ t: 'typing', chatId, typing: true }), []);

  const value = useMemo(
    () => ({
      me,
      ready,
      needsSetup,
      busy,
      chats,
      messages,
      typing,
      presence,
      decryptTick,
      configureServer,
      login,
      register,
      logout,
      refreshChats,
      openChat,
      markRead,
      sendText,
      sendReaction,
      sendFile,
      createDm,
      createGroup,
      addMembers,
      removeMember,
      setTypingNow,
      chatEntry,
      userById,
      isOnline: (userId) => !!presence[userId]?.online,
    }),
    [
      me,
      ready,
      needsSetup,
      busy,
      chats,
      messages,
      typing,
      presence,
      decryptTick,
      configureServer,
      login,
      register,
      logout,
      refreshChats,
      openChat,
      markRead,
      sendText,
      sendReaction,
      sendFile,
      createDm,
      createGroup,
      addMembers,
      removeMember,
      setTypingNow,
      chatEntry,
      userById,
    ],
  );

  return React.createElement(AppContext.Provider, { value }, children);
}

export { requestApi };
