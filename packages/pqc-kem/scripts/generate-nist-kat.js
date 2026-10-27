// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * Deterministic ML-KEM-768 KAT generator — FIPS 203, canonical sk layout.
 *
 * Determinism
 *   A dispatcher replaces globalThis.crypto.getRandomValues and feeds fixed
 *   entropy: (d, z) to KeyGen and m to Encaps. Every vector is therefore
 *   reproducible bit-for-bit, and the whole file is byte-identical across runs
 *   (no timestamp is embedded by default — pass --stamp to add one).
 *
 * Verification is mandatory — NOTHING is written unless all four checks pass
 * for every vector:
 *   V1 roundtrip      decapsulate(dk, c) === k                       (our impl)
 *   V2 reference      @noble/post-quantum: keygen(d||z).ek === ek
 *                     and its decapsulate(c, dk) === k
 *   V3 independent    k === SHA3-512(m || SHA3-256(ek))[0:32]        (FIPS 203 §7.2/§7.3)
 *   V4 layout         dk === dkPKE || ek || H(ek) || z   (2400 B, FIPS 203 §7.1)
 *   V5 addon (opt.)   if a native addon loads, its sk layout MUST be canonical;
 *                     a non-canonical addon aborts generation (it must never
 *                     silently shape the published vectors).
 * On any failure: exit 1 and write nothing.
 *
 * Usage: node generate-nist-kat.js [count] [outPath] [--count N] [--out P] [--dry-run] [--stamp]
 * Exit:  0 written | 1 verification failed | 2 dependency/tooling error
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OURS = path.resolve(__dirname, '..', 'src', 'ml-kem-768.js');
const DEFAULT_OUT = path.resolve(__dirname, '..', 'test', 'kat', 'mlkem-768-KAT.rsp');
const D_BYTES = 32, Z_BYTES = 32, M_BYTES = 32;
const EK_BYTES = 1184, DK_BYTES = 2400, CT_BYTES = 1088, K_BYTES = 32;
const DK_PKE_BYTES = DK_BYTES - EK_BYTES - 2 * Z_BYTES;   // 1152

const sha3_256 = (b) => crypto.createHash('sha3-256').update(b).digest();
const sha3_512 = (b) => crypto.createHash('sha3-512').update(b).digest();
const hex = (b) => Buffer.from(b).toString('hex');
const die = (code, msg) => { process.stderr.write('ERROR: ' + msg + '\n'); process.exit(code); };

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { count: 100, out: DEFAULT_OUT, dryRun: false, stamp: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') o.count = parseInt(argv[++i], 10);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--stamp') o.stamp = true;
    else if (/^\d+$/.test(a)) o.count = parseInt(a, 10);
    else rest.push(a);
  }
  if (rest.length) o.out = rest[0];
  if (!Number.isInteger(o.count) || o.count < 1) die(2, 'bad --count');
  return o;
}

// ── Deterministic entropy ────────────────────────────────────────────────────
function deriveSeed(counter, salt) {
  const input = Buffer.alloc(12);
  input.writeUInt32BE(counter >>> 0, 0);
  input.writeUInt32BE(salt >>> 0, 4);
  input.writeUInt32BE(0x4D4C4B45, 8);            // 'MLKE'
  return sha3_256(input).slice(0, 32);
}
/** z is derived from the vector seed so the .rsp keeps its historical fields. */
function deriveZ(seed) { return sha3_256(Buffer.concat([seed, Buffer.from('MLKE-z')])).slice(0, 32); }

/**
 * Run fn with a deterministic RNG. Each call to getRandomValues must consume
 * exactly one queued chunk of the requested size; leftovers are a failure
 * (guards against silently-unused injection).
 */
function withRng(chunks, fn) {
  const target = globalThis.crypto;
  if (!target || typeof target.getRandomValues !== 'function') {
    die(2, 'globalThis.crypto.getRandomValues unavailable (Node >= 19 required)');
  }
  const real = target.getRandomValues.bind(target);
  const queue = chunks.map((c) => Uint8Array.from(c));
  const calls = [];
  target.getRandomValues = (buf) => {
    const next = queue.shift();
    if (!next) throw new Error('implementation requested more entropy than injected');
    if (next.length !== buf.length) throw new Error(`size mismatch: injected ${next.length} B, requested ${buf.length} B`);
    calls.push(buf.length);
    buf.set(next);
    return buf;
  };
  try { return { value: fn(), calls, left: () => queue.length }; }
  finally { target.getRandomValues = real; }
}

// ── Optional native addon probe (V5) ────────────────────────────────────────
function probeAddon() {
  const cands = [
    path.resolve(__dirname, '..', 'native', 'build', 'Release', 'mlkem.node'),
    '/opt/fibemate-full/addon/build/Release/mlkem.node',
  ];
  for (const p of cands) {
    let addon = null;
    try { addon = require(p); } catch (_) { continue; }
    let note = { path: p, canonical: null };
    try {
      const [pk, sk] = addon.keygen();
      const ek = Buffer.from(pk), dk = Buffer.from(sk);
      note.canonical = dk.length === DK_BYTES && dk.subarray(DK_PKE_BYTES, DK_BYTES - 2 * Z_BYTES).equals(ek);
      note.skBytes = dk.length;
    } catch (e) { note.canonical = null; note.error = e.message; }
    return note;
  }
  return null;
}

// ── Generator ───────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let ours, noble;
  try { ours = require(OURS); } catch (e) { die(2, 'cannot load our implementation: ' + e.message); }
  try { ({ ml_kem768: noble } = await import('file://' + path.resolve(__dirname, '..', '..', '..', 'node_modules', '@noble', 'post-quantum', 'ml-kem.js').replace(/\\/g, '/'))); }
  catch (e) { die(2, 'cannot load @noble/post-quantum: ' + e.message); }

  console.log('FIBEMATE ML-KEM-768 KAT generator  ·  ' + opts.count + ' vectors  ·  FIPS 203 canonical');
  console.log('Ours: ' + OURS + '  (SECRET_KEY_BYTES=' + ours.SECRET_KEY_BYTES + ')');

  const addonNote = probeAddon();
  if (addonNote) {
    console.log('Native addon: ' + addonNote.path + ' (sk=' + addonNote.skBytes + ' B, canonical=' + addonNote.canonical + ')');
    if (addonNote.canonical === false) {
      die(1, 'native addon sk layout is NOT canonical FIPS 203 — refusing to generate vectors from it');
    }
  } else {
    console.log('Native addon: not present (JS + reference path only)');
  }

  const vectors = [];
  const failures = [];
  const fail = (i, msg) => failures.push('#' + i + ' ' + msg);

  for (let i = 0; i < opts.count; i++) {
    const seed = deriveSeed(i, 0x6B65796E);      // 'keyn'  → d
    const z = deriveZ(seed);
    const m = deriveSeed(i, 0x656E6361);         // 'enca'

    let kp, enc;
    try {
      kp = withRng([seed, z], () => ours.generateKeypair());
      if (kp.calls.length !== 2 || kp.left() !== 0) fail(i, 'keygen consumed ' + JSON.stringify(kp.calls) + ' left=' + kp.left());
      enc = withRng([m], () => ours.encapsulate(kp.value.publicKey));
      if (enc.calls.length !== 1 || enc.left() !== 0) fail(i, 'encaps consumed ' + JSON.stringify(enc.calls) + ' left=' + enc.left());
    } catch (e) { fail(i, 'rng/impl error: ' + e.message); continue; }

    const ek = Buffer.from(kp.value.publicKey);
    const dk = Buffer.from(kp.value.secretKey);
    const c = Buffer.from(enc.value.ciphertext);
    const k = Buffer.from(enc.value.sharedSecret);

    // V4 layout
    if (dk.length !== DK_BYTES) fail(i, 'dk length ' + dk.length);
    if (!dk.subarray(DK_PKE_BYTES, DK_BYTES - 2 * Z_BYTES).equals(ek)) fail(i, 'dk[1152..2336] != ek (non-canonical)');
    if (!dk.subarray(DK_BYTES - 2 * Z_BYTES, DK_BYTES - Z_BYTES).equals(sha3_256(ek))) fail(i, 'dk[2336..2368] != H(ek)');
    if (!dk.subarray(DK_BYTES - Z_BYTES).equals(z)) fail(i, 'dk[2368..2400] != z');

    // V1 roundtrip
    try {
      if (hex(ours.decapsulate(dk, c)) !== hex(k)) fail(i, 'V1 ours decaps != k');
    } catch (e) { fail(i, 'V1 threw: ' + e.message); }

    // V2 reference implementation
    try {
      const nkp = noble.keygen(Buffer.concat([seed, z]));
      if (!Buffer.from(nkp.publicKey).equals(ek)) fail(i, 'V2 noble keygen ek != ek');
      if (hex(noble.decapsulate(c, dk)) !== hex(k)) fail(i, 'V2 noble decaps != k');
    } catch (e) { fail(i, 'V2 threw: ' + e.message); }

    // V3 independent formula
    if (hex(sha3_512(Buffer.concat([m, sha3_256(ek)])).subarray(0, K_BYTES)) !== hex(k)) fail(i, 'V3 k != SHA3-512(m||H(ek))[0:32]');

    // sanity of the declared sizes
    if (ek.length !== EK_BYTES) fail(i, 'ek length ' + ek.length);
    if (c.length !== CT_BYTES) fail(i, 'c length ' + c.length);
    if (k.length !== K_BYTES) fail(i, 'k length ' + k.length);
    if (m.length !== M_BYTES || seed.length !== D_BYTES) fail(i, 'seed/m length');

    vectors.push({ count: i, seed: hex(seed), z: hex(z), m: hex(m), ek: hex(ek), dk: hex(dk), c: hex(c), k: hex(k) });
    if ((i + 1) % 25 === 0) process.stderr.write('  ' + (i + 1) + '/' + opts.count + '\n');
  }

  console.log('Vectors: ' + vectors.length + ' generated, ' + failures.length + ' failing check(s)');
  if (failures.length) {
    failures.slice(0, 10).forEach((f) => process.stderr.write('  FAIL ' + f + '\n'));
    if (failures.length > 10) process.stderr.write('  ... ' + (failures.length - 10) + ' more\n');
    die(1, failures.length + ' verification failure(s) — nothing written');
  }

  const L = [];
  L.push('# ML-KEM-768 KAT — FIPS 203');
  L.push('# Format: NIST .rsp style, deterministic. Regenerating yields a byte-identical file');
  L.push('#         (no timestamp unless --stamp).');
  L.push('# Derivation:');
  L.push('#   seed = SHA3-256(BE32(count) || BE32(0x6B65796E) || BE32(0x4D4C4B45))   (d)');
  L.push('#   z    = SHA3-256(seed || "MLKE-z")');
  L.push('#   m    = SHA3-256(BE32(count) || BE32(0x656E6361) || BE32(0x4D4C4B45))');
  L.push('# Fields:');
  L.push('#   seed: ' + D_BYTES + '-byte KeyGen d');
  L.push('#   z:    ' + Z_BYTES + '-byte KeyGen z');
  L.push('#   m:    ' + M_BYTES + '-byte Encaps message');
  L.push('#   ek:   ' + EK_BYTES + '-byte encapsulation key');
  L.push('#   dk:   ' + DK_BYTES + '-byte decapsulation key = dkPKE || ek || H(ek) || z  (FIPS 203 §7.1)');
  L.push('#   c:    ' + CT_BYTES + '-byte ciphertext');
  L.push('#   k:    ' + K_BYTES + '-byte shared secret = SHA3-512(m || H(ek))[0:32]');
  L.push('# Verified at generation time (every vector, else the file is not written):');
  L.push('#   V1 decapsulate(dk, c) == k  (this repository\'s implementation)');
  L.push('#   V2 @noble/post-quantum: keygen(d||z).ek == ek  and  decapsulate(c, dk) == k');
  L.push('#   V3 k == SHA3-512(m || SHA3-256(ek))[0:32]');
  L.push('#   V4 dk layout canonical: dk[1152..2336] == ek, dk[2336..2368] == H(ek), dk[2368..2400] == z');
  L.push('# Re-check: node scripts/ci-mlkem-kat.cjs  |  node scripts/interop/run.mjs run --kat all --partners noble');
  if (opts.stamp) L.push('# Generated: ' + new Date().toISOString());
  L.push('');

  for (const v of vectors) {
    L.push('count = ' + v.count);
    L.push('seed = ' + v.seed);
    L.push('z = ' + v.z);
    L.push('m = ' + v.m);
    L.push('ek = ' + v.ek);
    L.push('dk = ' + v.dk);
    L.push('c = ' + v.c);
    L.push('k = ' + v.k);
    L.push('');
  }
  const rsp = L.join('\n');

  if (opts.dryRun) { console.log('Dry run: OK, not written (' + Buffer.byteLength(rsp) + ' B)'); process.exit(0); }
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, rsp, 'utf8');
  console.log('Written: ' + opts.out + ' (' + Buffer.byteLength(rsp) + ' B, ' + vectors.length + ' vectors, all checks PASS)');
  process.exit(0);
}

main().catch((e) => die(2, 'unexpected: ' + (e && e.stack || e)));
