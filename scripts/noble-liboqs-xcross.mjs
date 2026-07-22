// SPDX-License-Identifier: GPL-3.0-only
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { spawnSync } from 'child_process';

const oqsPath = process.argv[2] || './oqs_gen';
const N = parseInt(process.argv[3]) || 50;

function toHex(b) { return Buffer.from(b).toString('hex'); }
function fromHex(h) { return Buffer.from(h, 'hex'); }

// Direction A: noble keygen → liboqs encaps → noble decaps
// Direction B: liboqs keygen → noble encaps → liboqs decaps

let passA = 0, passB = 0, fail = 0;

for (let i = 0; i < N; i++) {
    // --- Direction A ---
    const keysN = ml_kem768.keygen();
    const pkHex = toHex(keysN.publicKey);

    // liboqs encaps with noble pk
    const r1 = spawnSync(oqsPath, ['encaps', pkHex], { timeout: 5000, encoding: 'utf8' });
    const { ct: ctHex, ss: ssLibHex } = JSON.parse(r1.stdout.trim());

    // noble decaps
    const ctBuf = fromHex(ctHex);
    const ssNoble = ml_kem768.decapsulate(ctBuf, keysN.secretKey);
    const matchA = Buffer.from(ssNoble).equals(fromHex(ssLibHex));
    if (matchA) passA++;

    // --- Direction B ---
    const r2 = spawnSync(oqsPath, ['keygen'], { timeout: 5000, encoding: 'utf8' });
    const { pk: pkLibHex, sk: skLibHex } = JSON.parse(r2.stdout.trim());
    const pkLib = fromHex(pkLibHex);

    const encN = ml_kem768.encapsulate(pkLib);
    const r3 = spawnSync(oqsPath, ['decaps', toHex(encN.cipherText), skLibHex], { timeout: 5000, encoding: 'utf8' });
    const { ss: ssLibDecHex } = JSON.parse(r3.stdout.trim());
    const matchB = Buffer.from(encN.sharedSecret).equals(fromHex(ssLibDecHex));
    if (matchB) passB++;

    if ((!matchA || !matchB) && (i < 3 || passA + passB < 90)) {
        console.error(`[${i}] A=${matchA} B=${matchB}`);
    }

    if ((i+1) % 20 === 0) console.error(`${i+1}/${N} A=${passA} B=${passB}`);
}

console.log(`\nnoble↔liboqs: A=${passA}/${N} B=${passB}/${N} FAIL=${fail}/${N}`);
process.exit(passA === N && passB === N ? 0 : 1);
