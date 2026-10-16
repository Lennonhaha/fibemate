// SPDX-License-Identifier: GPL-3.0-only
const MLKEM768 = require('../packages/pqc-kem/src/ml-kem-768.js');
const { spawnSync } = require('child_process');

const oqsPath = process.argv[2] || './oqs_gen';
const N = parseInt(process.argv[3]) || 50;

function toHex(b) { return Buffer.from(b).toString('hex'); }
function fromHex(h) { return Buffer.from(h, 'hex'); }

let passA = 0, passB = 0, fail = 0;

for (let i = 0; i < N; i++) {
    // --- Direction A: JS keygen → liboqs encaps → JS decaps ---
    const keysJS = MLKEM768.generateKeypair();
    // We need to compute final K: K = SHA3-256(K_bar || H(ct))
    // But liboqs decaps returns final K, so we need encaps_computed_ss

    const r1 = spawnSync(oqsPath, ['encaps', toHex(keysJS.publicKey)], { timeout: 5000, encoding: 'utf8' });
    const { ct: ctHex, ss: ssLibHex } = JSON.parse(r1.stdout.trim());
    const ctBuf = fromHex(ctHex);

    // 判据口径（2026-10-16 定案，FIPS 203 final §7.3）：只比 final K（raw），不做任何额外哈希。
    // 实证：本实现 <-> @noble/post-quantum 双向 raw 200/200、SHA3-256(Kbar || H(ct)) 形态 0/200。
    const decJS = MLKEM768.decapsulate(keysJS.secretKey, ctBuf);

    const ssLib = fromHex(ssLibHex);

    const matchRawA = Buffer.from(decJS).equals(ssLib);

    if (matchRawA) passA++;
    else fail++;

    // --- Direction B: liboqs keygen → JS encaps → liboqs decaps ---
    const r2 = spawnSync(oqsPath, ['keygen'], { timeout: 5000, encoding: 'utf8' });
    const { pk: pkLibHex, sk: skLibHex } = JSON.parse(r2.stdout.trim());
    const pkLib = fromHex(pkLibHex);

    const encJS = MLKEM768.encapsulate(pkLib);
    // encapsulate 的 sharedSecret 即 FIPS 203 final 的 K（无额外 KDF 步骤）

    // 契约（scripts/oqs_gen.c Usage）：decaps <skHex> <ctHex>
    const r3 = spawnSync(oqsPath, ['decaps', skLibHex, toHex(encJS.ciphertext)], { timeout: 5000, encoding: 'utf8' });
    const { ss: ssLibDecHex } = JSON.parse(r3.stdout.trim());
    
    const matchB_raw = Buffer.from(encJS.sharedSecret).equals(fromHex(ssLibDecHex));

    if (matchB_raw) passB++;
    else fail++;

    if (i < 3 || !(matchRawA && matchB_raw)) {
        console.error(`[${i}] A=${matchRawA} B=${matchB_raw}`);
    }

    if ((i+1) % 20 === 0) console.error(`${i+1}/${N} A=${passA} B=${passB}`);
}

console.log(`\nJS↔liboqs: A=${passA}/${N} B=${passB}/${N} FAIL=${fail}/${N}`);
process.exit(passA === N && passB === N ? 0 : 1);
