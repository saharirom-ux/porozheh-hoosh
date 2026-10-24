import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password      TEXT NOT NULL,
    avatar_color  TEXT NOT NULL DEFAULT '#6C7CFF',
    public_key    TEXT,
    key_updated_at INTEGER,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chats (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT NOT NULL CHECK (type IN ('dm','group')),
    name         TEXT,
    avatar_color TEXT NOT NULL DEFAULT '#6C7CFF',
    key_version  INTEGER NOT NULL DEFAULT 1,
    created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id   INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id     INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_version INTEGER NOT NULL DEFAULT 1,
    kind        TEXT NOT NULL DEFAULT 'text',
    body        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);

  CREATE TABLE IF NOT EXISTS wrapped_keys (
    chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    for_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_version  INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (chat_id, for_user_id, key_version, from_user_id)
  );

  CREATE TABLE IF NOT EXISTS receipts (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_id INTEGER NOT NULL DEFAULT 0,
    at      INTEGER NOT NULL,
    PRIMARY KEY (chat_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    size       INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const now = () => Date.now();
const PALETTE = ['#6C7CFF', '#FF7C6C', '#4CC38A', '#FFB74D', '#BA68C8', '#4FC3F7', '#EC5E7C', '#9575CD'];

export const pickColor = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];

// ---------------------------------------------------------------- users

export function createUser({ username, displayName, password }) {
  const info = db
    .prepare('INSERT INTO users (username, display_name, password, avatar_color, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(username, displayName, password, pickColor(), now());
  return getUserById(Number(info.lastInsertRowid));
}

export const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
export const getUserByUsername = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);

export const publicUser = (u) =>
  u && {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    publicKey: u.public_key || null,
    keyUpdatedAt: u.key_updated_at || null,
  };

export function setUserPublicKey(userId, publicKey) {
  db.prepare('UPDATE users SET public_key = ?, key_updated_at = ? WHERE id = ?').run(publicKey, now(), userId);
}

export function getUsersByIds(ids) {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM users WHERE id IN (${marks})`).all(...ids);
}

// ---------------------------------------------------------------- chats

export function createChat({ type, name, createdBy }) {
  const info = db
    .prepare('INSERT INTO chats (type, name, avatar_color, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(type, name || null, pickColor(), createdBy, now());
  return getChat(Number(info.lastInsertRowid));
}

export const getChat = (id) => db.prepare('SELECT * FROM chats WHERE id = ?').get(id);

export function addMember(chatId, userId, role = 'member') {
  db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    chatId,
    userId,
    role,
    now(),
  );
}

export function removeMember(chatId, userId) {
  db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(chatId, userId);
}

export const getMembers = (chatId) =>
  db
    .prepare(
      `SELECT u.*, m.role, m.joined_at FROM chat_members m
       JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? ORDER BY m.joined_at`,
    )
    .all(chatId);

export const memberIds = (chatId) =>
  db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId).map((r) => r.user_id);

export function isMember(chatId, userId) {
  return !!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
}

export function findDm(a, b) {
  return db
    .prepare(
      `SELECT c.* FROM chats c
       JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
       JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
       WHERE c.type = 'dm'`,
    )
    .get(a, b);
}

export function bumpKeyVersion(chatId) {
  db.prepare('UPDATE chats SET key_version = key_version + 1 WHERE id = ?').run(chatId);
  return getChat(chatId).key_version;
}

export function listChats(userId) {
  return db
    .prepare(
      `SELECT c.* FROM chats c
       JOIN chat_members m ON m.chat_id = c.id
       WHERE m.user_id = ? ORDER BY c.id DESC`,
    )
    .all(userId);
}

// -------------------------------------------------------------- messages

export function insertMessage({ chatId, senderId, keyVersion, kind, body }) {
  const info = db
    .prepare('INSERT INTO messages (chat_id, sender_id, key_version, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(chatId, senderId, keyVersion, kind || 'text', body, now());
  return getMessage(Number(info.lastInsertRowid));
}

export const getMessage = (id) => db.prepare('SELECT * FROM messages WHERE id = ?').get(id);

export function listMessages(chatId, { before = 0, limit = 50 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);
  if (before) {
    return db
      .prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
      .all(chatId, before, capped);
  }
  return db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').all(chatId, capped);
}

export const lastMessage = (chatId) =>
  db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1').get(chatId);

export const countUnread = (chatId, userId, lastReadId) =>
  db
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND id > ? AND sender_id <> ?')
    .get(chatId, lastReadId || 0, userId).n;

// -------------------------------------------------------- wrapped keys

export function putWrappedKey({ chatId, forUserId, keyVersion, fromUserId, body }) {
  db.prepare(
    `INSERT INTO wrapped_keys (chat_id, for_user_id, key_version, from_user_id, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, for_user_id, key_version, from_user_id)
     DO UPDATE SET body = excluded.body, created_at = excluded.created_at`,
  ).run(chatId, forUserId, keyVersion, fromUserId, body, now());
}

export const wrappedKeysFor = (chatId, forUserId, keyVersion) =>
  db
    .prepare('SELECT * FROM wrapped_keys WHERE chat_id = ? AND for_user_id = ? AND key_version = ?')
    .all(chatId, forUserId, keyVersion);

// ------------------------------------------------------------- receipts

export function setReceipt(chatId, userId, lastId) {
  db.prepare(
    `INSERT INTO receipts (chat_id, user_id, last_id, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET last_id = excluded.last_id, at = excluded.at`,
  ).run(chatId, userId, lastId, now());
}

export const getReceipt = (chatId, userId) =>
  db.prepare('SELECT * FROM receipts WHERE chat_id = ? AND user_id = ?').get(chatId, userId);

export const allReceipts = (chatId) => db.prepare('SELECT * FROM receipts WHERE chat_id = ?').all(chatId);

// ---------------------------------------------------------------- files

export function createFile(id, ownerId, size) {
  db.prepare('INSERT INTO files (id, owner_id, size, created_at) VALUES (?, ?, ?, ?)').run(id, ownerId, size, now());
}

export const getFile = (id) => db.prepare('SELECT * FROM files WHERE id = ?').get(id);
