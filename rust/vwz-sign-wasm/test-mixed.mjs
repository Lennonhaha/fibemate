// End-to-end validation of the hardened (mixed rank-2) VWZ WASM build.
// Uses the real WASM `verify()` as the authoritative oracle.
// Run: node test-mixed.mjs
import { readFileSync } from 'node:fs';
import init, {
  initSync,
  keygen_seeded,
  sign,
  verify,
  verify_batch,
  serialize_signature,
  deserialize_signature,
  estimate_sizes,
} from './pkg/vwz_signature.js';

const wasmBytes = readFileSync(new URL('./pkg/vwz_signature_bg.wasm', import.meta.url));
initSync({ module: wasmBytes });

let passed = 0;
let failed = 0;

function check(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok: ${label}`); }
  else { failed++; console.log(`  FAIL: ${label} ${extra}`); }
}

// 1. Roundtrip across seeds × k × messages (mirrors Python 300/300).
console.log('--- roundtrip (via official WASM verify) ---');
const seeds = [101n, 202n, 303n];
const ks = [2, 4, 8, 16];
let total = 0;
for (const seed of seeds) {
  for (const k of ks) {
    const kp = keygen_seeded(k, seed);
    const pk = kp.public_key();
    const sk = kp.secret_key();
    for (let i = 0; i < 25; i++) {
      const msg = new TextEncoder().encode(`stress s${seed} k${k} m${i}`);
      const sig = sign(sk, msg);
      check(`k=${k} s=${seed} m=${i}`, verify(pk, msg, sig));
      total++;
    }
  }
}
console.log(`roundtrip verified: ${total} signatures, all accepted by official verify()`);

// 2. Tamper rejection.
console.log('--- tamper rejection ---');
{
  const kp = keygen_seeded(8, 12345n);
  const pk = kp.public_key();
  const sk = kp.secret_key();
  const msg = new TextEncoder().encode('authentic message');
  const sig = sign(sk, msg);
  check('valid sig accepted', verify(pk, msg, sig));
  check('wrong msg rejected', !verify(pk, new TextEncoder().encode('forged message'), sig));
  const tampered = new TextEncoder().encode('authentic messagex');
  check('modified msg rejected', !verify(pk, tampered, sig));
  // Corrupt a w2 element via serialization roundtrip.
  const bytes = serialize_signature(sig);
  bytes[1] = bytes[1] ^ 0x01;
  const badSig = deserialize_signature(bytes);
  check('corrupted sig rejected', !verify(pk, msg, badSig));
}

// 3. verify_batch (all valid + one tampered).
console.log('--- verify_batch ---');
{
  const kp = keygen_seeded(4, 7n);
  const pk = kp.public_key();
  const sk = kp.secret_key();
  const msgs = [];
  const sigs = [];
  for (let i = 0; i < 20; i++) {
    const msg = new TextEncoder().encode(`batch ${i}`);
    const sig = sign(sk, msg);
    msgs.push(msg);
    sigs.push(serialize_signature(sig));
  }
  const all = verify_batch(pk, msgs, sigs);
  check('batch all valid', all.every((b) => b === true));
  const tamperedMsgs = msgs.slice();
  tamperedMsgs[7] = new TextEncoder().encode('TAMPERED');
  const r2 = verify_batch(pk, tamperedMsgs, sigs);
  check('batch tamper idx7 false', r2[7] === false);
  check('batch rest still true', r2.filter((_, i) => i !== 7).every((b) => b === true));
}

// 4. Serialization roundtrip + sizes.
console.log('--- serialization / sizes ---');
{
  const kp = keygen_seeded(4, 42n);
  const pk = kp.public_key();
  const sk = kp.secret_key();
  const msg = new TextEncoder().encode('ser test');
  const sig = sign(sk, msg);
  const sigBytes = serialize_signature(sig);
  const sig2 = deserialize_signature(sigBytes);
  check('sig serialize→deserialize roundtrip', verify(pk, msg, sig2));
  const sizes = JSON.parse(estimate_sizes(8));
  check('k=8 PK=10404B', sizes.pk_bytes === 10404, `got ${sizes.pk_bytes}`);
  check('k=8 sig=68B', sizes.sig_bytes === 68, `got ${sizes.sig_bytes}`);
  check('k=8 N=18', sizes.N === 18, `got ${sizes.N}`);
  check('k=8 M=17', sizes.M === 17, `got ${sizes.M}`);
}

// 5. Determinism: same key + message → same signature.
console.log('--- determinism ---');
{
  const kp = keygen_seeded(4, 99n);
  const sk = kp.secret_key();
  const msg = new TextEncoder().encode('det test');
  const s1 = serialize_signature(sign(sk, msg));
  const s2 = serialize_signature(sign(sk, msg));
  check('sign deterministic', Buffer.compare(Buffer.from(s1), Buffer.from(s2)) === 0);
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL WASM VALIDATION TESTS PASSED');
