#!/usr/bin/env node
// 10000-round liboqs cross-verification
const MLKEM768 = require('../packages/pqc-kem/src/ml-kem-768.js');
const { spawnSync } = require('child_process');
const oqs = './scripts/oqs_gen';

function toHex(b){return Buffer.from(b).toString('hex');}
function fromHex(h){return Buffer.from(h,'hex');}

let a=0, b=0;
const N = 10000;
for(let i=0; i<N; i++){
    const k=MLKEM768.generateKeypair();
    const r=spawnSync(oqs, ['encaps', toHex(k.publicKey)], {timeout: 5000, encoding: 'utf8'});
    const {ct, ss}=JSON.parse(r.stdout.trim());
    const d=MLKEM768.decapsulate(k.secretKey, fromHex(ct));
    if(Buffer.from(d).equals(fromHex(ss))) a++;

    const r2=spawnSync(oqs, ['keygen'], {timeout: 5000, encoding: 'utf8'});
    const {pk, sk}=JSON.parse(r2.stdout.trim());
    const e=MLKEM768.encapsulate(fromHex(pk));
    const r3=spawnSync(oqs, ['decaps', toHex(e.ciphertext), sk], {timeout: 5000, encoding: 'utf8'});
    const {ss: s2}=JSON.parse(r3.stdout.trim());
    if(Buffer.from(e.sharedSecret).equals(fromHex(s2))) b++;

    if(i % 500 === 499) process.stderr.write(`${i+1}/${N} A=${a} B=${b}\n`);
}
console.log(`JS↔liboqs ${N}: A=${a}/${N} B=${b}/${N}`);
process.exit(a===N && b===N ? 0 : 1);
