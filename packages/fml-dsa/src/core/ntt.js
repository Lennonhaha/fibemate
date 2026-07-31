// packages/fml-dsa/src/core/ntt.js
// Noble-aligned NTT — delegates directly to @noble/post-quantum genCrystals
// This guarantees 100% bit-identical output with Noble's NTT.encode/NTT.decode
// Q = 8380417, N = 256, ζ = 1753

import { genCrystals } from '@noble/post-quantum/_crystals.js';
import { Q, N } from './params.js';

// Noble's genCrystals creates NTT.encode (DIF+invert) and NTT.decode (DIT+invert+scale)
// F = 8347681 = 256⁻¹ mod 8380417 (Dilithium inverse-NTT normalization)
const cry = genCrystals({
  newPoly: (n) => new Int32Array(n),
  N: 256,
  Q: 8380417,
  F: 8347681,
  ROOT_OF_UNITY: 1753,
  brvBits: 8,
  isKyber: false
});

function assertPoly(v, name) {
  if (!(v instanceof Int32Array)) throw new TypeError(`${name} must be Int32Array`);
  if (v.length !== N) throw new RangeError(`${name} length=${v.length}, expected ${N}`);
  // Note: signed inputs ({-1, 0, 1} from SampleInBall; [-γ₁+1, γ₁-1] for z) are accepted.
  // The NTT reduces mod Q internally. We only need to ensure no overflow from >> 24 etc.
  for (let i = 0; i < N; i++) {
    if (typeof v[i] !== 'number' || !Number.isInteger(v[i]) || v[i] < -Q || v[i] >= Q) {
      throw new RangeError(`${name}[${i}]=${v[i]} not in [-Q+1,Q-1]`);
    }
  }
}

// ============================================================
// NTT (forward) — natural input → BR output (bit-identical to Noble)
// ============================================================
export function ntt(poly) {
  assertPoly(poly, 'ntt(poly)');
  const a = new Int32Array(N);
  for (let i = 0; i < N; i++) a[i] = poly[i];
  cry.NTT.encode(a);
  return a;
}

// ============================================================
// Inverse NTT — BR input → natural output (bit-identical to Noble)
// ============================================================
export function invNtt(polyNtt) {
  assertPoly(polyNtt, 'invNtt(poly)');
  const a = new Int32Array(N);
  for (let i = 0; i < N; i++) a[i] = polyNtt[i];
  cry.NTT.decode(a);
  return a;
}

// ============================================================
// Self-test
// ============================================================
(function selfTest() {
  const orig = new Int32Array(N);
  for (let i = 0; i < N; i++) orig[i] = (i * 12345 + 6789) % Q;
  const n = ntt(orig);
  const b = invNtt(n);
  for (let i = 0; i < N; i++) {
    if (b[i] !== orig[i]) throw new Error(`roundtrip FAIL at ${i}: ${orig[i]}→${n[i]}→${b[i]}`);
  }
  console.log('✅ ntt: Noble-genCrystals roundtrip OK (Noble-aligned)');
})();
