// SPDX-License-Identifier: GPL-3.0-only
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Load addon (multiple paths) ─────────────────────────────────
let addon = null;
const paths = [
    path.join(__dirname, '..', 'native', 'build', 'Release', 'mlkem.node'),
    '/opt/fibemate-full/addon/build/Release/mlkem.node',
];
for (const p of paths) {
    try { addon = require(p); break; }
    catch (_) { /* try next */ }
}

if (addon) {
    try {
        const seed = Buffer.alloc(32); seed[0] = 42;
        const m = Buffer.alloc(32); m[0] = 99;
        const [pk, sk] = addon.keygenDerand(seed);
        const [ct, K] = addon.encapsDerand(pk, m);
        const d = addon.decaps(ct, sk);
        if (!Buffer.from(d).equals(K)) throw new Error('self-test');
    } catch (e) {
        console.error('C addon self-test failed:', e.message);
        addon = null;
    }
}

// ── Helpers ─────────────────────────────────────────────────────
function hex(b) { return Buffer.from(b).toString('hex'); }

function deriveSeed(counter, salt) {
    const input = Buffer.alloc(12);
    input.writeUInt32BE(counter, 0);
    input.writeUInt32BE(salt >>> 0, 4);
    input.writeUInt32BE(0x4D4C4B45, 8);  // 'MLKE'
    const h = crypto.createHash('sha256').update(input).digest();
    return h.slice(0, 32);
}

// ── Generate ————————————————————————————————————————————————————
function generateVectors(count) {
    const vectors = [];
    for (let i = 0; i < count; i++) {
        const seed = deriveSeed(i, 0x6B65796E);  // 'keyn'
        const msg  = deriveSeed(i, 0x656E6361);  // 'enca'

        let pk, sk, ct, K;
        if (addon) {
            [pk, sk] = addon.keygenDerand(seed);
            [ct, K]  = addon.encapsDerand(pk, msg);
        } else {
            const js = require('../src/ml-kem-768.js');
            const kp = js.generateKeypair();
            const enc = js.encapsulate(kp.publicKey);
            pk = kp.publicKey;
            sk = kp.secretKey;
            ct = enc.ciphertext;
            K  = enc.sharedSecret;
        }

        vectors.push({
            count: i, seed: hex(seed), m: hex(msg),
            ek: hex(pk), dk: hex(sk), c: hex(ct), k: hex(K),
        });

        if (i > 0 && i % 50 === 0) process.stderr.write('  ' + i + '/' + count + '...\n');
    }
    return vectors;
}

// ── NIST .rsp ———————————————————————————————————————————————————
function formatRSP(vectors, addonMode) {
    const L = [];
    L.push('# ML-KEM-768 KAT — FIPS 203');
    L.push('# Generated: ' + new Date().toISOString());
    L.push('# Backend: ' + (addonMode ? 'C addon (deterministic)' : 'JS'));
    L.push('#   seed: 32-byte derivation seed');
    L.push('#   m:    32-byte encaps message');
    L.push('#   ek:   1184-byte public encapsulation key');
    L.push('#   dk:   2400-byte secret decapsulation key');
    L.push('#   c:    1088-byte ciphertext');
    L.push('#   k:    32-byte shared secret');
    L.push('');

    for (const v of vectors) {
        L.push('count = ' + v.count);
        L.push('seed = ' + v.seed);
        L.push('m = ' + v.m);
        L.push('ek = ' + v.ek);
        L.push('dk = ' + v.dk);
        L.push('c = ' + v.c);
        L.push('k = ' + v.k);
        L.push('');
    }
    return L.join('\n');
}

// ── Verify ——————————————————————————————————————————————————————
function verify(vectors) {
    let fail = 0;
    for (const v of vectors) {
        const ct = Buffer.from(v.c, 'hex');
        const sk = Buffer.from(v.dk, 'hex');
        let d;
        if (addon) {
            d = addon.decaps(ct, sk);
        } else {
            const js = require('../src/ml-kem-768.js');
            d = js.decapsulate(sk, ct);
        }
        if (hex(d) !== v.k) { fail++; process.stderr.write('  #' + v.count + ' mismatch\n'); }
    }
    process.stderr.write(fail ? ('  FAIL ' + fail + '/' + vectors.length + '\n')
                               : ('  All ' + vectors.length + ' self-verified PASS\n'));
    return fail === 0;
}

// ── Main ————————————————————————————————————————————————————————
const count   = parseInt(process.argv[2]) || 100;
const outPath = process.argv[3] || path.join(__dirname, '..', 'test', 'kat', 'mlkem-768-KAT.rsp');

console.log('FIBEMATE NIST KAT Generator  ·  ML-KEM-768  ·  ' + count + ' vectors');
console.log('Backend: ' + (addon ? 'C addon ⚡' : 'JS (non-deterministic)'));
console.log('');

const vectors = generateVectors(count);
console.log('Generated: ' + vectors.length);

const rsp = formatRSP(vectors, !!addon);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, rsp, 'utf8');
console.log('Written: ' + outPath + ' (' + (rsp.length / 1024).toFixed(1) + ' KB)');

const ok = verify(vectors);
process.exit(ok ? 0 : 1);
