// SPDX-License-Identifier: GPL-3.0-only
// VWZ Hash-and-Sign — Browser Integration Loader
// 
// Usage:
//   import { initVwz, vwzKeygen, vwzSign, vwzVerify } from './vwz-loader.js';
//   await initVwz();
//   const kp = vwzKeygen(8);
//   const sig = vwzSign(kp.secretKey, msg);
//   const ok = vwzVerify(kp.publicKey, msg, sig);

import initModule, {
  keygen,
  keygen_seeded,
  sign,
  verify,
  serialize_public_key,
  deserialize_public_key,
  serialize_signature,
  deserialize_signature,
  estimate_sizes,
} from './vwz_signature.js';

// Lazy PublicKey cache — avoids re-deserializing the same PK bytes.
// Key = SHA-256(bytes) as hex string, Value = { pk, bytes }.
// LRU eviction when size exceeds MAX_PK_CACHE.
let _pkCache = null; // lazy init on first use
const MAX_PK_CACHE = 8;

function getPkCache() {
  if (!_pkCache) _pkCache = new Map();
  return _pkCache;
}

/**
 * SHA-256 hash of Uint8Array, returns hex string.
 * Uses Web Crypto API (available in all modern browsers + Node 19+).
 */
async function sha256Hex(data) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Node.js < 19 fallback: use built-in crypto module (CommonJS-safe)
  try {
    const { createHash } = await import('node:crypto');
    const h = createHash('sha256');
    h.update(Buffer.from(data));
    return h.digest('hex');
  } catch {
    // No crypto available — skip cache, fall through to deserialize
    return null;
  }
}

/**
 * Constant-time byte comparison to guard against hash collision.
 */
function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  const ua = new Uint8Array(a), ub = new Uint8Array(b);
  for (let i = 0; i < a.byteLength; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

let _ready = false;
let _initPromise = null;

export async function initVwz() {
  if (_ready) return;
  if (!_initPromise) {
    _initPromise = initModule().then(() => { _ready = true; });
  }
  return _initPromise;
}

function ensureReady() {
  if (!_ready) throw new Error('VWZ not initialized — call initVwz() first');
}

// ---- Convenience wrappers ----

export function vwzKeygen(k) {
  ensureReady();
  return keygen(k);
}

export function vwzKeygenSeeded(k, seed) {
  ensureReady();
  return keygen_seeded(k, seed);
}

export function vwzSign(secretKey, msg) {
  ensureReady();
  if (typeof msg === 'string') msg = new TextEncoder().encode(msg);
  return sign(secretKey, msg);
}

export function vwzVerify(publicKey, msg, signature) {
  ensureReady();
  if (typeof msg === 'string') msg = new TextEncoder().encode(msg);
  return verify(publicKey, msg, signature);
}

export function vwzSerializePK(pk) {
  ensureReady();
  return serialize_public_key(pk);
}

export async function vwzDeserializePK(data) {
  ensureReady();
  if (!(data instanceof Uint8Array)) {
    data = new Uint8Array(data);
  }
  const cache = getPkCache();
  const key = await sha256Hex(data);
  if (key !== null) {
    const hit = cache.get(key);
    if (hit && bytesEqual(data, hit.bytes)) {
      return hit.pk; // cache hit — skip WASM deserialize
    }
  }
  // cache miss — deserialize and cache (evict LRU if full)
  const pk = deserialize_public_key(data);
  if (key !== null) {
    if (cache.size >= MAX_PK_CACHE) {
      // Evict oldest entry (first key in insertion-order Map)
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    cache.set(key, { pk, bytes: new Uint8Array(data) });
  }
  return pk;
}

export function vwzSerializeSig(sig) {
  ensureReady();
  return serialize_signature(sig);
}

let _sigCache = null;
const MAX_SIG_CACHE = 64; // signatures are small (~36-132B), cache more

function getSigCache() {
  if (!_sigCache) _sigCache = new Map();
  return _sigCache;
}

export async function vwzDeserializeSig(data) {
  ensureReady();
  if (!(data instanceof Uint8Array)) {
    data = new Uint8Array(data);
  }
  const cache = getSigCache();
  const key = await sha256Hex(data);
  if (key !== null) {
    const hit = cache.get(key);
    if (hit && bytesEqual(data, hit.bytes)) return hit.sig;
  }
  const sig = deserialize_signature(data);
  if (key !== null) {
    if (cache.size >= MAX_SIG_CACHE) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    cache.set(key, { sig, bytes: new Uint8Array(data) });
  }
  return sig;
}

export function vwzEstimateSizes(k) {
  ensureReady();
  return JSON.parse(estimate_sizes(k));
}

// ---- Re-export for power users ----
export { keygen, keygen_seeded, sign, verify };
