// SPDX-License-Identifier: GPL-3.0-only
// Verify: liboqs decaps returns raw K_bar (not hashed K)
const { spawnSync } = require('child_process');
const oqsPath = process.argv[2] || './oqs_gen';

const r1 = spawnSync(oqsPath, ['keygen'], { timeout: 5000, encoding: 'utf8' });
const { pk, sk } = JSON.parse(r1.stdout.trim());

const r2 = spawnSync(oqsPath, ['encaps', pk], { timeout: 5000, encoding: 'utf8' });
const { ct, ss: ss_enc } = JSON.parse(r2.stdout.trim());

const r3 = spawnSync(oqsPath, ['decaps', ct, sk], { timeout: 5000, encoding: 'utf8' });
const { ss: ss_dec } = JSON.parse(r3.stdout.trim());

console.log('ss_enc === ss_dec:', ss_enc === ss_dec);
console.log('ss_enc len:', ss_enc.length, 'ss_dec len:', ss_dec.length);

// Now: is ss hashed? Let's check with noble
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');
const keys = ml_kem768.keygen();
const enc = ml_kem768.encapsulate(keys.publicKey);
const dec = ml_kem768.decapsulate(enc.cipherText, keys.secretKey);

console.log('noble enc.ss hex:', Buffer.from(enc.sharedSecret).toString('hex'));
console.log('noble dec hex:', Buffer.from(dec).toString('hex'));
console.log('noble enc.ss === dec:', Buffer.from(enc.sharedSecret).equals(Buffer.from(dec)));

// Now liboqs enc with noble pk → noble dec
const r4 = spawnSync(oqsPath, ['encaps', Buffer.from(keys.publicKey).toString('hex')], { timeout: 5000, encoding: 'utf8' });
const { ct: ct4, ss: ss4 } = JSON.parse(r4.stdout.trim());
const dec4 = ml_kem768.decapsulate(Buffer.from(ct4, 'hex'), keys.secretKey);
console.log('liboqs enc ss:', ss4.substring(0, 16), '...');
console.log('noble dec ss:', Buffer.from(dec4).toString('hex').substring(0, 16), '...');
console.log('match:', Buffer.from(dec4).equals(Buffer.from(ss4, 'hex')));
