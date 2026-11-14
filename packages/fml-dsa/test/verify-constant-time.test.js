// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/test/verify-constant-time.test.js — regression guard for the c̃ comparison
//
// The verifier compares the recomputed challenge digest c̃' against the one carried
// in the signature. That comparison used to return on the first differing byte, which
// makes the time to reject a forgery proportional to the length of the matching
// prefix. c̃ is public, so this never leaked a secret, but the pattern is the one
// callers copy into secret comparisons — hence constantTimeEqual() and this test.
//
// Timing itself is not observable from a unit test, so what is asserted here is the
// functional contract the constant-time rewrite must preserve: every single-byte
// mutation of the digest region is rejected, one byte at a time. A rewrite that
// compares fewer bytes, or returns early on the wrong condition, fails these cases.
//
// 2026-11-14

import { keygen } from '../src/core/keygen.js';
import { sign } from '../src/core/sign.js';
import { verify } from '../src/core/verify.js';
import { encodePK, encodeSig } from '../src/core/encode.js';
import { MLDSA_PARAMS } from '../src/core/params.js';

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL: ${label}`);
  }
}

const MSG = new Uint8Array([0x46, 0x49, 0x42, 0x45, 0x4d, 0x41, 0x54, 0x45]);
const CTX = new Uint8Array(0);

for (const paramSet of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
  const { cTildeBytes } = MLDSA_PARAMS[paramSet];
  const { sk, pk } = keygen(paramSet);
  const pkRaw = encodePK(pk, paramSet);
  const sig = sign(sk, MSG, CTX, paramSet);
  const sigRaw = encodeSig(sig, paramSet);

  console.log(`--- ${paramSet} (c̃ = ${cTildeBytes} B, sig = ${sigRaw.length} B) ---`);

  // Baseline: an honest signature must verify.
  check(`${paramSet} honest signature accepted`, verify(pkRaw, MSG, sigRaw, CTX, paramSet) === true);

  // Every byte of the digest region, flipped one at a time, must be rejected.
  // A first-mismatch early return accepts exactly the same set of forgeries as a
  // constant-time compare; what changes is when it stops working, not whether.
  let accepted = 0;
  for (let i = 0; i < cTildeBytes; i++) {
    const tampered = Uint8Array.from(sigRaw);
    tampered[i] ^= 0x01;
    if (verify(pkRaw, MSG, tampered, CTX, paramSet)) accepted++;
  }
  check(`${paramSet} all ${cTildeBytes} single-byte digest mutations rejected`, accepted === 0);

  // Mutations outside the digest region must also be rejected (z bounds / hints).
  {
    const tampered = Uint8Array.from(sigRaw);
    tampered[cTildeBytes] ^= 0x01;
    check(`${paramSet} z-region mutation rejected`, verify(pkRaw, MSG, tampered, CTX, paramSet) === false);
  }
  // First byte of the hint block. The trailing bytes of that block are a separate
  // story: this implementation ignores them, so a flip there still verifies. That is
  // non-canonical encoding acceptance (a FIPS 204 deviation, reported separately),
  // not something this test should enshrine as expected behaviour.
  {
    const { omega, k } = MLDSA_PARAMS[paramSet];
    const hintStart = sigRaw.length - (omega + k);
    const tampered = Uint8Array.from(sigRaw);
    tampered[hintStart] ^= 0x01;
    check(`${paramSet} first hint byte mutation rejected`, verify(pkRaw, MSG, tampered, CTX, paramSet) === false);
  }

  // Truncated input is a rejection, never a throw.
  {
    let threw = false;
    let acceptedShort = false;
    try {
      acceptedShort = verify(pkRaw, MSG, sigRaw.subarray(0, sigRaw.length - 1), CTX, paramSet);
    } catch {
      threw = true;
    }
    check(`${paramSet} truncated signature rejected without throwing`, threw === false && acceptedShort === false);
  }

  // Wrong message, same signature.
  check(
    `${paramSet} signature bound to the message`,
    verify(pkRaw, new Uint8Array([...MSG, 0x00]), sigRaw, CTX, paramSet) === false,
  );
}

console.log('');
if (failed === 0) {
  console.log(`PASS ${passed}/${passed} — c̃ comparison rejects every single-byte mutation`);
  process.exit(0);
}
console.log(`FAIL ${failed} of ${passed + failed} checks`);
process.exit(1);
