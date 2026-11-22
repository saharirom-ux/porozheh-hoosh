// Plays the other half of a private chat from the terminal, so the flow can
// be checked while the app runs in a browser.
//
//   node test/peer.mjs <username> [message...]

import nodeCrypto from 'node:crypto';
import fs from 'node:fs';
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://127.0.0.1:4571';
const API = `${BASE}/api`;

const username = process.argv[2] || 'amir';
const messages = process.argv.slice(3);

const login = async () => {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'secret123' }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(data.error || 'login failed');
  return data;
};

const session = await login();
console.log(`signed in as ${username} (${session.user.id})`);

const identity = nodeCrypto.randomBytes(32);
const { x25519 } = await import('../../app/node_modules/@noble/curves/ed25519.js');
const { sha256 } = await import('../../app/node_modules/@noble/hashes/sha256.js');
const { hkdf } = await import('../../app/node_modules/@noble/hashes/hkdf.js');
const { utf8ToBytes } = await import('../../app/node_modules/@noble/hashes/utils.js');

const cryptoMod = await import('../../app/src/crypto.js');
cryptoMod.setRandomBytes((n) => new Uint8Array(nodeCrypto.randomBytes(n)));

// The identity key has to stay the same between runs, exactly like the app's
// key in the device keystore. Otherwise every run would change the chat key.
const IDENTITY_FILE = new URL(`./peer-${username}.key`, import.meta.url);
const secretKey = (() => {
  try {
    const saved = fs.readFileSync(IDENTITY_FILE);
    if (saved.length === 32) return saved;
  } catch {
    /* first run */
  }
  const fresh = nodeCrypto.randomBytes(32);
  fs.writeFileSync(IDENTITY_FILE, fresh);
  return fresh;
})();

const publicKey = x25519.scalarMultBase(secretKey);
const publicKeyB64 = cryptoMod.bytesToBase64(publicKey);

await fetch(`${API}/keys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
  body: JSON.stringify({ publicKey: publicKeyB64 }),
});
console.log('published public key');

// Find the chat with sara.
const chatsRes = await fetch(`${API}/chats`, { headers: { Authorization: `Bearer ${session.token}` } });
const { chats } = await chatsRes.json();
const dm = chats.find((c) => c.chat.type === 'dm');
if (!dm) {
  console.log('no direct chat yet');
  process.exit(0);
}
console.log(`chat with ${dm.members.map((m) => m.username).join(', ')} (id ${dm.chat.id})`);

// Derive the same key the app would: X25519 shared secret + HKDF over the
// two public keys in sorted order.
const peer = dm.members.find((m) => m.username !== username);
const lookup = await fetch(`${API}/keys/lookup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
  body: JSON.stringify({ usernames: [peer.username] }),
});
const { users } = await lookup.json();
const peerPublic = cryptoMod.base64ToBytes(users[0].publicKey);

const shared = x25519.getSharedSecret(secretKey, peerPublic);
const cmp = (a, b) => {
  for (let i = 0; i < 32; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};
const [lo, hi] = [publicKey, peerPublic].sort(cmp);
const info = cryptoMod.concatBytes(utf8ToBytes('rafiq-dm-v1|'), lo, hi);
const key = hkdf(sha256, shared, new Uint8Array(0), info, 32);
console.log('derived the chat key');

const socket = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?token=${session.token}`);
const inbox = [];
socket.on('message', (raw) => {
  const packet = JSON.parse(raw.toString());
  if (packet.t === 'msg') {
    const plain = cryptoMod.openJson(key, cryptoMod.messageAad(packet.msg), packet.msg.body);
    console.log(`\n<<< ${peer.username}: ${plain.text}`);
    inbox.push(packet.msg.id);
  }
});
await new Promise((r) => socket.once('open', r));
console.log('socket open, waiting for messages…');

for (const text of messages) {
  const body = cryptoMod.sealJson(
    key,
    cryptoMod.messageAad({ chatId: dm.chat.id, senderId: session.user.id, keyVersion: dm.chat.keyVersion, kind: 'text' }),
    { t: 'text', text },
  );
  socket.send(JSON.stringify({ t: 'send', chatId: dm.chat.id, keyVersion: dm.chat.keyVersion, kind: 'text', body }));
  console.log(`>>> sent: ${text}`);
  await new Promise((r) => setTimeout(r, 800));
}

if (!messages.length) {
  // Just stay connected so the app can deliver into this peer.
  await new Promise((r) => setTimeout(r, 30000));
}
socket.close();
process.exit(0);
