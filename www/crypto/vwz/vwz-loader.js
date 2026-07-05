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

export function vwzDeserializePK(data) {
  ensureReady();
  return deserialize_public_key(data);
}

export function vwzSerializeSig(sig) {
  ensureReady();
  return serialize_signature(sig);
}

export function vwzDeserializeSig(data) {
  ensureReady();
  return deserialize_signature(data);
}

export function vwzEstimateSizes(k) {
  ensureReady();
  return JSON.parse(estimate_sizes(k));
}

// ---- Re-export for power users ----
export { keygen, keygen_seeded, sign, verify };
