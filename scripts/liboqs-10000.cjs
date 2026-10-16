// SPDX-License-Identifier: GPL-3.0-only
// 10000-round liboqs cross-verification
const MLKEM768 = require('../packages/pqc-kem/src/ml-kem-768.js');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// oqs_gen 辅助程序：默认相对本脚本目录解析（不再依赖调用方 CWD）；可用 OQS_GEN 覆盖。
const oqs = process.env.OQS_GEN || path.join(__dirname, 'oqs_gen');
// liboqs 动态库目录：可用 OQS_LIB_DIR 覆盖；未设置时仅在既有默认路径真实存在时启用（不再凭空写死）。
const DEFAULT_OQS_LIB_DIR = '/opt/oqs/liboqs-install/lib';
const libDir = process.env.OQS_LIB_DIR || (fs.existsSync(DEFAULT_OQS_LIB_DIR) ? DEFAULT_OQS_LIB_DIR : '');
const env = libDir ? Object.assign({}, process.env, { LD_LIBRARY_PATH: libDir }) : process.env;

function toHex(b) { return Buffer.from(b).toString('hex'); }
function fromHex(h) { return Buffer.from(h, 'hex'); }

let a = 0, b = 0;
const N = 10000;
for (let i = 0; i < N; i++) {
    // Direction A: JS keygen → liboqs encaps → JS decaps
    const k = MLKEM768.generateKeypair();
    const r = spawnSync(oqs, ['encaps', toHex(k.publicKey)], { timeout: 5000, encoding: 'utf8', env });
    const { ct, ss } = JSON.parse(r.stdout.trim());
    const d = MLKEM768.decapsulate(k.secretKey, fromHex(ct));
    if (Buffer.from(d).equals(fromHex(ss))) a++;

    // Direction B: liboqs keygen → JS encaps → liboqs decaps
    const r2 = spawnSync(oqs, ['keygen'], { timeout: 5000, encoding: 'utf8', env });
    const { pk, sk } = JSON.parse(r2.stdout.trim());
    const e = MLKEM768.encapsulate(fromHex(pk));
    const r3 = spawnSync(oqs, ['decaps', sk, toHex(e.ciphertext)], { timeout: 5000, encoding: 'utf8', env });
    const { ss: s2 } = JSON.parse(r3.stdout.trim());
    if (Buffer.from(e.sharedSecret).equals(fromHex(s2))) b++;

    if (i % 500 === 499) process.stderr.write((i + 1) + '/' + N + ' A=' + a + ' B=' + b + '\n');
}
console.log('JS' + String.fromCharCode(0x2194) + 'liboqs ' + N + ': A=' + a + '/' + N + ' B=' + b + '/' + N);
process.exit(a === N && b === N ? 0 : 1);
