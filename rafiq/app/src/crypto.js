// Rafiq end-to-end encryption.
//
// Pure JavaScript so the exact same file runs in Node (tests) and in React
// Native (Expo Go, which ships no native crypto modules).
//
// Scheme
//   identity      X25519 key pair, generated on the device, secret never leaves it
//   direct chat   key = HKDF(X25519(me.theirs), info = sorted user ids)
//   group chat    random 32-byte key, wrapped for each member with X25519(me.them)
//   messages      AES-256-GCM, 12-byte random nonce, AAD binds chat + sender + version
//
// The server only ever stores base64 ciphertext. It holds no key.

import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { gcm } from '@noble/ciphers/aes';
import { utf8ToBytes, bytesToUtf8 } from '@noble/hashes/utils';

const EMPTY = new Uint8Array(0);
const NONCE = 12;
const TAG = 16;

/** Injected by the platform: React Native has no WebCrypto. */
let randomFn = null;
export function setRandomBytes(fn) {
  randomFn = fn;
}
function rand(n) {
  if (!randomFn) throw new Error('setRandomBytes() must be called before using crypto');
  return randomFn(n);
}

// ------------------------------------------------------------- byte utils

export function concatBytes(...arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function compareBytes(a, b) {
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64, implemented locally because React Native lacks Buffer. */
export function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

export function base64ToBytes(str) {
  const clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]);
    const c1 = B64.indexOf(clean[i + 1]);
    const c2 = B64.indexOf(clean[i + 2]);
    const c3 = B64.indexOf(clean[i + 3]);
    out[o++] = ((c0 << 2) | (c1 >> 4)) & 255;
    if (c2 >= 0) out[o++] = ((c1 << 4) | (c2 >> 2)) & 255;
    if (c3 >= 0) out[o++] = ((c2 << 6) | c3) & 255;
  }
  return out.subarray(0, o);
}

export const toB64 = bytesToBase64;
export const fromB64 = base64ToBytes;
export const utf8 = utf8ToBytes;
export const fromUtf8 = bytesToUtf8;

// -------------------------------------------------------------- identity

export function generateIdentity() {
  const secretKey = rand(32);
  const publicKey = x25519.scalarMultBase(secretKey);
  return { secretKey, publicKey };
}

export const identityPublicB64 = (identity) => bytesToBase64(identity.publicKey);

// ------------------------------------------------------------- symmetric

function sealRaw(key, aad, plain) {
  const nonce = rand(NONCE);
  const ct = gcm(key, nonce, aad).encrypt(plain);
  return concatBytes(nonce, ct);
}

function openRaw(key, aad, blob) {
  if (blob.length < NONCE + TAG) throw new Error('ciphertext too short');
  return gcm(key, blob.subarray(0, NONCE), aad).decrypt(blob.subarray(NONCE));
}

/** Encrypt arbitrary bytes. Returns nonce || ciphertext || tag. */
export const encryptBytes = sealRaw;
export const decryptBytes = openRaw;

export function encryptText(key, aad, text) {
  return sealRaw(key, aad, utf8(text));
}

export function decryptText(key, aad, blob) {
  return bytesToUtf8(openRaw(key, aad, blob));
}

// The AAD ties a ciphertext to its context, so a message copied into another
// chat or re-labelled with another sender simply fails to open.
export const messageAad = ({ chatId, senderId, keyVersion, kind }) =>
  utf8(`rafiq-msg-v1|${chatId}|${senderId}|${keyVersion}|${kind}`);

export const FILE_AAD_PREFIX = 'rafiq-file-v1|';

// ------------------------------------------------------------------- keys

function derive(secretKey, theirPublicKey) {
  return x25519.getSharedSecret(secretKey, theirPublicKey);
}

/**
 * Key for a one-to-one chat. Derived independently by both sides, so there is
 * nothing to transmit and nothing for the server to learn.
 */
export function deriveDmKey(me, them) {
  const shared = derive(me.secretKey, them.publicKey);
  const [lo, hi] = [me.publicKey, them.publicKey].sort(compareBytes);
  const info = concatBytes(utf8('rafiq-dm-v1|'), lo, hi);
  return hkdf(sha256, shared, EMPTY, info, 32);
}

/** Wrap a chat key so only `their.publicKey` can open it. */
export function wrapKey(me, them, chatKey) {
  const shared = derive(me.secretKey, them.publicKey);
  const kek = hkdf(sha256, shared, EMPTY, utf8('rafiq-wrap-v1'), 32);
  return sealRaw(kek, utf8('rafiq-wrap-v1'), chatKey);
}

export function unwrapKey(me, them, blob) {
  const shared = derive(me.secretKey, them.publicKey);
  const kek = hkdf(sha256, shared, EMPTY, utf8('rafiq-wrap-v1'), 32);
  return openRaw(kek, utf8('rafiq-wrap-v1'), blob);
}

export function newChatKey() {
  return rand(32);
}

// --------------------------------------------------------------- payloads

export function sealJson(key, aad, payload) {
  return bytesToBase64(encryptText(key, aad, JSON.stringify(payload)));
}

export function openJson(key, aad, bodyB64) {
  const text = decryptText(key, aad, base64ToBytes(bodyB64));
  return JSON.parse(text);
}

export function encryptFile(fileKey, fileId, bytes) {
  return sealRaw(fileKey, utf8(FILE_AAD_PREFIX + fileId), bytes);
}

export function decryptFile(fileKey, fileId, blob) {
  return openRaw(fileKey, utf8(FILE_AAD_PREFIX + fileId), blob);
}
