// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SLH-DSA-128s smoke test (Noble implementation) — keygen/sign/verify
// Exit: 0=ALL PASS, 1=FAIL
import { slh_dsa_sha2_128s } from '@noble/post-quantum/slh-dsa.js';

const ROUNDS = 20;
let pass = 0, fail = 0;

// --- Key generation ---
console.log('KeyGen:');
let keys;
try {
  keys = slh_dsa_sha2_128s.keygen();
  console.log('  PASS (sk=' + keys.secretKey.length + 'B, pk=' + keys.publicKey.length + 'B)');
  pass++;
} catch (e) {
  console.log('  FAIL:', e.message);
  fail++;
}

// --- Sign + verify roundtrip ---
console.log('Roundtrip (' + ROUNDS + ' rounds):');
let rtPass = 0;
for (let i = 0; i < ROUNDS; i++) {
  const msg = new TextEncoder().encode('SLH-DSA test message ' + i);
  const sig = slh_dsa_sha2_128s.sign(msg, keys.secretKey);
  if (slh_dsa_sha2_128s.verify(sig, msg, keys.publicKey)) rtPass++;
}
if (rtPass === ROUNDS) { console.log('  ' + rtPass + '/' + ROUNDS + ' PASS'); pass++; }
else { console.log('  ' + rtPass + '/' + ROUNDS + ' FAIL'); fail++; }

// --- Tamper detection ---
console.log('Tamper detection:');
const msg = new TextEncoder().encode('test tamper');
const sig = slh_dsa_sha2_128s.sign(msg, keys.secretKey);
const tampered = new Uint8Array(sig);
tampered[10] ^= 0x01;
if (!slh_dsa_sha2_128s.verify(tampered, msg, keys.publicKey)) { console.log('  PASS'); pass++; }
else { console.log('  FAIL (tampered sig accepted)'); fail++; }

// --- Wrong key rejection ---
console.log('Wrong key rejection:');
const keys2 = slh_dsa_sha2_128s.keygen();
if (!slh_dsa_sha2_128s.verify(sig, msg, keys2.publicKey)) { console.log('  PASS'); pass++; }
else { console.log('  FAIL (wrong key accepted)'); fail++; }

// --- Empty message ---
console.log('Empty message:');
const emptyMsg = new Uint8Array(0);
const sigEmpty = slh_dsa_sha2_128s.sign(emptyMsg, keys.secretKey);
if (slh_dsa_sha2_128s.verify(sigEmpty, emptyMsg, keys.publicKey)) { console.log('  PASS (' + sigEmpty.length + 'B sig)'); pass++; }
else { console.log('  FAIL'); fail++; }

console.log('\n=== RESULT: ' + (fail === 0 ? 'ALL ' + pass + ' PASS' : pass + ' PASS / ' + fail + ' FAIL') + ' ===');
process.exit(fail === 0 ? 0 : 1);
