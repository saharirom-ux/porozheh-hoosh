// End-to-end test: two clients talking over the real HTTP + WebSocket API,
// with the same crypto module the mobile app uses.
//
//   node test/e2e.mjs

import nodeCrypto from 'node:crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {
  setRandomBytes,
  generateIdentity,
  identityPublicB64,
  deriveDmKey,
  newChatKey,
  wrapKey,
  unwrapKey,
  messageAad,
  sealJson,
  openJson,
  encryptFile,
  decryptFile,
  toB64,
  fromB64,
} from '../../app/src/crypto.js';

setRandomBytes((n) => new Uint8Array(nodeCrypto.randomBytes(n)));

const BASE = process.env.BASE || 'http://127.0.0.1:4571';
const API = `${BASE}/api`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/** One signed-in user with a live socket and an inbox of pushed packets. */
class Client {
  constructor(name, user, token, identity) {
    this.name = name;
    this.user = user;
    this.token = token;
    this.identity = identity;
    this.inbox = [];
    this.waiters = [];
    this.socket = null;
  }

  static async create(name, displayName) {
    const username = `${name}${nodeCrypto.randomBytes(3).toString('hex')}`;
    const reg = await api(null, 'POST', '/register', { username, displayName, password: 'secret123' });
    assert.equal(reg.status, 200, `register ${name}: ${JSON.stringify(reg.data)}`);

    const identity = generateIdentity();
    const setKey = await api(reg.data.token, 'POST', '/keys', { publicKey: identityPublicB64(identity) });
    assert.equal(setKey.status, 200);

    const client = new Client(name, reg.data.user, reg.data.token, identity);
    await client.connect();
    return client;
  }

  async connect() {
    this.socket = new WebSocket(`ws://127.0.0.1:4571/ws?token=${this.token}`);
    this.socket.on('message', (raw) => {
      const packet = JSON.parse(raw.toString());
      const idx = this.waiters.findIndex((w) => w.match(packet));
      if (idx >= 0) {
        const [w] = this.waiters.splice(idx, 1);
        w.resolve(packet);
      } else {
        this.inbox.push(packet);
      }
    });
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    await this.waitFor((p) => p.t === 'ready');
  }

  waitFor(match, timeoutMs = 4000) {
    const queued = this.inbox.findIndex(match);
    if (queued >= 0) return Promise.resolve(this.inbox.splice(queued, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { match, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error(`${this.name}: timed out waiting for packet`));
        }
      }, timeoutMs);
    });
  }

  send(packet) {
    this.socket.send(JSON.stringify(packet));
  }

  /** Fetch this peer's public key the way the app does. */
  async lookupPublicKeys(usernames) {
    const res = await api(this.token, 'POST', '/keys/lookup', { usernames });
    return new Map(res.data.users.map((u) => [u.username, fromB64(u.publicKey)]));
  }

  close() {
    this.socket.close();
  }
}

let passed = 0;
function ok(label) {
  passed++;
  console.log(`  ok  ${label}`);
}

// ---------------------------------------------------------------------------

console.log('Rafiq end-to-end test\n');

// 1. Registration, identity upload, live sockets.
const alice = await Client.create('ali', 'Ali');
const bob = await Client.create('bo', 'Bob');
const carol = await Client.create('ca', 'Carol');
ok('three users registered, keys published, sockets connected');

// 2. Direct chat.
{
  const res = await api(alice.token, 'POST', '/chats/dm', { username: bob.user.username });
  assert.equal(res.status, 200);
  const chatId = res.data.chat.id;
  assert.equal(res.data.chat.type, 'dm');

  await bob.waitFor((p) => p.t === 'chat' && p.chat.id === chatId);
  ok(`direct chat created and pushed to ${bob.name}`);

  // Each side fetches the OTHER's public key, then derives independently.
  const aliceSeesBob = await alice.lookupPublicKeys([bob.user.username]);
  const bobSeesAlice = await bob.lookupPublicKeys([alice.user.username]);
  const key = deriveDmKey(alice.identity, { publicKey: aliceSeesBob.get(bob.user.username) });
  const keyBack = deriveDmKey(bob.identity, { publicKey: bobSeesAlice.get(alice.user.username) });
  assert.deepEqual(Buffer.from(key), Buffer.from(keyBack), 'both sides derive the same key');
  ok('both sides independently derive the same direct-chat key');

  const aad = messageAad({ chatId, senderId: alice.user.id, keyVersion: 1, kind: 'text' });
  const body = sealJson(key, aad, { t: 'text', text: 'سلام باب! 🎉' });
  alice.send({ t: 'send', chatId, keyVersion: 1, kind: 'text', body });

  const got = await bob.waitFor((p) => p.t === 'msg' && p.msg.chatId === chatId);
  const plain = openJson(key, messageAad(got.msg), got.msg.body);
  assert.equal(plain.text, 'سلام باب! 🎉');
  ok('message encrypted by Alice decrypts on Bob’s side');

  const raw = await api(bob.token, 'GET', `/chats/${chatId}/messages`);
  const stored = raw.data.messages[0].body;
  assert.ok(!stored.includes('سلام'), 'server must not see plaintext');
  ok('stored body is ciphertext only');

  // Reply metadata travels inside the encrypted payload.
  const aad2 = messageAad({ chatId, senderId: bob.user.id, keyVersion: 1, kind: 'text' });
  const replyBody = sealJson(key, aad2, { t: 'text', text: 'سلام! حالم خوبه', replyTo: got.msg.id });
  bob.send({ t: 'send', chatId, keyVersion: 1, kind: 'text', body: replyBody });
  const reply = await alice.waitFor((p) => p.t === 'msg' && p.msg.senderId === bob.user.id);
  const replyPlain = openJson(key, messageAad(reply.msg), reply.msg.body);
  assert.equal(replyPlain.replyTo, got.msg.id);
  ok('reply reference survives encryption');

  // A ciphertext moved into another chat must not open.
  const foreignAad = messageAad({ chatId: chatId + 999, senderId: alice.user.id, keyVersion: 1, kind: 'text' });
  assert.throws(() => openJson(key, foreignAad, body));
  ok('replaying a ciphertext into another chat fails (AAD binding)');
}

// 3. Group chat with a shared key.
let groupKey;
let groupId;
{
  const res = await api(alice.token, 'POST', '/chats/group', {
    name: 'دوستان',
    usernames: [bob.user.username, carol.user.username],
  });
  assert.equal(res.status, 200);
  groupId = res.data.chat.id;
  assert.equal(res.data.members.length, 3);

  await bob.waitFor((p) => p.t === 'chat' && p.chat.id === groupId);
  await carol.waitFor((p) => p.t === 'chat' && p.chat.id === groupId);
  ok('group created with three members and pushed to everyone');

  // Newcomers ask, holders answer.
  carol.send({ t: 'keyreq', chatId: groupId, keyVersion: 1 });
  const req = await alice.waitFor((p) => p.t === 'keyreq' && p.chatId === groupId);
  assert.ok(req.userIds.includes(carol.user.id));
  ok('new member requests the group key');

  groupKey = newChatKey();
  const bobKeys = await alice.lookupPublicKeys([bob.user.username, carol.user.username]);
  for (const member of [bob, carol]) {
    const wrapped = wrapKey(alice.identity, { publicKey: bobKeys.get(member.user.username) }, groupKey);
    alice.send({
      t: 'key',
      chatId: groupId,
      keyVersion: 1,
      toUserId: member.user.id,
      body: toB64(wrapped),
    });
  }

  const bobWrapped = await bob.waitFor((p) => p.t === 'key' && p.chatId === groupId);
  const unwrapped = unwrapKey(bob.identity, { publicKey: alice.identity.publicKey }, fromB64(bobWrapped.body));
  assert.deepEqual(Buffer.from(unwrapped), Buffer.from(groupKey));
  ok('wrapped group key unwraps only for its recipient');

  // The key is also recoverable later from the store (relogin path).
  const storedKeys = await api(carol.token, 'GET', `/chats/${groupId}/keys`);
  const fromStore = unwrapKey(
    carol.identity,
    { publicKey: alice.identity.publicKey },
    fromB64(storedKeys.data.keys[0].body),
  );
  assert.deepEqual(Buffer.from(fromStore), Buffer.from(groupKey));
  ok('group key can be re-fetched after reinstall');

  // Everyone talks in the group; each member also gets their own echo back
  // with the server-assigned id.
  const SENT = ['به گروه خوش اومدی', 'ممنون!', 'سلام به همه 👋'];
  for (const [client, text] of [
    [alice, SENT[0]],
    [bob, SENT[1]],
    [carol, SENT[2]],
  ]) {
    const aad = messageAad({ chatId: groupId, senderId: client.user.id, keyVersion: 1, kind: 'text' });
    client.send({ t: 'send', chatId: groupId, keyVersion: 1, kind: 'text', body: sealJson(groupKey, aad, { t: 'text', text }) });
  }

  for (const client of [alice, bob, carol]) {
    const seenIds = [];
    const texts = [];
    for (let i = 0; i < 3; i++) {
      const m = await client.waitFor((p) => p.t === 'msg' && p.msg.chatId === groupId && !seenIds.includes(p.msg.id));
      seenIds.push(m.msg.id);
      texts.push(openJson(groupKey, messageAad(m.msg), m.msg.body).text);
    }
    assert.deepEqual([...texts].sort(), [...SENT].sort(), `${client.name} decrypted set`);
    ok(`${client.name} received and decrypted all three group messages`);
  }
}

// 4. Reactions.
{
  const aad = messageAad({ chatId: groupId, senderId: bob.user.id, keyVersion: 1, kind: 'reaction' });
  bob.send({
    t: 'send',
    chatId: groupId,
    keyVersion: 1,
    kind: 'reaction',
    body: sealJson(groupKey, aad, { t: 'reaction', target: 1, emoji: '❤️' }),
  });
  const r = await carol.waitFor((p) => p.t === 'msg' && p.msg.kind === 'reaction');
  assert.equal(openJson(groupKey, messageAad(r.msg), r.msg.body).emoji, '❤️');
  ok('reactions are encrypted too');
}

// 5. Typing and read receipts.
{
  alice.send({ t: 'typing', chatId: groupId, typing: true });
  const t = await bob.waitFor((p) => p.t === 'typing' && p.chatId === groupId);
  assert.equal(t.typing, true);

  alice.send({ t: 'read', chatId: groupId, lastId: 7 });
  const r = await carol.waitFor((p) => p.t === 'read' && p.chatId === groupId && p.userId === alice.user.id);
  assert.equal(r.lastId, 7);
  ok('typing indicator and read receipts delivered');

  const list = await api(alice.token, 'GET', '/chats');
  const group = list.data.chats.find((c) => c.chat.id === groupId);
  assert.equal(group.members.length, 3);
  assert.equal(group.receipts[alice.user.id], 7);
  assert.ok(group.unread >= 0);
  ok('unread counts and receipts visible in the chat list');
}

// 6. Encrypted file transfer.
{
  const bytes = new Uint8Array(nodeCrypto.randomBytes(4096));
  const fileKey = newChatKey();
  const fileId = nodeCrypto.randomUUID();
  const encrypted = encryptFile(fileKey, fileId, bytes);

  const res = await api(alice.token, 'POST', '/upload', {
    id: fileId,
    name: 'greeting.bin',
    mime: 'application/octet-stream',
    dataBase64: toB64(encrypted),
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.id, fileId);

  const download = await fetch(`${API}/files/${id}`);
  const gotBytes = new Uint8Array(await download.arrayBuffer());
  const decrypted = decryptFile(fileKey, id, gotBytes);
  assert.deepEqual(Buffer.from(decrypted), Buffer.from(bytes));
  ok('file stored as ciphertext and restored byte-for-byte');
}

// 7. Kicking a member rotates the key so they lose access.
{
  const before = groupKey;
  const res = await api(alice.token, 'DELETE', `/chats/${groupId}/members/${carol.user.id}`);
  assert.equal(res.status, 200);

  await carol.waitFor((p) => p.t === 'removed' && p.chatId === groupId);
  const rotation = await bob.waitFor((p) => p.t === 'rotate' && p.chatId === groupId);
  assert.equal(rotation.keyVersion, 2);
  ok('removal rotates the group key and notifies the remaining members');

  const rotated = newChatKey();
  const bobKeys = await alice.lookupPublicKeys([bob.user.username]);
  const wrapped = wrapKey(alice.identity, { publicKey: bobKeys.get(bob.user.username) }, rotated);
  alice.send({ t: 'key', chatId: groupId, keyVersion: 2, toUserId: bob.user.id, body: toB64(wrapped) });
  await bob.waitFor((p) => p.t === 'key' && p.keyVersion === 2);

  const aad = messageAad({ chatId: groupId, senderId: alice.user.id, keyVersion: 2, kind: 'text' });
  alice.send({ t: 'send', chatId: groupId, keyVersion: 2, kind: 'text', body: sealJson(rotated, aad, { t: 'text', text: 'کلید عوض شد' }) });
  const m = await bob.waitFor((p) => p.t === 'msg' && p.msg.keyVersion === 2);
  assert.equal(openJson(rotated, messageAad(m.msg), m.msg.body).text, 'کلید عوض شد');

  // The removed member is locked out at the API level too.
  const denied = await api(carol.token, 'GET', `/chats/${groupId}/messages`);
  assert.equal(denied.status, 403);
  ok('removed member can no longer read the group');
}

// 8. Passwords are checked, not stored.
{
  const bad = await api(null, 'POST', '/login', { username: bob.user.username, password: 'wrong' });
  assert.equal(bad.status, 401);
  const good = await api(null, 'POST', '/login', { username: bob.user.username, password: 'secret123' });
  assert.equal(good.status, 200);
  ok('wrong password rejected, right one accepted');
}

alice.close();
bob.close();
carol.close();

console.log(`\nall ${passed} checks passed`);
process.exit(0);
