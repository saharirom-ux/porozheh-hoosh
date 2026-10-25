import nodeCrypto from 'node:crypto';
import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { utf8ToBytes } from '@noble/hashes/utils';
import {
  setRandomBytes,
  generateIdentity,
  identityPublicB64,
  base64ToBytes,
  bytesToBase64,
  concatBytes,
} from './src/crypto.js';

setRandomBytes((n) => new Uint8Array(nodeCrypto.randomBytes(n)));

// base64 round trip
for (let n = 1; n < 40; n++) {
  const b = new Uint8Array(nodeCrypto.randomBytes(n));
  const rt = base64ToBytes(bytesToBase64(b));
  if (rt.length !== b.length || Buffer.compare(Buffer.from(rt), Buffer.from(b)) !== 0) {
    console.log('BASE64 MISMATCH at length', n, 'got', rt.length);
    process.exit(1);
  }
}
console.log('base64 round trip ok (1..39 bytes)');

const a = generateIdentity();
const b = generateIdentity();

console.log('aPub len', a.publicKey.length, 'bPub len', b.publicKey.length);

const sharedAB = x25519.getSharedSecret(a.secretKey, b.publicKey);
const sharedBA = x25519.getSharedSecret(b.secretKey, a.publicKey);
console.log('shared secrets equal:', Buffer.compare(Buffer.from(sharedAB), Buffer.from(sharedBA)) === 0);

// now via base64, like the server round trip
const bPubFromWire = base64ToBytes(identityPublicB64(b));
const aPubFromWire = base64ToBytes(identityPublicB64(a));
console.log('wire pub matches:', Buffer.compare(Buffer.from(bPubFromWire), Buffer.from(b.publicKey)) === 0);

const sorted1 = [a.publicKey, bPubFromWire].sort((x, y) => {
  for (let i = 0; i < 32; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
});
const sorted2 = [b.publicKey, aPubFromWire].sort((x, y) => {
  for (let i = 0; i < 32; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
});
console.log('info lo equal:', Buffer.compare(Buffer.from(sorted1[0]), Buffer.from(sorted2[0])) === 0);
console.log('info hi equal:', Buffer.compare(Buffer.from(sorted1[1]), Buffer.from(sorted2[1])) === 0);

const info1 = concatBytes(utf8ToBytes('rafiq-dm-v1|'), sorted1[0], sorted1[1]);
const info2 = concatBytes(utf8ToBytes('rafiq-dm-v1|'), sorted2[0], sorted2[1]);
console.log('info lengths', info1.length, info2.length);
console.log('info equal:', Buffer.compare(Buffer.from(info1), Buffer.from(info2)) === 0);

const k1 = hkdf(sha256, sharedAB, new Uint8Array(0), info1, 32);
const k2 = hkdf(sha256, sharedBA, new Uint8Array(0), info2, 32);
console.log('final keys equal:', Buffer.compare(Buffer.from(k1), Buffer.from(k2)) === 0);
