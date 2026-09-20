// SPDX-License-Identifier: GPL-3.0-only
/*
 * VWZ Challenge Verification Script (JS/ESM verifier)
 *
 * Standalone reimplementation of datasets/verify.py for q=65537.
 * Reads the published public key (vwz-challenge-k4.json) plus a submitted
 * solution and returns VERIFIED / REJECTED. Pure tensor arithmetic over F_q;
 * this is a challenge-solution verifier for the q=65537 challenge domain and
 * does NOT depend on the q=3329 WASM reference implementation.
 *
 * Build/run:  node verify.mjs <solution.json>
 *             (public key is read from vwz-challenge-k4.json in CWD)
 */
import { readFileSync } from 'node:fs';

const Q = 65537;
const mod = (x) => ((x % Q) + Q) % Q;

// FNV-1a + xorshift (mirrors verify.py hash_to_sphere exactly; seed 0xABCD)
function hashToSphere(msg, seed = 0xabcd) {
  let h = 0xcbf29ce484222325n;
  h ^= BigInt(seed);
  const bytes = Buffer.from(msg, 'utf8');
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  let state = h ? h : 1n;
  const xs = () => {
    let x = state;
    x ^= (x << 13n) & 0xffffffffffffffffn;
    x ^= x >> 7n;
    x ^= (x << 17n) & 0xffffffffffffffffn;
    state = x;
    return x;
  };
  // Deterministic, language-agnostic: collect distinct positions in draw order,
  // sort, then assign values. Avoids set-iteration-order divergence vs verify.py.
  const t = new Array(9).fill(0);
  const pos = [];
  while (pos.length < 5) {
    const r = Number(xs() % 9n);
    if (!pos.includes(r)) pos.push(r);
  }
  pos.sort((a, b) => a - b);
  for (const p of pos) t[p] = mod(Number(xs() % 65536n)) + 1;
  return t;
}

function verify(pk, w2, w3, msg) {
  const T = pk.public_key; // 9 x 5 x 5 tensor
  const t = hashToSphere(msg);
  for (let i1 = 0; i1 < 9; i1++) {
    let s = 0;
    for (let i2 = 0; i2 < 5; i2++) {
      for (let i3 = 0; i3 < 5; i3++) {
        s = mod(s + mod(T[i1][i2][i3] * w2[i2]) * w3[i3]);
      }
    }
    if (mod(s) !== t[i1]) return false;
  }
  return true;
}

function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node verify.mjs <solution.json>');
    process.exit(1);
  }
  const ds = JSON.parse(readFileSync('vwz-challenge-k4.json', 'utf8'));
  const sol = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const pk = { public_key: ds.public_key };
  const w2 = sol.w2 || [];
  const w3 = sol.w3 || [];
  const msg = sol.msg || 'TEST';
  const ok = verify(pk, w2, w3, msg);
  console.log(ok ? 'VERIFIED' : 'REJECTED');
  process.exit(ok ? 0 : 1);
}

main();
