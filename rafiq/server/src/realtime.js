import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import * as store from './db.js';

/** userId -> Set<WebSocket> (a user may be connected from several devices) */
const sockets = new Map();
/** ws -> userId */
const owners = new WeakMap();
const lastSeen = new Map();

export function isOnline(userId) {
  return (sockets.get(userId)?.size || 0) > 0;
}

export function sendTo(userId, packet) {
  const set = sockets.get(userId);
  if (!set) return false;
  const data = JSON.stringify(packet);
  let delivered = false;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
      delivered = true;
    }
  }
  return delivered;
}

/** Everyone who shares at least one chat with `userId`. */
export function contactsOf(userId) {
  const rows = store.db
    .prepare(
      `SELECT DISTINCT m2.user_id AS id FROM chat_members m1
       JOIN chat_members m2 ON m2.chat_id = m1.chat_id AND m2.user_id <> m1.user_id
       WHERE m1.user_id = ?`,
    )
    .all(userId);
  return rows.map((r) => r.id);
}

export function broadcastToContacts(userId, packet) {
  for (const id of contactsOf(userId)) sendTo(id, packet);
}

export function broadcastToChat(chatId, packet, exceptUserId = null) {
  for (const id of store.memberIds(chatId)) {
    if (id !== exceptUserId) sendTo(id, packet);
  }
}

export const presenceOf = (userId) => ({ userId, online: isOnline(userId), lastSeen: lastSeen.get(userId) || null });

function announcePresence(userId) {
  const packet = { t: 'presence', ...presenceOf(userId) };
  for (const id of contactsOf(userId)) sendTo(id, packet);
}

// ------------------------------------------------------------- handlers

const handlers = {
  ping(ws) {
    ws.send(JSON.stringify({ t: 'pong' }));
  },

  send(ws, msg, userId) {
    const chatId = Number(msg.chatId);
    if (!store.isMember(chatId, userId)) return fail(ws, 'not a member');
    if (typeof msg.body !== 'string' || !msg.body) return fail(ws, 'empty body');

    const chat = store.getChat(chatId);
    const keyVersion = Number(msg.keyVersion) || chat.key_version;

    const row = store.insertMessage({
      chatId,
      senderId: userId,
      keyVersion,
      kind: ['text', 'reaction', 'system', 'file'].includes(msg.kind) ? msg.kind : 'text',
      body: msg.body,
    });

    broadcastToChat(chatId, { t: 'msg', msg: wire(row) });
  },

  typing(ws, msg, userId) {
    const chatId = Number(msg.chatId);
    if (!store.isMember(chatId, userId)) return;
    broadcastToChat(chatId, { t: 'typing', chatId, userId, typing: !!msg.typing }, userId);
  },

  read(ws, msg, userId) {
    const chatId = Number(msg.chatId);
    if (!store.isMember(chatId, userId)) return;
    const lastId = Number(msg.lastId) || 0;
    store.setReceipt(chatId, userId, lastId);
    broadcastToChat(chatId, { t: 'read', chatId, userId, lastId, at: Date.now() }, userId);
  },

  /** Deliver a chat key, wrapped for exactly one recipient. */
  key(ws, msg, userId) {
    const chatId = Number(msg.chatId);
    if (!store.isMember(chatId, userId)) return fail(ws, 'not a member');
    const forUserId = Number(msg.toUserId);
    if (!store.isMember(chatId, forUserId)) return fail(ws, 'recipient not in chat');
    if (typeof msg.body !== 'string' || !msg.body) return fail(ws, 'empty key');

    const keyVersion = Number(msg.keyVersion) || store.getChat(chatId).key_version;
    store.putWrappedKey({ chatId, forUserId, keyVersion, fromUserId: userId, body: msg.body });
    sendTo(forUserId, { t: 'key', chatId, keyVersion, fromUserId: userId, body: msg.body });
  },

  /** Ask the current members to hand me the chat key. */
  keyreq(ws, msg, userId) {
    const chatId = Number(msg.chatId);
    if (!store.isMember(chatId, userId)) return;
    const keyVersion = Number(msg.keyVersion) || store.getChat(chatId).key_version;
    broadcastToChat(chatId, { t: 'keyreq', chatId, keyVersion, userIds: [userId] }, userId);
  },
};

const wire = (row) => ({
  id: row.id,
  chatId: row.chat_id,
  senderId: row.sender_id,
  keyVersion: row.key_version,
  kind: row.kind,
  body: row.body,
  createdAt: row.created_at,
});

function fail(ws, error) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'error', error }));
}

export function startRealtime(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const payload = verifyToken(url.searchParams.get('token') || '');
    if (!payload) {
      ws.close(4401, 'unauthorized');
      return;
    }
    const userId = payload.sub;
    if (!store.getUserById(userId)) {
      ws.close(4401, 'unknown user');
      return;
    }

    if (!sockets.has(userId)) sockets.set(userId, new Set());
    sockets.get(userId).add(ws);
    owners.set(ws, userId);

    ws.send(JSON.stringify({ t: 'ready', user: userId, at: Date.now() }));
    announcePresence(userId);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return fail(ws, 'bad packet');
      }
      const handler = handlers[msg?.t];
      if (!handler) return fail(ws, `unknown type: ${msg?.t}`);
      try {
        handler(ws, msg, userId);
      } catch (err) {
        console.error('ws handler error', err);
        fail(ws, 'server error');
      }
    });

    ws.on('close', () => {
      const set = sockets.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          sockets.delete(userId);
          lastSeen.set(userId, Date.now());
          announcePresence(userId);
        }
      }
    });

    ws.on('error', () => ws.close());
  });

  return wss;
}
