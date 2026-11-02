// Crypto helpers built on tweetnacl (Ed25519 signatures, SHA-512, XSalsa20-Poly1305).
// Everything is synchronous so it can run inside validation loops.
import nacl from 'tweetnacl';

const te = new TextEncoder();
const td = new TextDecoder();

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function b64url(bytes) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// SHA-512, truncated to 32 bytes, hex encoded.
export const sha = (str) => toHex(nacl.hash(te.encode(String(str))).slice(0, 32));
// Short digest used inside credentials (16 bytes, base64url).
export const shortDigest = (str) => b64url(nacl.hash(te.encode(String(str))).slice(0, 16));

// Canonical JSON: sorted keys so the same object always hashes the same.
export function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export function keypairFromSeed(seedText) {
  const seed = nacl.hash(te.encode(seedText)).slice(0, 32);
  return nacl.sign.keyPair.fromSeed(seed);
}

export const signText = (text, secretKey) => b64url(nacl.sign.detached(te.encode(text), secretKey));
export function verifyText(text, sigB64, publicKey) {
  try {
    return nacl.sign.detached.verify(te.encode(text), fromB64url(sigB64), publicKey);
  } catch {
    return false;
  }
}

// AICTE issuer key. DEMO ONLY: in production the secret key lives in an HSM and
// signing runs on the server. The public key is embedded so verification works offline.
export const AICTE_KEYS = keypairFromSeed(import.meta.env.VITE_ISSUER_SEED || 'APAAR-SETU-AICTE-ISSUER-DEMO-2026');
export const AICTE_PUBLIC = b64url(AICTE_KEYS.publicKey);
export const AICTE_DID = 'did:web:aicte-india.org:apaar-setu';

export const institutionKeys = (instId) => keypairFromSeed('APAAR-SETU-INSTITUTION-' + instId);
export const fingerprint = (pub) => sha(b64url(pub)).slice(0, 16).toUpperCase().match(/.{4}/g).join('-');

// Field-level encryption for contact data (phone, bank account, guardian phone).
const DATA_KEY = nacl.hash(te.encode(import.meta.env.VITE_DATA_KEY || 'APAAR-SETU-FIELD-KEY-DEMO')).slice(0, 32);
export function encryptField(plain) {
  if (plain === undefined || plain === null || plain === '') return '';
  const nonce = nacl.randomBytes(24);
  const box = nacl.secretbox(te.encode(String(plain)), nonce, DATA_KEY);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return 'enc:' + b64url(out);
}
export function decryptField(cipher) {
  if (!cipher || !cipher.startsWith('enc:')) return cipher || '';
  try {
    const raw = fromB64url(cipher.slice(4));
    const opened = nacl.secretbox.open(raw.slice(24), raw.slice(0, 24), DATA_KEY);
    return opened ? td.decode(opened) : '[unreadable]';
  } catch {
    return '[unreadable]';
  }
}
// Salted hash used for matching contacts without revealing them.
const SALT = import.meta.env.VITE_MATCH_SALT || 'apaar-setu-match-salt';
export const matchHash = (v) => (v ? sha(SALT + String(v).replace(/\s+/g, '').toLowerCase()).slice(0, 24) : '');

export const mask = (v, keep = 4) => (v ? '•'.repeat(Math.max(0, String(v).length - keep)) + String(v).slice(-keep) : '');

export const randomId = (prefix = '') => prefix + b64url(nacl.randomBytes(9));
export const randomSalt = () => b64url(nacl.randomBytes(8));
