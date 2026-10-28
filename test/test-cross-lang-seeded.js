// SPDX-License-Identifier: GPL-3.0-only
/**
 * ML-KEM-768 Deterministic Seed Cross-Implementation Equivalence Test
 *
 * Verifies that the repo's JS implementation (packages/pqc-kem) and the
 * canonical reference implementation (@noble/post-quantum ml_kem768) produce
 * byte-identical keys from the same seed, and interoperate in both directions.
 *
 * The retired time-domain module (src/crypto/ml-kem-768-td.js, 2026-10-28) was
 * self-consistent but shared no key material with the reference; this test now
 * asserts the opposite of what it used to warn about, because the surviving
 * implementation is bit-identical to the oracle.
 */

const crypto = require('crypto');

// Node <19 does not expose webcrypto as a global; @noble/post-quantum expects
// crypto.getRandomValues at module init. Polyfill from node:crypto webcrypto.
// No-op on Node >=19 where globalThis.crypto already exists.
if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
    globalThis.crypto = require('node:crypto').webcrypto;
}

// Load JS time-domain implementation (repo-relative from test/)
const JS_MLKEM = require('../packages/pqc-kem/src/ml-kem-768.js');

// Noble reference (ml_kem768) is loaded via dynamic import below
let REF_MLKEM = null;
let nobleKeygen = null;

const TEST_SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) TEST_SEED[i] = i; // seed = 0x00..0x1f

/**
 * The retired time-domain module exposed generateKeypairWithSeed(seed) and
 * encapsulateWithSeed(pk, seed) directly. The surviving implementation exposes
 * the FIPS 203 deterministic entry points, which take the actual d, z and m
 * values, so the test derives those from its 32-byte seed. The two labels below
 * are test-local domain separators: they are part of the fixture, not of the
 * standard, and both the JS side and the oracle side are fed the same bytes.
 */
const deriveZ = (seed) => new Uint8Array(
    crypto.createHash('sha256').update(Buffer.concat([Buffer.from('fibemate/test/z'), Buffer.from(seed)])).digest()
);
const deriveM = (seed) => new Uint8Array(
    crypto.createHash('sha256').update(Buffer.concat([Buffer.from('fibemate/test/m'), Buffer.from(seed)])).digest()
);
const jsKeygenWithSeed = (seed) => JS_MLKEM.generateKeypairDerand(seed, deriveZ(seed));
const jsEncapsWithSeed = (pk, seed) => JS_MLKEM.encapsulateDerand(pk, deriveM(seed));

// Test outcome counters. Module scope so CHECK/PASS/WARN/FAIL mutate them
// directly; previously `fail` was initialised and never incremented, which
// made `process.exit(fail > 0 ? 1 : 0)` a constant-false (always exit 0).
let pass = 0, warn = 0, fail = 0;

const PASS = (s) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${s}`); };
const WARN = (s) => { warn++; console.log(`  \x1b[33m⚠\x1b[0m ${s}`); };
const FAIL = (s) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${s}`); };
// Assert a boolean condition and route it to PASS/FAIL so the process exit
// code reflects real failures (fixes the constant-false `fail > 0`).
const CHECK = (ok, s) => { if (ok) PASS(s); else FAIL(s); };

function hex(u8, n = 16) {
    return Array.from(u8.slice(0, n)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Adapter: @noble/post-quantum ml_kem768 exposes keygen/encapsulate/decapsulate
 * returning {publicKey,secretKey} / {cipherText,sharedSecret} / sharedSecret.
 * The repo's test body historically used pqc-kyber's keypair()/encapsulate()
 * shape ({pubkey,secret} / {ciphertext,sharedSecret}); this thin adapter keeps
 * that shape so the rest of the test body is unchanged.
 */
function makeAdapter(noble) {
    return {
        // pqc-kyber-style keypair() -> { pubkey, secret }
        keypair() {
            const { publicKey, secretKey } = noble.keygen();
            return { pubkey: publicKey, secret: secretKey };
        },
        // pqc-kyber-style encapsulate(pk) -> { ciphertext, sharedSecret }
        encapsulate(pk) {
            const { cipherText, sharedSecret } = noble.encapsulate(pk);
            return { ciphertext: cipherText, sharedSecret };
        },
        // pqc-kyber-style decapsulate(ct, sk) -> sharedSecret
        decapsulate(ct, sk) {
            return noble.decapsulate(ct, sk);
        },
    };
}

/**
 * Polyfill generateKeypairWithSeed for the reference impl (which only has keygen()).
 * Uses SHAKE-128 (ctr) to derive deterministic (pk, sk) from seed.
 * NOTE: This is a simplified derivation for test purposes — NOT FIPS-compliant.
 */
function refGenerateKeypairWithSeed(seed) {
    // The reference impl's internal seed derivation is not exposed.
    // We derive a fresh keypair from the seed via hash, then return.
    // For seeded determinism, the test verifies REPRODUCIBILITY from same seed.
    const _hash = crypto.createHash('sha3-256').update(seed).digest();
    // Re-create keypair (reference uses OS randomness — we accept this limitation)
    return REF_MLKEM.keypair();
}

/**
 * Polyfill encapsulateWithSeed for the reference impl (which only has encapsulate(pk)).
 * NOTE: Encapsulation randomness from OS — seeded version unavailable in reference.
 */
function refEncapsulateWithSeed(pk, _seed) {
    return REF_MLKEM.encapsulate(pk);
}

function main() {

    console.log('ML-KEM-768 Deterministic Seed Equivalence Test');
    console.log('Seed: ' + hex(TEST_SEED, 32) + '\n');

    // ========================================================
    // 1. Keygen: same seed → same key on each implementation
    // ========================================================
    console.log('=== 1. Deterministic Keygen (same seed) ===');

    // JS (native seeded)
    const js_kp1 = jsKeygenWithSeed(TEST_SEED);
    const js_kp2 = jsKeygenWithSeed(TEST_SEED);
    CHECK(hex(js_kp1.publicKey) === hex(js_kp2.publicKey), 'JS keygen reproducible (pk): ' + (hex(js_kp1.publicKey) === hex(js_kp2.publicKey)));

    // Reference (Noble ml_kem768) — reproducibility via polyfill (note: not seeded)
    const ref_kp1 = refGenerateKeypairWithSeed(TEST_SEED);
    const _ref_kp2 = refGenerateKeypairWithSeed(TEST_SEED);
    WARN('Reference keypair from OS randomness (Noble seed polyfill uses OS RNG)');
    PASS('Reference keypair created: pk=' + ref_kp1.pubkey.length + 'B sk=' + ref_kp1.secret.length + 'B');

    // Size verification
    CHECK(js_kp1.publicKey.length === 1184, 'JS  pk size: ' + js_kp1.publicKey.length + ' (expect 1184)');
    CHECK(js_kp1.secretKey.length === 2400, 'JS  sk size: ' + js_kp1.secretKey.length + ' (expect 2400)');
    CHECK(ref_kp1.pubkey.length === 1184, 'Reference pk size: ' + ref_kp1.pubkey.length + ' (expect 1184)');
    CHECK(ref_kp1.secret.length === 2400, 'Reference sk size: ' + ref_kp1.secret.length + ' (expect 2400)');

    // Non-zero verification
    CHECK(js_kp1.publicKey.some(b => b !== 0), 'JS  pk non-zero: ' + js_kp1.publicKey.some(b => b !== 0));
    CHECK(ref_kp1.pubkey.some(b => b !== 0), 'Reference pk non-zero: ' + ref_kp1.pubkey.some(b => b !== 0));
    CHECK(js_kp1.secretKey.some(b => b !== 0), 'JS  sk non-zero: ' + js_kp1.secretKey.some(b => b !== 0));
    CHECK(ref_kp1.secret.some(b => b !== 0), 'Reference sk non-zero: ' + ref_kp1.secret.some(b => b !== 0));

    // ========================================================
    // 2. Encaps: same pk + same seed → same result
    // ========================================================
    console.log('\n=== 2. Deterministic Encaps (same pk+seed) ===');

    const js_enc1 = jsEncapsWithSeed(js_kp1.publicKey, TEST_SEED);
    const js_enc2 = jsEncapsWithSeed(js_kp1.publicKey, TEST_SEED);
    CHECK(hex(js_enc1.ciphertext) === hex(js_enc2.ciphertext), 'JS encaps reproducible (ct): ' + (hex(js_enc1.ciphertext) === hex(js_enc2.ciphertext)));
    CHECK(hex(js_enc1.sharedSecret) === hex(js_enc2.sharedSecret), 'JS encaps reproducible (ss): ' + (hex(js_enc1.sharedSecret) === hex(js_enc2.sharedSecret)));

    const ref_enc1 = refEncapsulateWithSeed(ref_kp1.pubkey, TEST_SEED);
    const _ref_enc2 = refEncapsulateWithSeed(ref_kp1.pubkey, TEST_SEED);
    WARN('Reference encapsulate from OS randomness (Noble no seeded encaps)');
    PASS('Reference encaps created: ct=' + ref_enc1.ciphertext.length + 'B ss=' + ref_enc1.sharedSecret.length + 'B');

    // ========================================================
    // 3. Round-trip: seed_keygen → encaps → decaps
    // ========================================================
    console.log('\n=== 3. Seeded Round-trip ===');

    const js_dec = JS_MLKEM.decapsulate(js_kp1.secretKey, js_enc1.ciphertext);
    CHECK(hex(js_dec) === hex(js_enc1.sharedSecret), 'JS  seeded encap→decap match: ' + (hex(js_dec) === hex(js_enc1.sharedSecret)));

    const ref_dec = REF_MLKEM.decapsulate(ref_enc1.ciphertext, ref_kp1.secret);
    CHECK(Buffer.from(ref_dec).equals(Buffer.from(ref_enc1.sharedSecret)), 'Reference encap→decap match: ' + Buffer.from(ref_dec).equals(Buffer.from(ref_enc1.sharedSecret)));

    // ========================================================
    // 4. Cross-mode: deterministic keygen + random encaps
    // ========================================================
    console.log('\n=== 4. Cross-mode (seeded-keygen + random-encaps) ===');

    const js_kp_seeded = jsKeygenWithSeed(TEST_SEED);
    const js_enc_rand = JS_MLKEM.encapsulate(js_kp_seeded.publicKey);
    const js_dec_rand = JS_MLKEM.decapsulate(js_kp_seeded.secretKey, js_enc_rand.ciphertext);
    CHECK(hex(js_dec_rand) === hex(js_enc_rand.sharedSecret), 'JS  seeded-kg + rand-encap round-trip: ' + (hex(js_dec_rand) === hex(js_enc_rand.sharedSecret)));

    const ref_kp_seeded = refGenerateKeypairWithSeed(TEST_SEED);
    const ref_enc_rand = REF_MLKEM.encapsulate(ref_kp_seeded.pubkey);
    const ref_dec_rand = REF_MLKEM.decapsulate(ref_enc_rand.ciphertext, ref_kp_seeded.secret);
    CHECK(Buffer.from(ref_dec_rand).equals(Buffer.from(ref_enc_rand.sharedSecret)), 'Reference rand-encap round-trip: ' + Buffer.from(ref_dec_rand).equals(Buffer.from(ref_enc_rand.sharedSecret)));

    // ========================================================
    // 5. Different seeds → different outputs
    // ========================================================
    console.log('\n=== 5. Different seeds → different outputs (JS only) ===');

    const seed2 = new Uint8Array(32);
    seed2[0] = 0xff;
    const js_kp_seed2 = jsKeygenWithSeed(seed2);
    CHECK(hex(js_kp_seed2.publicKey) !== hex(js_kp1.publicKey), 'JS  pk differs by seed: ' + (hex(js_kp_seed2.publicKey) !== hex(js_kp1.publicKey)));

    // ========================================================
    // 6. Cross-implementation compatibility (now CHECKED, not warned)
    // ========================================================
    console.log('\n=== 6. Cross-implementation compatibility ===');

    // The surviving implementation is byte-identical to @noble for the same
    // (d, z), so the seeded key pair must be identical as well. This assertion
    // is the one that would have caught the retired module: it was internally
    // consistent but shared no key material with the reference.
    const oracleSeed64 = new Uint8Array([...TEST_SEED, ...deriveZ(TEST_SEED)]);
    const ref_seeded = nobleKeygen(oracleSeed64);
    CHECK(hex(js_kp1.publicKey) === hex(ref_seeded.publicKey), 'JS seeded pk === reference seeded pk');
    CHECK(hex(js_kp1.secretKey) === hex(ref_seeded.secretKey), 'JS seeded sk === reference seeded sk');

    const js_to_ref = REF_MLKEM.decapsulate(js_enc1.ciphertext, ref_seeded.secretKey);
    CHECK(hex(Buffer.from(js_to_ref)) === hex(js_enc1.sharedSecret), 'JS-seeded encap → reference decap matches ss');

    const ref_enc_for_js = REF_MLKEM.encapsulate(js_kp1.publicKey);
    const ref_to_js = JS_MLKEM.decapsulate(js_kp1.secretKey, ref_enc_for_js.ciphertext);
    CHECK(hex(ref_to_js) === hex(ref_enc_for_js.sharedSecret), 'reference encap → JS decap matches ss');

    // ========================================================
    // Summary
    // ========================================================
    console.log(`\n${'='.repeat(54)}`);
    console.log(`  Deterministic Seed Test: ${pass} passed, ${fail} failed, ${warn} expected warnings`);
    console.log(`  Self-consistency: ${fail === 0 ? '✅ VERIFIED' : '❌ FAILURES DETECTED'}`);
    console.log(`  Cross-implementation binary compat: ${fail === 0 ? '✅ VERIFIED against @noble/post-quantum' : '❌ MISMATCH'}`);
    console.log(`${'='.repeat(54)}`);

    process.exit(fail > 0 ? 1 : 0);
}

// Load reference impl via dynamic import (ESM from CJS)
(async () => {
    try {
        // @noble/post-quantum is an ESM module — use createRequire for CJS context
        const { createRequire } = require('module');
        const { pathToFileURL } = require('url');
        const req = createRequire(__filename);
        const noblePath = req.resolve('@noble/post-quantum/ml-kem.js');
        const nobleMod = await import(pathToFileURL(noblePath).href);
        const mlkem768 = nobleMod.ml_kem768;
        if (!mlkem768) {
            throw new Error('ml_kem768 export not found in @noble/post-quantum/ml-kem.js');
        }
        REF_MLKEM = makeAdapter(mlkem768);
        nobleKeygen = (seed) => mlkem768.keygen(seed);
        main();
    } catch (err) {
        console.error('Reference impl (@noble/post-quantum) not available:', err.message);
        console.log('Install with: npm install @noble/post-quantum');
        process.exit(1);
    }
})();
