// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/test/verify-canonical-signature.test.js — issue #456 regression kit
//
// The decoder stops reading hint data once it has collected the k row counts, so the
// bytes after the last index are never examined. Flipping one of them still verifies,
// which gives one (pk, msg) pair many accepted signature byte strings. That breaks
// anything treating the signature as an identifier: replay caches, dedup, audit-log
// correlation.
//
// The size of the hole is NOT a constant per parameter set: it varies with the hint
// content of each signature. Measured 2026-11-14 over twelve keys across the three
// sets, the accepted offsets were always contiguous and always inside the final hint
// block, with spans between 3 and 35 bytes - a different number on every key. The
// issue's first table
// (44: 24, 65: 16, 87: 12) recorded one keypair, not a property of the parameter set;
// this file reports the span per run instead of asserting a number that would be wrong
// on the next key.
//
// This file is the regression kit for the fix, not the fix. Two modes:
//
//   node test/verify-canonical-signature.test.js           audit — reports, exit 0
//   node test/verify-canonical-signature.test.js --strict  gate  — exit 1 today
//
// Deliberately NOT wired into `npm test` or CI yet: --strict fails against current
// main, and a permanently red job is a job people learn to ignore. When decodeSig()
// rejects non-zero trailing bytes, wire it in and drop the audit default.
//
// 2026-11-14

import { keygen } from '../src/core/keygen.js';
import { sign } from '../src/core/sign.js';
import { verify } from '../src/core/verify.js';
import { encodePK, encodeSig } from '../src/core/encode.js';

const STRICT = process.argv.includes('--strict');
const ROUNDS = Number(process.env.FML_DSA_CANONICAL_ROUNDS || 4);

const MSG = new Uint8Array([0x46, 0x49, 0x42, 0x45, 0x4d, 0x41, 0x54, 0x45]);
const CTX = new Uint8Array(0);

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

console.log(`mode: ${STRICT ? 'strict (gate)' : 'audit (reports, does not fail)'}`);
console.log('issue: #456 — non-canonical signature encodings accepted');
console.log('');

for (const paramSet of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
  console.log(`--- ${paramSet} ---`);

  // Several keys per set: the size of the unvalidated tail is a property of the hint
  // content, so one key proves nothing about the next.
  let spans = [];
  for (let round = 0; round < ROUNDS; round++) {
    const { sk, pk } = keygen(paramSet);
    const pkRaw = encodePK(pk, paramSet);
    const sigRaw = encodeSig(sign(sk, MSG, CTX, paramSet), paramSet);

    // Guard against a test that passes by rejecting everything.
    const honest = verify(pkRaw, MSG, sigRaw, CTX, paramSet);
    check(`${paramSet} honest signature accepted`, honest === true);
    if (!honest) continue;

    const accepted = [];
    for (let i = 0; i < sigRaw.length; i++) {
      const tampered = Uint8Array.from(sigRaw);
      tampered[i] ^= 0x01;
      if (verify(pkRaw, MSG, tampered, CTX, paramSet)) accepted.push(i);
    }

    const contiguous = accepted.length > 0 && accepted[accepted.length - 1] - accepted[0] + 1 === accepted.length;
    spans.push(accepted.length);

    console.log(
      `  round ${round + 1}: sig ${sigRaw.length} B, accepted mutations ${accepted.length}` +
        (accepted.length ? ` (offsets ${accepted[0]}..${accepted[accepted.length - 1]}${contiguous ? ', contiguous' : ', NOT contiguous'})` : ''),
    );

    if (STRICT) {
      check(`${paramSet} round ${round + 1}: no single-byte mutation verifies`, accepted.length === 0);
    }
  }

  const min = Math.min(...spans);
  const max = Math.max(...spans);
  console.log(`  span across ${spans.length} keys: ${min}..${max} bytes${min === max ? ' (same)' : ' (varies)'}`);
}

// A canonical signature must keep verifying after the fix: rejecting everything would
// satisfy the mutation check and destroy the library, so the baseline is asserted
// above, per key, before any mutation is tried.
console.log('');
if (STRICT) {
  if (failed === 0) {
    console.log(`PASS ${passed}/${passed} — non-canonical signatures rejected`);
    process.exit(0);
  }
  console.log(`FAIL ${failed} of ${passed + failed} checks — the decoder still accepts non-canonical tails`);
  process.exit(1);
}

console.log(`AUDIT only: ${passed} baseline checks passed, ${failed} failed. Use --strict to gate.`);
process.exit(0);
