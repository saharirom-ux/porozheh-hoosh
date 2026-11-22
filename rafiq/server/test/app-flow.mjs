// Headless test of the app's own store logic against the real server.
//
// The React screens cannot run in Node, but everything they depend on — the
// API client, the key manager, the crypto module — can. This drives the same
// sequence the app does when two friends open a private chat:
//
//   register → publish key → create DM → derive key → send → receive → decrypt
//
//   node test/app-flow.mjs

import nodeCrypto from 'node:crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

// The app modules talk to Expo's crypto for randomness and to SecureStore for
// key storage. Both are replaced with Node equivalents by the loader, so
// nothing else in the app changes.

const BASE = process.env.BASE || 'http://127.0.0.1:4571';

const { request, saveServer, saveToken, searchUsers } = await import('../../app/src/api.js');
const { setRandomBytes, generateIdentity, identityPublicB64, deriveDmKey, openJson, messageAad } = await import(
  '../../app/src/crypto.js'
);

setRandomBytes((n) => new Uint8Array(nodeCrypto.randomBytes(n)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
function ok(label) {
  passed++;
  console.log(`  ok  ${label}`);
}

/**
 * One signed-in friend.
 *
 * The api module keeps the token in a module-level variable, so a second
 * friend needs a second instance of the module. Importing it with a distinct
 * query string gives exactly that: separate module state, same source code.
 */
async function makeClient(name) {
  const stamp = `${name}${nodeCrypto.randomBytes(3).toString('hex')}`;
  const api = await import(`../../app/src/api.js?u=${stamp}`);
  const crypto = await import(`../../app/src/crypto.js?u=${stamp}`);
  crypto.setRandomBytes((n) => new Uint8Array(nodeCrypto.randomBytes(n)));
  // The key manager must use the very same crypto module, so that the
  // identity it stores and the one this test holds are the same bytes.
  const keys = await import(`../../app/src/keys.js?u=${stamp}`);

  // Point the client's own api module at the test server.
  await api.saveServer(BASE);

  const username = `${name}${nodeCrypto.randomBytes(3).toString('hex')}`;
  const reg = await api.request('/register', { method: 'POST', body: { username, displayName: name, password: 'secret123' } });
  assert.ok(reg.token, 'register returns a token');

  // The app stores the token before making any authenticated call.
  await api.saveToken(reg.token);

  // The identity lives in the key manager's own storage, so that is where it
  // has to come from — the same one the app would use on the device.
  const identity = await keys.getIdentity();
  const publicKeyB64 = await keys.myPublicKeyB64();
  await api.request('/keys', { method: 'POST', body: { publicKey: publicKeyB64 } });

  return {
    name,
    username,
    token: reg.token,
    user: reg.user,
    identity,
    api,
    keys,
    crypto,
    socket: null,
    inbox: [],
    waiters: [],
  };
}

function connect(client) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?token=${client.token}`);
    ws.on('message', (raw) => {
      const packet = JSON.parse(raw.toString());
      const idx = client.waiters.findIndex((w) => w.match(packet));
      if (idx >= 0) {
        const [w] = client.waiters.splice(idx, 1);
        w.resolve(packet);
      } else {
        client.inbox.push(packet);
      }
    });
    ws.once('open', resolve);
    ws.once('error', reject);
    client.socket = ws;
  });
}

function waitFor(client, match, timeoutMs = 4000) {
  const queued = client.inbox.findIndex(match);
  if (queued >= 0) return Promise.resolve(client.inbox.splice(queued, 1)[0]);
  return new Promise((resolve, reject) => {
    const w = { match, resolve };
    client.waiters.push(w);
    setTimeout(() => {
      const i = client.waiters.indexOf(w);
      if (i >= 0) {
        client.waiters.splice(i, 1);
        reject(new Error(`${client.name}: timed out waiting for packet`));
      }
    }, timeoutMs);
  });
}

console.log('Rafiq app-flow test\n');

// The ids of the messages we have already handled, so a later wait does not
// pick up an old packet.
const seenMessageIds = new Set();

// --------------------------------------------------------------- setup
const alice = await makeClient('ali');
const bob = await makeClient('bo');
await connect(alice);
await connect(bob);
assert.notEqual(alice.token, bob.token, 'the two friends have separate sessions');
assert.equal(await alice.api.loadToken(), alice.token, 'each client keeps its own token');
assert.equal(await bob.api.loadToken(), bob.token, 'each client keeps its own token');
ok('two friends registered, published their keys and opened sockets');

// ---------------------------------------------- find a friend (as the app does)
{
  const users = await alice.api.searchUsers('bo');
  assert.ok(users.some((u) => u.username === bob.username), 'search finds the friend');
  ok('searching for a friend by name works');
}

// ------------------------------------------------- create the private chat
const dm = await alice.api.request('/chats/dm', { method: 'POST', body: { username: bob.username } });
assert.equal(dm.chat.type, 'dm');
const chatId = dm.chat.id;

const bobSeesChat = await waitFor(bob, (p) => p.t === 'chat' && p.chat.id === chatId);
assert.equal(bobSeesChat.chat.id, chatId);
ok('creating a private chat pushes it to the friend');

// ------------------------------------- both sides derive the same key alone
const bobPub = (await alice.api.request('/keys/lookup', { method: 'POST', body: { usernames: [bob.username] } })).users[0]
  .publicKey;
const alicePub = (await bob.api.request('/keys/lookup', { method: 'POST', body: { usernames: [alice.username] } })).users[0]
  .publicKey;

const aliceKey = alice.crypto.deriveDmKey(alice.identity, { publicKey: alice.crypto.base64ToBytes(bobPub) });
const bobKey = bob.crypto.deriveDmKey(bob.identity, { publicKey: bob.crypto.base64ToBytes(alicePub) });
assert.deepEqual(Buffer.from(aliceKey), Buffer.from(bobKey), 'both derive the same key');
ok('both sides derive the same private-chat key without exchanging it');

// ------------------------------- the app stores the key under its chat id
await alice.keys.saveChatKey(chatId, dm.chat.keyVersion, aliceKey);
const stored = await alice.keys.getChatKey(chatId, dm.chat.keyVersion);
assert.deepEqual(Buffer.from(stored), Buffer.from(aliceKey));
ok('the derived key is stored and read back from device storage');

// ---------------------------------------------- send and receive a message
const payload = { t: 'text', text: 'سلام! این پیام فقط بین ما دو نفر است 🔒' };
const body = alice.crypto.sealJson(
  aliceKey,
  messageAad({ chatId, senderId: alice.user.id, keyVersion: dm.chat.keyVersion, kind: 'text' }),
  payload,
);

alice.socket.send(
  JSON.stringify({ t: 'send', chatId, keyVersion: dm.chat.keyVersion, kind: 'text', body }),
);

const received = await waitFor(bob, (p) => p.t === 'msg' && p.msg.chatId === chatId);
seenMessageIds.add(received.msg.id);
const opened = bob.crypto.openJson(bobKey, messageAad(received.msg), received.msg.body);
assert.equal(opened.text, payload.text);
ok('the friend decrypts the message with the key derived on their side');

// ---------------------------------------- the server stores only ciphertext
const history = await bob.api.request(`/chats/${chatId}/messages`);
assert.ok(!history.messages[0].body.includes('سلام'), 'server must not see plaintext');
ok('the server only ever holds ciphertext');

// --------------------------------------------- the friend finds the chat
const list = await bob.api.request('/chats');
const entry = list.chats.find((c) => c.chat.id === chatId);
assert.ok(entry, 'the chat shows up in the friend chat list');
assert.equal(entry.unread, 1, 'the message counts as unread for the friend');
ok('the chat appears in the list with an unread count');

// --------------------------------------------------- marking it as read
await bob.api.request(`/chats/${chatId}/read`, { method: 'POST', body: { lastId: received.msg.id } });
const after = await bob.api.request('/chats');
const readEntry = after.chats.find((c) => c.chat.id === chatId);
assert.equal(readEntry.unread, 0);
assert.equal(readEntry.receipts[alice.user.id], undefined, 'the reader is not listed as a receipt holder for the sender');
assert.ok(readEntry.receipts[bob.user.id] >= received.msg.id);
ok('reading the chat clears the unread badge and records the receipt');

// ------------------------------------- the friend reinstalls: new identity key
{
  // Bob wipes his device and comes back with a new identity, so the key he
  // publishes changes. Alice has to pick up the new one, or every message he
  // sends from now on stays locked.
  //
  // The account stays the same; only the identity key on the device changes.
  const newIdentity = bob.crypto.generateIdentity();
  const newPublic = bob.crypto.identityPublicB64(newIdentity);
  await bob.api.request('/keys', { method: 'POST', body: { publicKey: newPublic } });

  const lookup = await alice.api.request('/keys/lookup', {
    method: 'POST',
    body: { usernames: [bob.username] },
  });
  assert.equal(lookup.users[0].publicKey, newPublic, 'the server holds the new key');

  // Alice opens the chat and must end up with the key derived from the new
  // public key, not the one she had before.
  const chatEntry = (await alice.api.request('/chats')).chats.find((c) => c.chat.id === chatId);
  await alice.keys.saveChatKey(chatId, chatEntry.chat.keyVersion, aliceKey); // the stale key
  const fresh = await alice.keys.ensureDmKey(chatEntry.chat, newPublic);
  const expected = alice.crypto.deriveDmKey(alice.identity, {
    publicKey: alice.crypto.base64ToBytes(newPublic),
  });
  assert.deepEqual(
    Buffer.from(fresh),
    Buffer.from(expected),
    `the key follows the new public key (got ${alice.crypto.bytesToBase64(fresh)} want ${alice.crypto.bytesToBase64(expected)})`,
  );
  ok('a friend who reinstalls gets a fresh key, not the stale one');

  // The old key is kept, so the earlier messages still open.
  const history = await alice.keys.getDmKeyHistory(chatId, chatEntry.chat.keyVersion);
  assert.ok(history.length >= 2, 'both the old and the new key are kept');
  assert.ok(
    history.some((k) => alice.crypto.bytesToBase64(k) === alice.crypto.bytesToBase64(aliceKey)),
    'the key used before the reinstall is still there',
  );
  ok('the previous key is kept, so the history stays readable');

  // Bob's new messages open with that key.
  const bobNewKey = bob.crypto.deriveDmKey(newIdentity, {
    publicKey: bob.crypto.base64ToBytes(alicePub),
  });
  const aliceFresh = alice.crypto.deriveDmKey(alice.identity, {
    publicKey: alice.crypto.base64ToBytes(newPublic),
  });
  assert.deepEqual(
    Buffer.from(bobNewKey),
    Buffer.from(aliceFresh),
    `both sides agree on the new key (bob ${bob.crypto.bytesToBase64(bobNewKey)} alice ${alice.crypto.bytesToBase64(aliceFresh)})`,
  );
  const newBody = bob.crypto.sealJson(
    bobNewKey,
    messageAad({ chatId, senderId: bob.user.id, keyVersion: chatEntry.chat.keyVersion, kind: 'text' }),
    { t: 'text', text: 'پیام بعد از نصب دوباره' },
  );

  bob.socket.send(
    JSON.stringify({ t: 'send', chatId, keyVersion: chatEntry.chat.keyVersion, kind: 'text', body: newBody }),
  );
  // Wait for a packet that is not one of the earlier ones.
  const freshMsg = await waitFor(
    alice,
    (p) => p.t === 'msg' && p.msg.chatId === chatId && !seenMessageIds.has(p.msg.id),
  );
  seenMessageIds.add(freshMsg.msg.id);
  const opened = alice.crypto.openJson(fresh, messageAad(freshMsg.msg), freshMsg.msg.body);
  assert.equal(opened.text, 'پیام بعد از نصب دوباره');
  ok('messages sent after the reinstall open with the new key');
}

// ------------------------------------------- a locked chat stays readable-only
{
  const other = await makeClient('ca');
  await connect(other);
  const strangerDm = await other.api.request('/chats/dm', { method: 'POST', body: { username: alice.username } });
  const aliceNow = (await other.api.request('/keys/lookup', {
    method: 'POST',
    body: { usernames: [alice.username] },
  })).users[0].publicKey;
  const strangerKey = other.crypto.deriveDmKey(other.identity, {
    publicKey: other.crypto.base64ToBytes(aliceNow),
  });
  const strangerBody = other.crypto.sealJson(
    strangerKey,
    messageAad({
      chatId: strangerDm.chat.id,
      senderId: other.user.id,
      keyVersion: strangerDm.chat.keyVersion,
      kind: 'text',
    }),
    { t: 'text', text: 'پیام از یک گفتگوی دیگر' },
  );
  other.socket.send(
    JSON.stringify({
      t: 'send',
      chatId: strangerDm.chat.id,
      keyVersion: strangerDm.chat.keyVersion,
      kind: 'text',
      body: strangerBody,
    }),
  );
  await waitFor(alice, (p) => p.t === 'msg' && p.msg.chatId === strangerDm.chat.id);

  // Alice tries to open it with the key of the *other* chat: it must fail.
  assert.throws(
    () => alice.crypto.openJson(aliceKey, messageAad({ chatId: strangerDm.chat.id, senderId: other.user.id, keyVersion: 1, kind: 'text' }), strangerBody),
    'a key from another chat must not open it',
  );
  ok('a message from another private chat cannot be opened with this chat key');
  other.socket.close();
}

// ----------------------------------------------------------- key rotation
{
  const group = await alice.api.request('/chats/group', {
    method: 'POST',
    body: { name: 'گروه تست', usernames: [bob.username] },
  });
  const groupId = group.chat.id;
  await waitFor(bob, (p) => p.t === 'chat' && p.chat.id === groupId);

  const groupKey = alice.crypto.newChatKey();
  for (const member of [bob]) {
    const pub = (await alice.api.request('/keys/lookup', { method: 'POST', body: { usernames: [member.username] } })).users[0]
      .publicKey;
    const wrapped = alice.crypto.bytesToBase64(
      alice.crypto.wrapKey(alice.identity, { publicKey: alice.crypto.base64ToBytes(pub) }, groupKey),
    );
    alice.socket.send(
      JSON.stringify({ t: 'key', chatId: groupId, keyVersion: group.chat.keyVersion, toUserId: member.user.id, body: wrapped }),
    );
  }

  const wrappedPacket = await waitFor(bob, (p) => p.t === 'key' && p.chatId === groupId);
  const unwrapped = bob.crypto.unwrapKey(
    bob.identity,
    { publicKey: alice.identity.publicKey },
    bob.crypto.base64ToBytes(wrappedPacket.body),
  );
  assert.deepEqual(Buffer.from(unwrapped), Buffer.from(groupKey));
  ok('the group key arrives wrapped and only the recipient can open it');

  // The friend stores it under its own chat id and version.
  await bob.keys.saveChatKey(groupId, group.chat.keyVersion, unwrapped);
  const held = await bob.keys.getChatKey(groupId, group.chat.keyVersion);
  assert.deepEqual(Buffer.from(held), Buffer.from(groupKey));
  ok('the friend stores the group key on their device');
}

alice.socket.close();
bob.socket.close();

console.log(`\nall ${passed} checks passed`);
process.exit(0);
