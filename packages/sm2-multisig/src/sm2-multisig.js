// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE SM2 Multi-Signature — curve ops + broadcasting multi-signature
 * =========================================================================
 * Teaching implementation of a broadcasting SM2 multi-signature, following
 * the construction ideas of:
 *
 *   Yuchen Xiao, Lei Zhang, Yafang Yang, Wei Wu, Jianting Ning, Xinyi Huang,
 *   "Provably Secure Multi-Signature Scheme Based on the Standard SM2
 *   Signature Scheme", Computer Standards & Interfaces 89:103819, 2024.
 *
 * NOTE (teaching scope): this package demonstrates the *aggregation
 * principle* — shared nonce + linear response aggregation over an aggregate
 * public key. For the full provably-secure construction (which includes the
 * (1+d)^{-1} factor so that a single signer reduces EXACTLY to the standard
 * SM2 signature), please refer to the paper. Here n=1 reduces to a
 * self-consistent SM2-style signature over the aggregate key.
 *
 * Curve: SM2 recommended parameters (sm2p256v1, GB/T 32918).
 */
'use strict';

const { sm3 } = require('./sm3.js');

// ── SM2 curve parameters (sm2p256v1) ──
const P = 0xfffffffeffffffffffffffffffffffffffffffff00000000ffffffffffffffffn;
const A = 0xfffffffeffffffffffffffffffffffffffffffff00000000fffffffffffffffcn;
const B = 0x28e9fa9e9d9f5e344d5a9e4bcf6509a7f39789f515ab8f92ddbcbd414d940e93n;
const N = 0xfffffffeffffffffffffffffffffffff7203df6b21c6052b53bbf40939d54123n;
const GX = 0x32c4ae2c1f1981195f9904466a39c9948fe30bbff2660be1715a4589334c74c7n;
const GY = 0xbc3736a2f4f6779c59bdcee36b692153d0a9877cc62a474002df32e52139f0a0n;

const mod = (x, m) => ((x % m) + m) % m;
const modinv = (a, m) => {
  let [t, newT, r, newR] = [0n, 1n, m, mod(a, m)];
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  return mod(t, m);
};

// affine point ops (y^2 = x^3 + a*x + b)
function pointAdd(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (x1 === x2 && mod(y1 + y2, P) === 0n) return null;
  let lam;
  if (x1 === x2 && y1 === y2) {
    lam = mod((3n * x1 * x1 + A) * modinv(2n * y1, P), P);
  } else {
    lam = mod((y2 - y1) * modinv(x2 - x1, P), P);
  }
  const x3 = mod(lam * lam - x1 - x2, P);
  const y3 = mod(lam * (x1 - x3) - y1, P);
  return [x3, y3];
}

function pointMul(k, pt) {
  let result = null;
  let addend = pt;
  let bits = k;
  while (bits > 0n) {
    if (bits & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    bits >>= 1n;
  }
  return result;
}

const G = [GX, GY];

// ── helpers ──
function toBigInt(hex) { return BigInt('0x' + hex.replace(/^0x/i, '')); }
function toHex(buf) { return Buffer.from(buf).toString('hex'); }
function bytesFromBigInt(x, len = 32) {
  const hex = x.toString(16).padStart(len * 2, '0');
  return Buffer.from(hex, 'hex');
}

/** ZA = SM3(ENTL || ID_A || a || b || Gx || Gy || Px || Py) — GB/T 32918.2 */
function za(publicKey, id = '1234567812345678') {
  const idBytes = Buffer.from(id, 'utf8');
  const entl = Buffer.alloc(2);
  entl.writeUInt16BE(idBytes.length * 8);
  const parts = [
    entl, idBytes,
    bytesFromBigInt(A), bytesFromBigInt(B),
    bytesFromBigInt(GX), bytesFromBigInt(GY),
    bytesFromBigInt(publicKey[0]), bytesFromBigInt(publicKey[1])
  ];
  return sm3(Buffer.concat(parts));
}

// ── multi-signature ──

/**
 * Round 1: each signer generates a random nonce commitment R_i = k_i·G.
 * Returns { k (private nonce), R (commitment point) }.
 */
function round1Commit() {
  // NOTE: deterministic CSPRNG via crypto.getRandomValues
  const bytes = require('crypto').randomBytes(32);
  let k = mod(toBigInt(bytes.toString('hex')), N - 1n) + 1n;
  return { k, R: pointMul(k, G) };
}

/**
 * Round 2: aggregate public key + derive e, then each signer computes its
 * linear response s_i = k_i - r·d_i (mod n).
 */
function computeResponse(k, d, r) {
  return mod(k - r * d, N);
}

/**
 * Full teaching protocol (3 rounds):
 *   R1: each signer broadcasts commitment R_i
 *   R2: everyone computes R = Σ R_i, r = R.x + e, then s_i = k_i - r·d_i
 *   R3: aggregator sums s = Σ s_i; signature = (r, s); verify with P* = Σ P_i
 */
function multiSign({ privateKeys, messages, message, id }) {
  const n = privateKeys.length;
  const publicKeys = privateKeys.map((d) => pointMul(d, G));

  // R1: commitments
  const commits = privateKeys.map(() => round1Commit());

  // R2: aggregate nonce point
  let R = null;
  for (const c of commits) R = pointAdd(R, c.R);

  // e = SM3(ZA(P*) || M)
  let agg = null;
  for (const pk of publicKeys) agg = pointAdd(agg, pk);
  const eBytes = Buffer.concat([za(agg, id), Buffer.from(String(message), 'utf8')]);
  const e = mod(toBigInt(Buffer.from(sm3(eBytes)).toString('hex')), N);
  const r = mod(R[0] + e, N);

  // R3: responses + aggregation
  const responses = privateKeys.map((d, i) => computeResponse(commits[i].k, d, r));
  const s = responses.reduce((acc, v) => mod(acc + v, N), 0n);

  return { r, s, aggregatePublicKey: agg };
}

/**
 * Verify an (r, s) multi-signature against the aggregate public key P*.
 */
function verify({ aggregatePublicKey, message, id, signature }) {
  const { r, s } = signature;
  if (r <= 0n || r >= N || s <= 0n || s >= N) return false;
  const eBytes = Buffer.concat([za(aggregatePublicKey, id), Buffer.from(String(message), 'utf8')]);
  const e = mod(toBigInt(Buffer.from(sm3(eBytes)).toString('hex')), N);
  // R' = s·G + r·P*
  const R1 = pointMul(s, G);
  const R2 = pointMul(r, aggregatePublicKey);
  const Rp = pointAdd(R1, R2);
  if (Rp === null) return false;
  return mod(Rp[0] + e, N) === r;
}

module.exports = {
  P, A, B, N, G,
  pointMul, pointAdd,
  multiSign, verify,
  round1Commit, computeResponse,
  za, sm3,
};
