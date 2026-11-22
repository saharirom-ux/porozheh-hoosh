import crypto from 'node:crypto';
import { config } from './config.js';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

/** Hash a password with scrypt and return a self-describing string. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/** Constant-time verification of a password against a stored hash. */
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  let expected;
  try {
    const salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** Signed stateless token: base64url(payload) + '.' + base64url(hmac). */
export function signToken(payload) {
  const body = b64u(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + config.tokenTtlMs }));
  const sig = crypto.createHmac('sha256', config.tokenSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', config.tokenSecret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

/** Pull a Bearer token out of an Express request. */
export function bearerOf(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
