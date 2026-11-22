import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  setRandomBytes,
  generateIdentity,
  identityPublicB64,
  deriveDmKey,
  newChatKey,
  wrapKey,
  unwrapKey,
  base64ToBytes,
  bytesToBase64,
} from './crypto';
import { request } from './api';

// React Native ships no WebCrypto, so we feed the pure-JS crypto from Expo.
setRandomBytes((n) => Crypto.getRandomBytes(n));

// SecureStore only accepts keys made of letters, digits, ".", "-" and "_",
// so the names below avoid colons.
const IDENTITY_SECRET = 'rafiq.identity.secret';
const IDENTITY_PUBLIC = 'rafiq.identity.public';
const keyStoreName = (chatId, version) => `rafiq.ck.${chatId}.${version}`;

// The key a direct chat used with a particular peer key. The fingerprint is
// the first bytes of that key, so the name stays short.
const dmKeyName = (chatId, peerKeyBytes) => {
  const fingerprint = bytesToBase64(peerKeyBytes).slice(0, 12).replace(/[^A-Za-z0-9]/g, '');
  return `rafiq.dm.${chatId}.${fingerprint}`;
};

// The list of archived keys of a direct chat, so they can be found again.
const dmIndexName = (chatId) => `rafiq.dmi.${chatId}`;

async function archiveDmKey(chatId, name, key) {
  await storage.set(name, bytesToBase64(key));
  const raw = await storage.get(dmIndexName(chatId));
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  if (!list.includes(name)) {
    list.push(name);
    await storage.set(dmIndexName(chatId), JSON.stringify(list));
  }
}

let identityCache = null;
const chatKeys = new Map(); // `${chatId}:${version}` -> Uint8Array

/**
 * Where the keys live.
 *
 * On a phone that is the hardware-backed keystore. The web build has no
 * SecureStore, so it falls back to local storage — fine for trying the app
 * out in a browser, but not what a real phone uses.
 */
const isWeb = typeof document !== 'undefined' && typeof window !== 'undefined';

const storage = {
  get: async (name) => {
    if (isWeb) {
      return globalThis.localStorage?.getItem(name) ?? null;
    }
    return SecureStore.getItemAsync(name);
  },
  set: async (name, value) => {
    if (isWeb) {
      globalThis.localStorage?.setItem(name, value);
      return;
    }
    await SecureStore.setItemAsync(name, value);
  },
};

export async function getIdentity() {
  if (identityCache) return identityCache;

  let secretB64 = await storage.get(IDENTITY_SECRET);
  let publicB64 = await storage.get(IDENTITY_PUBLIC);

  if (!secretB64 || !publicB64) {
    const fresh = generateIdentity();
    secretB64 = bytesToBase64(fresh.secretKey);
    publicB64 = bytesToBase64(fresh.publicKey);
    await storage.set(IDENTITY_SECRET, secretB64);
    await storage.set(IDENTITY_PUBLIC, publicB64);
  }

  identityCache = { secretKey: base64ToBytes(secretB64), publicKey: base64ToBytes(publicB64) };
  return identityCache;
}

export const myPublicKeyB64 = async () => identityPublicB64(await getIdentity());

/** Make sure the server knows our current public key. */
export async function publishPublicKey() {
  const publicKey = await myPublicKeyB64();
  const { user } = await request('/me');
  if (user.publicKey !== publicKey) {
    await request('/keys', { method: 'POST', body: { publicKey } });
    return true;
  }
  return false;
}

export async function fetchPublicKeys(usernames) {
  if (!usernames.length) return {};
  const { users } = await request('/keys/lookup', { method: 'POST', body: { usernames } });
  const map = {};
  for (const u of users) map[u.username] = u.publicKey;
  return map;
}

export async function fetchPublicKeysById(ids) {
  if (!ids.length) return {};
  const { users } = await request('/keys/lookup', { method: 'POST', body: { ids } });
  const map = {};
  for (const u of users) map[u.id] = u.publicKey;
  return map;
}

// ------------------------------------------------------------- chat keys

export async function getChatKey(chatId, version) {
  const cacheKey = `${chatId}:${version}`;
  if (chatKeys.has(cacheKey)) return chatKeys.get(cacheKey);

  const stored = await storage.get(keyStoreName(chatId, version));
  if (!stored) return null;

  const key = base64ToBytes(stored);
  chatKeys.set(cacheKey, key);
  return key;
}

export async function saveChatKey(chatId, version, key) {
  chatKeys.set(`${chatId}:${version}`, key);
  await storage.set(keyStoreName(chatId, version), bytesToBase64(key));
}

const pendingKeyRequests = new Map();

export const hasChatKey = (chatId, version) => chatKeys.has(`${chatId}:${version}`) || !!pendingKeyRequests.get(`${chatId}:${version}`);

/**
 * A direct-chat key is not transmitted at all: both sides derive it from
 * their own identity key and the peer's public key.
 *
 * The key is bound to the peer's public key. When the peer reinstalls and
 * publishes a new one, their new messages use a new key — so the new key
 * replaces the old one, and the old key is kept under the peer's old
 * fingerprint so the history stays readable.
 */
export async function ensureDmKey(chat, peerPublicKeyB64) {
  if (!peerPublicKeyB64) return null;

  const identity = await getIdentity();
  const peerKey = base64ToBytes(peerPublicKeyB64);
  const key = deriveDmKey(identity, { publicKey: peerKey });

  const existing = await getChatKey(chat.id, chat.keyVersion);
  if (!existing) {
    await saveChatKey(chat.id, chat.keyVersion, key);
    return key;
  }

  if (bytesToBase64(existing) === bytesToBase64(key)) return existing;

  // The peer changed their key. The key we have been using belongs to their
  // old public key, so it is filed under that fingerprint: the history stays
  // readable and the new key becomes the current one.
  await archiveDmKey(chat.id, dmKeyName(chat.id, peerKey), existing);
  await saveChatKey(chat.id, chat.keyVersion, key);
  return key;
}

/** The key a direct chat used while the peer had a given public key. */
export async function getDmKeyForPeer(chatId, peerPublicKeyB64) {
  if (!peerPublicKeyB64) return null;
  const stored = await storage.get(dmKeyName(chatId, base64ToBytes(peerPublicKeyB64)));
  return stored ? base64ToBytes(stored) : null;
}

/**
 * Every key we hold for a direct chat: the current one plus any left over
 * from a time when the peer had a different public key.
 */
export async function getDmKeyHistory(chatId, version) {
  const keys = [];
  const current = await getChatKey(chatId, version);
  if (current) keys.push(current);

  const index = await storage.get(dmIndexName(chatId));
  if (index) {
    for (const name of JSON.parse(index)) {
      const stored = await storage.get(name);
      if (!stored) continue;
      const key = base64ToBytes(stored);
      if (!keys.some((k) => bytesToBase64(k) === bytesToBase64(key))) keys.push(key);
    }
  }
  return keys;
}

/**
 * A group key is random. We wrap a copy for every other member; the server
 * stores the wrapped copies but can never open any of them.
 */
export async function distributeGroupKey(chat, members, myUserId) {
  const identity = await getIdentity();
  const key = newChatKey();
  await saveChatKey(chat.id, chat.keyVersion, key);

  for (const member of members) {
    if (member.id === myUserId || !member.publicKey) continue;
    const wrapped = bytesToBase64(wrapKey(identity, { publicKey: base64ToBytes(member.publicKey) }, key));
    await request(`/chats/${chat.id}/keys`, {
      method: 'POST',
      body: { keyVersion: chat.keyVersion, toUserIds: [member.id], body: wrapped },
    });
  }
  return key;
}

/** Wrap the key we already hold and hand it to specific members. */
export async function shareHeldKey(chat, memberIds, myUserId) {
  const key = await getChatKey(chat.id, chat.keyVersion);
  if (!key) return false;

  const identity = await getIdentity();
  const pubkeys = await fetchPublicKeysById(memberIds.filter((id) => id !== myUserId));

  for (const memberId of memberIds) {
    if (memberId === myUserId) continue;
    const theirKey = pubkeys[memberId];
    if (!theirKey) continue;
    const wrapped = bytesToBase64(wrapKey(identity, { publicKey: base64ToBytes(theirKey) }, key));
    await request(`/chats/${chat.id}/keys`, {
      method: 'POST',
      body: { keyVersion: chat.keyVersion, toUserIds: [memberId], body: wrapped },
    });
  }
  return true;
}

/** Open a wrapped key pushed to us over the socket. */
export async function acceptWrappedKey(packet, senderPublicKeyB64) {
  if (!senderPublicKeyB64) return false;
  const identity = await getIdentity();
  try {
    const key = unwrapKey(identity, { publicKey: base64ToBytes(senderPublicKeyB64) }, base64ToBytes(packet.body));
    await saveChatKey(packet.chatId, packet.keyVersion, key);
    return true;
  } catch {
    return false;
  }
}

/** Pull any wrapped keys the server has been holding for us. */
export async function syncStoredKeys(chatId, version) {
  const res = await request(`/chats/${chatId}/keys?version=${version}`);
  if (!res.keys.length) return false;

  const identity = await getIdentity();
  const senders = await fetchPublicKeysById([...new Set(res.keys.map((k) => k.fromUserId))]);

  for (const entry of res.keys) {
    const theirKey = senders[entry.fromUserId];
    if (!theirKey) continue;
    try {
      const key = unwrapKey(identity, { publicKey: base64ToBytes(theirKey) }, base64ToBytes(entry.body));
      await saveChatKey(chatId, entry.keyVersion, key);
    } catch {
      /* not for us, or from a key we do not have yet */
    }
  }
  return true;
}

/** Ask the current members for a key we are missing. */
export function requestKeyFrom(chatId, version, send) {
  const cacheKey = `${chatId}:${version}`;
  if (pendingKeyRequests.has(cacheKey)) return;
  pendingKeyRequests.set(cacheKey, Date.now());
  send({ t: 'keyreq', chatId, keyVersion: version });
  setTimeout(() => pendingKeyRequests.delete(cacheKey), 15000);
}
