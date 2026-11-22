import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = process.env.RAFIQ_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });

// The token signing secret. If it is not provided through the environment we
// generate one and persist it, so sessions survive a server restart.
const secretFile = path.join(dataDir, 'secret.key');
let tokenSecret = process.env.RAFIQ_SECRET || '';
if (!tokenSecret) {
  if (fs.existsSync(secretFile)) {
    tokenSecret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    tokenSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, tokenSecret, { mode: 0o600 });
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  filesDir: path.join(dataDir, 'files'),
  dbFile: path.join(dataDir, 'rafiq.db'),
  tokenSecret,
  tokenTtlMs: 1000 * 60 * 60 * 24 * 365,
  maxUploadBytes: 25 * 1024 * 1024,
};
