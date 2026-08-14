// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// quick-bench-sm2.cjs —lightweight benchmark for weak VMs
const s = require('/opt/fibemate-repo/www/crypto/sm2-bigint-ec');
const crypto = require('crypto');
const N = 200;

const sk = s.generateKeyPair();
const pk = s.publicKeyToHex(sk.publicKey);

function bench(label, fn) {
  const t0 = process.hrtime.bigint();
  fn();
  const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(label.padEnd(10) + dt.toFixed(0).padStart(5) + 'ms  ' + (N/dt*1000).toFixed(0).padStart(5) + ' ops/s');
}

console.log('N=' + N + '\n');

// Verify correctness
let ok = 0;
for (let i = 0; i < N; i++) {
  const h = BigInt('0x' + crypto.createHash('sm3').update('v' + i).digest('hex'));
  const sig = s.sign(sk.privateKey, h);
  if (s.verify(pk, h, sig.r, sig.s)) ok++;
  const enc = s.encrypt(pk, 'v' + i);
  if (s.decrypt(sk.privateKey, enc.c1, enc.c2) === 'v' + i) ok++;
}
console.log('Correctness: ' + ok + '/' + (N*2) + ' (' + (ok === N*2 ? 'ALL PASS' : 'FAIL') + ')\n');

bench('keygen',  () => { for (let i = 0; i < N; i++) s.generateKeyPair(); });
bench('sign',    () => { for (let i = 0; i < N; i++) { const h = BigInt('0x' + crypto.createHash('sm3').update('s'+i).digest('hex')); s.sign(sk.privateKey, h); } });

// pre-sign for verify
const sigs = [];
for (let i = 0; i < N; i++) {
  const h = BigInt('0x' + crypto.createHash('sm3').update('b'+i).digest('hex'));
  sigs.push(s.sign(sk.privateKey, h));
}
bench('verify',  () => { for (const sig of sigs) s.verify(pk, BigInt('0x'+crypto.createHash('sm3').update('t').digest('hex')), sig.r, sig.s); });
bench('encrypt', () => { for (let i = 0; i < N; i++) s.encrypt(pk, 'e'+i); });

const encs = [];
for (let i = 0; i < N; i++) encs.push(s.encrypt(pk, 'd'+i));
bench('decrypt', () => { for (const e of encs) s.decrypt(sk.privateKey, e.c1, e.c2); });

console.log('\n=== Mersenne fast reduction —DONE ===');
