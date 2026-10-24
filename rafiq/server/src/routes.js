import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { hashPassword, verifyPassword, signToken, bearerOf, verifyToken } from './auth.js';
import * as store from './db.js';
import { sendTo, broadcastToChat, isOnline, presenceOf, contactsOf, broadcastToContacts } from './realtime.js';

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;
const NAME_MAX = 40;

const bad = (res, message, status = 400) => res.status(status).json({ error: message });
const cleanName = (s) => String(s || '').trim().slice(0, NAME_MAX);

function requireAuth(req, res, next) {
  const payload = verifyToken(bearerOf(req) || '');
  if (!payload) return bad(res, 'unauthorized', 401);
  const user = store.getUserById(payload.sub);
  if (!user) return bad(res, 'unauthorized', 401);
  req.user = user;
  next();
}

// ------------------------------------------------------------------ auth

router.post('/register', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const displayName = cleanName(req.body?.displayName) || username;
  const password = String(req.body?.password || '');

  if (!USERNAME_RE.test(username)) {
    return bad(res, 'شناسه باید ۳ تا ۲۴ کاراکتر و فقط حروف انگلیسی، عدد و _ باشد');
  }
  if (password.length < 6) return bad(res, 'رمز عبور باید دست‌کم ۶ کاراکتر باشد');
  if (store.getUserByUsername(username)) return bad(res, 'این شناسه قبلاً گرفته شده', 409);

  const user = store.createUser({ username, displayName, password: hashPassword(password) });
  res.json({ token: signToken({ sub: user.id }), user: store.publicUser(user) });
});

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = store.getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password)) return bad(res, 'شناسه یا رمز نادرست', 401);
  res.json({ token: signToken({ sub: user.id }), user: store.publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: store.publicUser(req.user) }));

// ------------------------------------------------------------- identity

router.post('/keys', requireAuth, (req, res) => {
  const publicKey = String(req.body?.publicKey || '');
  if (!publicKey || publicKey.length > 400) return bad(res, 'کلید عمومی نامعتبر است');
  store.setUserPublicKey(req.user.id, publicKey);
  broadcastToContacts(req.user.id, { t: 'chat:update' });
  res.json({ ok: true });
});

router.post('/keys/lookup', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  const usernames = Array.isArray(req.body?.usernames)
    ? req.body.usernames.map((u) => String(u).trim()).filter(Boolean)
    : [];

  const found = [...store.getUsersByIds(ids), ...usernames.map(store.getUserByUsername).filter(Boolean)];
  const unique = [...new Map(found.map((u) => [u.id, u])).values()];
  res.json({ users: unique.map(store.publicUser) });
});

// ---------------------------------------------------------------- chats

function chatPayload(chat, meId) {
  const members = store.getMembers(chat.id).map((m) => ({
    ...store.publicUser(m),
    role: m.role,
    online: isOnline(m.id),
  }));
  const last = store.lastMessage(chat.id);
  const receipt = store.getReceipt(chat.id, meId);
  const lastReadId = receipt ? receipt.last_id : 0;

  return {
    chat: {
      id: chat.id,
      type: chat.type,
      name: chat.name,
      avatarColor: chat.avatar_color,
      keyVersion: chat.key_version,
      createdBy: chat.created_by,
      createdAt: chat.created_at,
    },
    members,
    lastMessage: last
      ? {
          id: last.id,
          senderId: last.sender_id,
          keyVersion: last.key_version,
          kind: last.kind,
          body: last.body,
          createdAt: last.created_at,
        }
      : null,
    unread: store.countUnread(chat.id, meId, lastReadId),
    myLastReadId: lastReadId,
    receipts: Object.fromEntries(store.allReceipts(chat.id).map((r) => [r.user_id, r.last_id])),
  };
}

function notifyChat(chatId, exceptUserId = null) {
  const chat = store.getChat(chatId);
  for (const memberId of store.memberIds(chatId)) {
    if (memberId === exceptUserId) continue;
    sendTo(memberId, { t: 'chat', ...chatPayload(chat, memberId) });
  }
}

router.get('/chats', requireAuth, (req, res) => {
  res.json({ chats: store.listChats(req.user.id).map((c) => chatPayload(c, req.user.id)) });
});

router.post('/chats/dm', requireAuth, (req, res) => {
  const other = store.getUserByUsername(String(req.body?.username || '').trim());
  if (!other) return bad(res, 'چنین کاربری پیدا نشد', 404);
  if (other.id === req.user.id) return bad(res, 'این شناسه مال خودت است');

  let chat = store.findDm(req.user.id, other.id);
  let created = false;
  if (!chat) {
    chat = store.createChat({ type: 'dm', createdBy: req.user.id });
    store.addMember(chat.id, req.user.id, 'member');
    store.addMember(chat.id, other.id, 'member');
    created = true;
    notifyChat(chat.id);
  }
  res.json({ created, ...chatPayload(chat, req.user.id) });
});

router.post('/chats/group', requireAuth, (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return bad(res, 'نام گروه را وارد کن');
  const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames : [];

  const chat = store.createChat({ type: 'group', name, createdBy: req.user.id });
  store.addMember(chat.id, req.user.id, 'admin');

  for (const raw of usernames) {
    const member = store.getUserByUsername(String(raw).trim());
    if (member && member.id !== req.user.id) store.addMember(chat.id, member.id);
  }
  notifyChat(chat.id);
  res.json(chatPayload(chat, req.user.id));
});

router.post('/chats/:id/members', requireAuth, (req, res) => {
  const chatId = Number(req.params.id);
  const chat = store.getChat(chatId);
  if (!chat || chat.type !== 'group') return bad(res, 'گروه پیدا نشد', 404);
  if (!store.isMember(chatId, req.user.id)) return bad(res, 'دسترسی نداری', 403);

  const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
  const added = [];
  for (const raw of usernames) {
    const member = store.getUserByUsername(String(raw).trim());
    if (member && !store.isMember(chatId, member.id)) {
      store.addMember(chatId, member.id);
      added.push(member.id);
    }
  }
  notifyChat(chatId);
  if (added.length) {
    // Existing members hold the key, so they wrap it for the newcomers.
    broadcastToChat(chatId, { t: 'keyreq', chatId, keyVersion: chat.key_version, userIds: added });
  }
  res.json(chatPayload(chat, req.user.id));
});

router.delete('/chats/:id/members/:userId', requireAuth, (req, res) => {
  const chatId = Number(req.params.id);
  const targetId = Number(req.params.userId);
  const chat = store.getChat(chatId);
  if (!chat || chat.type !== 'group') return bad(res, 'گروه پیدا نشد', 404);
  if (!store.isMember(chatId, req.user.id)) return bad(res, 'دسترسی نداری', 403);

  store.removeMember(chatId, targetId);
  // Rotate so the removed member can no longer read what comes next.
  const keyVersion = store.bumpKeyVersion(chatId);

  sendTo(targetId, { t: 'removed', chatId });
  notifyChat(chatId);
  broadcastToChat(chatId, { t: 'rotate', chatId, keyVersion });
  res.json({ ok: true });
});

router.get('/chats/:id/messages', requireAuth, (req, res) => {
  const chatId = Number(req.params.id);
  if (!store.isMember(chatId, req.user.id)) return bad(res, 'دسترسی نداری', 403);
  const rows = store.listMessages(chatId, { before: Number(req.query.before) || 0, limit: req.query.limit });
  res.json({
    messages: rows
      .map((r) => ({
        id: r.id,
        chatId: r.chat_id,
        senderId: r.sender_id,
        keyVersion: r.key_version,
        kind: r.kind,
        body: r.body,
        createdAt: r.created_at,
      }))
      .reverse(),
  });
});

router.post('/chats/:id/read', requireAuth, (req, res) => {
  const chatId = Number(req.params.id);
  if (!store.isMember(chatId, req.user.id)) return bad(res, 'دسترسی نداری', 403);
  const lastId = Number(req.body?.lastId) || 0;
  store.setReceipt(chatId, req.user.id, lastId);
  broadcastToChat(chatId, { t: 'read', chatId, userId: req.user.id, lastId, at: Date.now() }, req.user.id);
  res.json({ ok: true });
});

// ----------------------------------------------------------- chat keys

router.get('/chats/:id/keys', requireAuth, (req, res) => {
  const chatId = Number(req.params.id);
  if (!store.isMember(chatId, req.user.id)) return bad(res, 'دسترسی نداری', 403);
  const chat = store.getChat(chatId);
  const version = Number(req.query.version) || chat.key_version;
  res.json({
    keyVersion: chat.key_version,
    keys: store.wrappedKeysFor(chatId, req.user.id, version).map((k) => ({
      keyVersion: k.key_version,
      fromUserId: k.from_user_id,
      body: k.body,
    })),
  });
});

router.post('/chats/:id/keys', requireAuth, (req, res) => {
  const chatId = Number(req.params.id);
  if (!store.isMember(chatId, req.user.id)) return bad(res, 'دسترسی نداری', 403);
  const chat = store.getChat(chatId);
  const keyVersion = Number(req.body?.keyVersion) || chat.key_version;
  const body = String(req.body?.body || '');
  if (!body) return bad(res, 'کلید خالی است');

  const targets = req.body?.toUserIds
    ? store.memberIds(chatId).filter((id) => req.body.toUserIds.map(Number).includes(id))
    : store.memberIds(chatId).filter((id) => id !== req.user.id);

  for (const forUserId of targets) {
    store.putWrappedKey({ chatId, forUserId, keyVersion, fromUserId: req.user.id, body });
    sendTo(forUserId, { t: 'key', chatId, keyVersion, fromUserId: req.user.id, body });
  }
  res.json({ ok: true, delivered: targets.length });
});

// ---------------------------------------------------------------- files

const upload = multer({
  storage: multer.diskStorage({
    destination: config.filesDir,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.maxUploadBytes },
});

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return bad(res, 'فایلی دریافت نشد');
  store.createFile(req.file.filename, req.user.id, req.file.size);
  res.json({ id: req.file.filename, size: req.file.size });
});

router.get('/files/:id', (req, res) => {
  const file = store.getFile(req.params.id);
  if (!file) return bad(res, 'پیدا نشد', 404);
  // The bytes are ciphertext; only holders of the per-file key can read them.
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', file.size);
  res.sendFile(path.join(config.filesDir, file.id));
});

// ------------------------------------------------------------- presence

router.get('/presence', requireAuth, (req, res) => {
  const ids = Array.isArray(req.query.ids) ? req.query.ids : String(req.query.ids || '').split(',');
  const list = ids.map(Number).filter(Number.isInteger).map(presenceOf);
  res.json({ presence: list });
});

export const apiRouter = router;
export { chatPayload, notifyChat };
export const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', router);
app.use((err, _req, res, _next) => {
  console.error(err);
  bad(res, err.message || 'خطای سرور', 500);
});
export { contactsOf, broadcastToContacts };
