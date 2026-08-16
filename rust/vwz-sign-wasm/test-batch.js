// End-to-end test for verify_batch in real WASM runtime (Node.js).
const vwz = require('./pkg/vwz_signature.js');

const { keygen_seeded, sign, verify, verify_batch, serialize_signature } = vwz;

function bench(label, fn) {
  const t0 = process.hrtime.bigint();
  fn();
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  console.log(`${label}: ${ms.toFixed(2)} ms`);
  return ms;
}

function main() {
  const kp = keygen_seeded(8, 12345n);
  const pk = kp.public_key();
  const sk = kp.secret_key();

  // 1. Correctness: 100 valid signatures
  const N = 100;
  const msgs = [];
  const sigs = [];
  for (let i = 0; i < N; i++) {
    const msg = new TextEncoder().encode(`batch message ${i}`);
    const sig = sign(sk, msg);
    msgs.push(msg);
    sigs.push(serialize_signature(sig));
  }

  // verify_batch should return all true
  const results = verify_batch(pk, msgs, sigs);
  const allTrue = results.every((b) => b === true);
  console.log(`\nverify_batch (${N} valid): all true = ${allTrue} (${results.length} results)`);
  if (!allTrue) process.exit(1);

  // 2. Tamper detection: flip one message
  const tampered = msgs.slice();
  tampered[50] = new TextEncoder().encode('TAMPERED');
  const results2 = verify_batch(pk, tampered, sigs);
  const idx50False = results2[50] === false;
  const restTrue = results2.filter((b, i) => i !== 50).every((b) => b === true);
  console.log(`tamper detection: [50]=${results2[50]}, rest true = ${restTrue}`);
  if (!idx50False || !restTrue) process.exit(1);

  // 3. Single verify vs verify_batch benchmark
  console.log('\n--- Benchmark (k=8, N=100) ---');
  // warmup
  verify(pk, msgs[0], vwz.deserialize_signature(sigs[0]));
  verify_batch(pk, msgs, sigs);

  // single verify x N
  const singleMs = bench(`verify x ${N} (loop)`, () => {
    for (let i = 0; i < N; i++) {
      verify(pk, msgs[i], vwz.deserialize_signature(sigs[i]));
    }
  });

  // verify_batch once
  const batchMs = bench(`verify_batch x ${N} (one call)`, () => {
    verify_batch(pk, msgs, sigs);
  });

  const speedup = (singleMs / batchMs).toFixed(2);
  console.log(`\nSpeedup: ${speedup}x`);

  console.log('\nALL TESTS PASSED ✅');
}

function benchLargeK(k) {
  console.log(`\n=== Benchmark k=${k} ===`);
  const t_key = process.hrtime.bigint();
  const kp = keygen_seeded(k, 999n);
  const pk = kp.public_key();
  const sk = kp.secret_key();
  const t_keygen = Number(process.hrtime.bigint() - t_key) / 1e6;
  console.log(`keygen: ${t_keygen.toFixed(0)} ms`);

  const N = 20;
  const msgs = [];
  const sigs = [];
  for (let i = 0; i < N; i++) {
    const msg = new TextEncoder().encode(`msg ${i}`);
    const sig = sign(sk, msg);
    msgs.push(msg);
    sigs.push(serialize_signature(sig));
  }
  const sigObjs = sigs.map((s) => vwz.deserialize_signature(s));

  // warmup
  verify(pk, msgs[0], sigObjs[0]);
  verify_batch(pk, msgs, sigs);

  const singleMs = bench(`verify x ${N} (loop)`, () => {
    for (let i = 0; i < N; i++) verify(pk, msgs[i], sigObjs[i]);
  });
  const batchMs = bench(`verify_batch x ${N} (one call)`, () => {
    verify_batch(pk, msgs, sigs);
  });
  console.log(`k=${k} Speedup: ${(singleMs / batchMs).toFixed(2)}x`);
}

benchLargeK(16);
benchLargeK(32);

main();
