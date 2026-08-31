// SPDX-License-Identifier: GPL-3.0-only
/**
 * SM2 multi-signature teaching package — tests.
 * Covers: 3-party aggregation, n=1 reduction, tamper rejection, SM3 KAT.
 */
'use strict';
const assert = require('assert');
const { sm3 } = require('../src/sm3.js');
const { multiSign, verify, pointMul, G } = require('../src/sm2-multisig.js');

const randomKey = () => {
  const bytes = require('crypto').randomBytes(32);
  const n = BigInt('0x' + bytes.toString('hex'));
  return (n % (BigInt('0xfffffffeffffffffffffffffffffffff7203df6b21c6052b53bbf40939d54123') - 1n)) + 1n;
};

// ── SM3 KAT (GB/T 32905-2016 A.1: "abc") ──
const sm3Abc = Buffer.from(sm3(Buffer.from('abc', 'utf8'))).toString('hex');
assert.strictEqual(sm3Abc, '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0',
  'SM3("abc") KAT mismatch');

// ── 3-party aggregation ──
{
  const keys = [randomKey(), randomKey(), randomKey()];
  const msg = 'FIBEMATE 3-party SM2 multi-signature';
  const sig = multiSign({ privateKeys: keys, message: msg, id: 'fibemate-multisig' });
  assert.ok(sig.r > 0n && sig.s > 0n, 'signature must be non-trivial');

  const ok = verify({
    aggregatePublicKey: sig.aggregatePublicKey,
    message: msg, id: 'fibemate-multisig',
    signature: { r: sig.r, s: sig.s }
  });
  assert.ok(ok, '3-party multi-signature must verify');

  // tampered message must fail
  const bad = verify({
    aggregatePublicKey: sig.aggregatePublicKey,
    message: msg + 'x', id: 'fibemate-multisig',
    signature: { r: sig.r, s: sig.s }
  });
  assert.ok(!bad, 'tampered message must be rejected');

  // tampered s must fail
  const badS = verify({
    aggregatePublicKey: sig.aggregatePublicKey,
    message: msg, id: 'fibemate-multisig',
    signature: { r: sig.r, s: (sig.s + 1n) % BigInt('0xfffffffeffffffffffffffffffffffff7203df6b21c6052b53bbf40939d54123') }
  });
  assert.ok(!badS, 'tampered s must be rejected');
  console.log('[OK] 3-party aggregate sign + verify + tamper rejection');
}

// ── n=1 reduction (single signer = SM2-style over P*) ──
{
  const keys = [randomKey()];
  const msg = 'single-signer reduction';
  const sig = multiSign({ privateKeys: keys, message: msg, id: 'fibemate-multisig' });
  const ok = verify({
    aggregatePublicKey: sig.aggregatePublicKey,
    message: msg, id: 'fibemate-multisig',
    signature: { r: sig.r, s: sig.s }
  });
  assert.ok(ok, 'single signer must verify (reduction)');
  assert.deepStrictEqual(sig.aggregatePublicKey, pointMul(keys[0], G), 'n=1 aggregate pk == signer pk');
  console.log('[OK] n=1 reduction');
}

// ── 2-party with different IDs ──
{
  const keys = [randomKey(), randomKey()];
  const msg = 'two-party';
  const sig = multiSign({ privateKeys: keys, message: msg, id: 'a' });
  const ok = verify({ aggregatePublicKey: sig.aggregatePublicKey, message: msg, id: 'a', signature: sig });
  assert.ok(ok, '2-party must verify');
  // different ID (different ZA) must fail
  const badId = verify({ aggregatePublicKey: sig.aggregatePublicKey, message: msg, id: 'b', signature: sig });
  assert.ok(!badId, 'different signer ID must be rejected');
  console.log('[OK] 2-party + ID binding');
}

console.log('All SM2 multi-signature tests passed ✓');
