// SPDX-License-Identifier: GPL-3.0-only
// Focused debug: JS keygen → liboqs encaps → JS decaps (should work!)
const MLKEM768 = require('../packages/pqc-kem/src/ml-kem-768.js');
const { spawnSync } = require('child_process');
const oqsPath = process.argv[2] || './oqs_gen';

function toHex(b) { return Buffer.from(b).toString('hex'); }
function fromHex(h) { return Buffer.from(h, 'hex'); }

const keys = MLKEM768.generateKeypair();
console.log('JS pk len:', keys.publicKey.length, 'sk len:', keys.secretKey.length);

// liboqs encaps with JS pk
const r = spawnSync(oqsPath, ['encaps', toHex(keys.publicKey)], { timeout: 5000, encoding: 'utf8' });
const { ct, ss: ss_lib } = JSON.parse(r.stdout.trim());
console.log('liboqs ct len:', ct.length, '/2 bytes');
console.log('liboqs ss (raw):', ss_lib);

const ctBuf = fromHex(ct);

// JS decaps
const decRaw = MLKEM768.decapsulate(ctBuf, keys.secretKey);
console.log('JS decaps raw bytes:', toHex(decRaw));
console.log('JS dec raw === lib ss:', toHex(decRaw) === ss_lib);

// Let's also check the internal operations
// Try manual decaps steps:

// 1. Decompose sk: byteEncode₁₂(s) in JS? Or whole format?
// Check how sk is constructed
const pk = keys.publicKey;
const sk = keys.secretKey;
console.log('sk first 32 bytes:', toHex(sk.slice(0, 32)));

// FIPS 203 sk format:
// sk = (ŝ₁ || ŝ₂ || ŝ₃) byte-encoded + pk + hpk + z
// or: sk = s_sk || pk || H(pk) || z (12*K*N bytes each)
// 
// Let's check if JS sk includes the pk bytes at the right position
const SK_EXPECTED = 2400;
const PK_BYTES = 1184;
const KP = 12 * 256 * 3 / 8; // 3 * 32 * 12 = 1152? No...
// K=3, N=256, 12-bit encoding → 3*256*12/8 = 3*32*12 = 1152
const S_BYTES = Math.ceil(256 * 12 / 8) * 3; // 384*3 = 1152

console.log('computed S_BYTES:', S_BYTES);
console.log('sk[1152..1152+32]:', toHex(sk.slice(S_BYTES, S_BYTES + 32)));

// FIPS 203: sk = byteEncode₁₂(s) || pk || H(pk) || z
// So sk[1152..1152+1184] should be pk
if (sk.length >= S_BYTES + 32) {
    const embeddedPk = sk.slice(S_BYTES + 32, S_BYTES + 32 + PK_BYTES);
    const matchPk = Buffer.from(embeddedPk).equals(Buffer.from(pk));
    console.log('embedded pk at S_BYTES+32 == pk?:', matchPk);
    
    // Try S_BYTES without +32
    const embeddedPk2 = sk.slice(S_BYTES, S_BYTES + PK_BYTES);
    const matchPk2 = Buffer.from(embeddedPk2).equals(Buffer.from(pk));
    console.log('embedded pk at S_BYTES == pk?:', matchPk2);
}

// Check decapsulate internal: does it use sk format correctly?
// The decapsulate function decomposes sk to get (s, t, rho, z, hpk_)
// If sk format is wrong, the decomposition fails
