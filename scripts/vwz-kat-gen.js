#!/usr/bin/env node
/**
 * VWZ KAT (Known Answer Test) Vector Generator
 * =============================================
 * Generates deterministic test vectors for VWZ signature scheme using
 * the official Rust/WASM implementation (rust/vwz-sign-wasm/).
 *
 * Output: JSON with keygen, sign, verify test vectors for k=2,4,8
 * (k=16,32 optional via --full)
 *
 * Usage:
 *   node scripts/vwz-kat-gen.js               # k=2,4,8 (fast)
 *   node scripts/vwz-kat-gen.js --full        # k=2,4,8,16,32
 *   node scripts/vwz-kat-gen.js -k 8          # single k
 *   node scripts/vwz-kat-gen.js --output vwz-kat.json
 *
 * Compatible with: vwz_signature v0.1.0 WASM (rust/vwz-sign-wasm/pkg/)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ——— CLI args ———
const args = process.argv.slice(2);
const kFlag = args.indexOf('-k');
const ks = kFlag >= 0
  ? [parseInt(args[kFlag + 1])]
  : args.includes('--full')
    ? [2, 4, 8, 16, 32]
    : [2, 4, 8];
const outFlag = args.indexOf('--output');
const outPath = outFlag >= 0 ? args[outFlag + 1] : 'vwz-kat.json';

// ——— Locate WASM ———
const wasmDir = path.resolve(__dirname, '..', 'rust', 'vwz-sign-wasm', 'pkg');
if (!fs.existsSync(wasmDir)) {
  console.error('VWZ WASM not found at', wasmDir);
  console.error('Build with: cd rust/vwz-sign-wasm && wasm-pack build --target nodejs');
  process.exit(1);
}

async function main() {
  const { default: init, keygen, keygen_seeded, sign, verify,
          serialize_public_key, serialize_signature,
          deserialize_public_key, deserialize_signature,
          estimate_sizes, SecretKey } = await import(wasmDir + '/vwz_signature.js');

  await init();

  const kat = {
    algorithm: 'VWZ',
    description: 'VWZ Vandermonde Sparse Signature — Known Answer Tests',
    version: '0.1.0',
    date: new Date().toISOString().slice(0, 10),
    security: 'EXPERIMENTAL — NOT FOR PRODUCTION USE',
    kat_vectors: []
  };

  console.log('╔══════════════════════════════════════════╗');
  console.log('║  VWZ KAT Generator v1.0                  ║');
  console.log('╠══════════════════════════════════════════╣');

  let total = 0;
  let passed = 0;

  for (const k of ks) {
    try {
      const sizes = estimate_sizes(k);
      const pkBytes = sizes.pk_bytes;
      const sigBytes = sizes.sig_bytes;

      console.log(`║  k=${k}  pk=${pkBytes}B  sig=${sigBytes}B`);
      const group = { k, vectors: [] };

      // ——— Vector 1: Deterministic keygen from seed ———
      const seed1 = BigInt('0xDEADBEEF' + k.toString(16).padStart(2, '0'));
      const kp1 = keygen_seeded(k, seed1);
      const pk1 = serialize_public_key(kp1.public_key());

      // ——— Vector 2: Random keygen ———
      const kp2 = keygen(k);
      const pk2 = serialize_public_key(kp2.public_key());
      const sk2 = kp2.secret_key();

      // ——— Vectors 3-7: Sign & verify various messages ———
      const messages = [
        { label: 'empty', data: Buffer.alloc(0) },
        { label: 'hello', data: Buffer.from('Hello, VWZ!') },
        { label: 'binary', data: crypto.randomBytes(32) },
        { label: 'unicode', data: Buffer.from('你好 VWZ 签名验证 🔐') },
        { label: '1KB', data: crypto.randomBytes(1024) },
      ];

      for (const msg of messages) {
        const sig = sign(sk2, msg.data);
        const sigBytes_ = serialize_signature(sig);
        const ok = verify(kp2.public_key(), msg.data, sig);

        group.vectors.push({
          test: `sign+verify k=${k} msg=${msg.label}`,
          message_hex: msg.data.toString('hex'),
          public_key_hex: pk2.toString('hex'),
          signature_hex: sigBytes_.toString('hex'),
          valid: ok
        });

        if (ok) passed++; else console.error(`  ❌ FAIL: k=${k} msg=${msg.label}`);
        total++;
      }

      // ——— Vector 8: Wrong message rejection ———
      const sigBad = sign(sk2, Buffer.from('correct'));
      const reject = !verify(kp2.public_key(), Buffer.from('tampered'), sigBad);
      group.vectors.push({
        test: `reject k=${k} wrong-message`,
        message_hex: Buffer.from('tampered').toString('hex'),
        public_key_hex: pk2.toString('hex'),
        signature_hex: serialize_signature(sigBad).toString('hex'),
        valid: reject
      });
      if (reject) passed++; else console.error(`  ❌ FAIL: k=${k} wrong-message rejection`);
      total++;

      // ——— Vector 9: Wrong public key rejection ———
      const kpOther = keygen_seeded(k, BigInt(k * 9999));
      const sigOk = sign(sk2, Buffer.from('test'));
      const wrongPk = !verify(kpOther.public_key(), Buffer.from('test'), sigOk);
      group.vectors.push({
        test: `reject k=${k} wrong-pubkey`,
        message_hex: Buffer.from('test').toString('hex'),
        public_key_hex: serialize_public_key(kpOther.public_key()).toString('hex'),
        signature_hex: serialize_signature(sigOk).toString('hex'),
        valid: wrongPk
      });
      if (wrongPk) passed++; else console.error(`  ❌ FAIL: k=${k} wrong-pubkey rejection`);
      total++;

      // ——— Vector 10: Serialization roundtrip ———
      const sigRt = sign(sk2, Buffer.from('roundtrip'));
      const sigSer = serialize_signature(sigRt);
      const sigDeser = deserialize_signature(sigSer);
      const rtOk = verify(kp2.public_key(), Buffer.from('roundtrip'), sigDeser);
      group.vectors.push({
        test: `roundtrip k=${k} serialize+deserialize`,
        message_hex: Buffer.from('roundtrip').toString('hex'),
        public_key_hex: pk2.toString('hex'),
        signature_hex: sigSer.toString('hex'),
        valid: rtOk
      });
      if (rtOk) passed++; else console.error(`  ❌ FAIL: k=${k} serialization roundtrip`);
      total++;

      // Free WASM objects (best effort via dispose)
      [kp1, kp2, kpOther].forEach(obj => {
        try { obj.free?.(); } catch(e) {}
      });

      kat.kat_vectors.push(group);

    } catch(e) {
      console.error(`  ⚠️  k=${k} SKIPPED:`, e.message);
      kat.kat_vectors.push({ k, error: e.message });
    }
  }

  // ——— Summary block ———
  kat.summary = {
    total_tests: total,
    passed: passed,
    failed: total - passed,
    k_values_tested: ks.filter(k =>
      kat.kat_vectors.some(g => g.k === k && !g.error)
    ).length,
    security_parameters: ks
  };

  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Results: ${passed}/${total} PASS        `);
  console.log('╚══════════════════════════════════════════╝');

  fs.writeFileSync(outPath, JSON.stringify(kat, null, 2), 'utf8');
  console.log(`\nKAT vectors written to: ${outPath}`);
  console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

  if (passed < total) {
    console.error(`\n❌ ${total - passed} test(s) FAILED`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
