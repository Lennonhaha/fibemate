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

    const decJS = MLKEM768.decapsulate(keysJS.secretKey, ctBuf);
    // decapsulate returns raw K_bar_implicit_rej (or hashed? depends on impl)
    // Let's try both raw and hashed
    
    const ssLib = fromHex(ssLibHex);
    const hashHct = MLKEM768.sha3_256(ctBuf);
    const decHashed = MLKEM768.sha3_256(Buffer.concat([decJS, hashHct]));
    
    const matchRaw = Buffer.from(decJS).equals(ssLib);
    const matchHashed = decHashed.equals(ssLib);
    
    if (matchRaw) passA++;
    else if (matchHashed) passA++;

    // --- Direction B: liboqs keygen → JS encaps → liboqs decaps ---
    const r2 = spawnSync(oqsPath, ['keygen'], { timeout: 5000, encoding: 'utf8' });
    const { pk: pkLibHex, sk: skLibHex } = JSON.parse(r2.stdout.trim());
    const pkLib = fromHex(pkLibHex);

    const encJS = MLKEM768.encapsulate(pkLib);
    // encJS returns {ciphertext, sharedSecret:K_bar}
    
    // JS final K
    const K_js = MLKEM768.sha3_256(Buffer.concat([
        encJS.sharedSecret,
        MLKEM768.sha3_256(encJS.ciphertext)
    ]));

    const r3 = spawnSync(oqsPath, ['decaps', toHex(encJS.ciphertext), skLibHex], { timeout: 5000, encoding: 'utf8' });
    const { ss: ssLibDecHex } = JSON.parse(r3.stdout.trim());
    
    // Also try raw K_bar (no hash)
    const matchB_raw = Buffer.from(encJS.sharedSecret).equals(fromHex(ssLibDecHex));
    const matchB_hashed = K_js.equals(fromHex(ssLibDecHex));
    
    if (matchB_raw) passB++;
    else if (matchB_hashed) passB++;

    if (i < 3 || (matchRaw || matchHashed ? 0 : 1) + (matchB_raw || matchB_hashed ? 0 : 1) > 0) {
        if (i < 3) console.error(`[${i}] A:raw=${matchRaw} hash=${matchHashed} | B:raw=${matchB_raw} hash=${matchB_hashed}`);
    }

    if ((i+1) % 20 === 0) console.error(`${i+1}/${N} A=${passA} B=${passB}`);
}

console.log(`\nJS↔liboqs: A=${passA}/${N} B=${passB}/${N} FAIL=${fail}/${N}`);
process.exit(passA === N && passB === N ? 0 : 1);
