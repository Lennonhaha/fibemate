// SPDX-License-Identifier: GPL-3.0-only
// Cross-Noble interoperability test — fml-dsa core <-> Noble
// Validates that our verify accepts Noble's signatures and vice versa.
// FIPS 204 §4 step 7 domain separator fix.

import { ml_dsa44, ml_dsa65, ml_dsa87 } from '../src/index.js';
import { keygen as coreKeygen, verify as coreVerify } from '../src/core/all.js';
import { signEncoded } from '../src/core/sign.js';
import { encodePK } from '../src/core/encode.js';

const variants = { 'ML-DSA-44': ml_dsa44, 'ML-DSA-65': ml_dsa65, 'ML-DSA-87': ml_dsa87 };
const paramSets = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'];

function testVariant(paramSet) {
  const noble = variants[paramSet];
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = i + 1;
  const entropy = new Uint8Array(32);
  for (let i = 0; i < 32; i++) entropy[i] = 0x40 + i;

  const noblePk = noble.keygen(seed).publicKey;
  const nobleSk = noble.keygen(seed).secretKey;
  const msg = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // 1. Noble signs, our verify accepts
  const nobleSig = noble.sign(msg, nobleSk, { extraEntropy: entropy });
  const ourVerifyOnNoble = coreVerify(noblePk, msg, nobleSig, new Uint8Array(0), paramSet);

  // 2. We sign, Noble verify accepts
  const { pk: ourPkObj, sk: ourSk } = coreKeygen(paramSet);
  const ourPk = encodePK(ourPkObj, paramSet);
  const ourSig = signEncoded(ourSk, msg, new Uint8Array(0), paramSet);
  const nobleVerifyOnOurs = noble.verify(ourSig, msg, ourPk);

  // 3. Self-verify
  const nobleSelf = noble.verify(nobleSig, msg, noblePk);
  const ourSelf = coreVerify(ourPk, msg, ourSig, new Uint8Array(0), paramSet);

  const ok = ourVerifyOnNoble && nobleVerifyOnOurs && nobleSelf && ourSelf;
  console.log(`  ${paramSet}: noble→ours=${ourVerifyOnNoble}, ours→noble=${nobleVerifyOnOurs}, nobleSelf=${nobleSelf}, ourSelf=${ourSelf} ${ok ? '✓' : '✗'}`);
  return ok;
}

console.log('=== Cross-Noble interop test (FIPS 204 §4 step 7 domain separator) ===');
let allPass = true;
for (const paramSet of paramSets) {
  const ok = testVariant(paramSet);
  if (!ok) allPass = false;
}
console.log('==============================================');
console.log(allPass ? '✅ All cross-Noble interop tests PASSED' : '❌ Some tests FAILED');
process.exit(allPass ? 0 : 1);