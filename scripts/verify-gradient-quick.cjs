// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * Quick verify-only gradient: does |t| still grow with √N after blinding fix?
 * Runs at N=[500, 1500, 3000] —should be <2 min total.
 */
const crypto = require('crypto');
const sm2 = require('/opt/fibemate-full/sm2-bigint-ec');

const SIZES = [500, 1500, 3000];
const THRESH = 4.5;
const WARMUP = 200;

function hrtUs(t) { return t[0]*1e6 + t[1]/1e3; }
function mean(a) { let s=0; for(let v of a)s+=v; return s/a.length; }
function varN(a,m) { let s=0; for(let v of a){let d=v-m;s+=d*d;} return s/(a.length-1); }
function welch(m1,v1,n1,m2,v2,n2) { let d=Math.sqrt(v1/n1+v2/n2); return d===0?0:Math.abs(m1-m2)/d; }

console.log('Generating test pool (200 pairs)...');
const pool = [];
for (let i = 0; i < 200; i++) {
  const key = sm2.generateKeyPair();
  const pk = sm2.publicKeyToHex(key.publicKey);
  const h = BigInt('0x' + crypto.createHash('sm3').update('gradient' + i).digest('hex'));
  const sig = sm2.sign(key.privateKey, h);
  pool.push({ pk, hash: h, sig });
}
const msg = 'FIBEMATE verify gradient fixed';
const msgHash = BigInt('0x' + crypto.createHash('sm3').update(msg).digest('hex'));
const fKey = sm2.generateKeyPair();
const fPk = sm2.publicKeyToHex(fKey.publicKey);
const fSig = sm2.sign(fKey.privateKey, msgHash);

let idx = 0;
const next = () => (idx++) % pool.length;

console.log('\n=== Verify Gradient (post-blinding fix) ===\n');

const tvals = [];
for (const N of SIZES) {
  const ta = new Float64Array(N), tb = new Float64Array(N);
  for (let w = 0; w < WARMUP; w++) {
    sm2.verify(fPk, msgHash, fSig.r, fSig.s);
    const p = pool[next()];
    sm2.verify(p.pk, p.hash, p.sig.r, p.sig.s);
  }
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    let s = process.hrtime();
    sm2.verify(fPk, msgHash, fSig.r, fSig.s);
    ta[i] = hrtUs(process.hrtime(s));
    s = process.hrtime();
    const p = pool[next()];
    sm2.verify(p.pk, p.hash, p.sig.r, p.sig.s);
    tb[i] = hrtUs(process.hrtime(s));
  }
  const m1 = mean(ta), m2 = mean(tb);
  const v1 = varN(ta, m1), v2 = varN(tb, m2);
  const t = welch(m1, v1, N, m2, v2, N);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('N=' + String(N).padStart(5) + '  |t|=' + t.toFixed(2) + '  ' + (t > THRESH ? 'FAIL' : 'PASS') + '  fix=' + m1.toFixed(1) + 'us rnd=' + m2.toFixed(1) + 'us  [' + elapsed + 's]');
  tvals.push({ N, t, passed: t <= THRESH });
}

console.log('\n--- Trend ---');
const roots = SIZES.map(Math.sqrt);
let sx = 0, sy = 0, sxy = 0, sx2 = 0;
for (let i = 0; i < SIZES.length; i++) { sx += roots[i]; sy += tvals[i].t; sxy += roots[i] * tvals[i].t; sx2 += roots[i] * roots[i]; }
const slope = (SIZES.length * sxy - sx * sy) / (SIZES.length * sx2 - sx * sx);
const inter = (sy - slope * sx) / SIZES.length;
let ssr = 0, sst = 0; const ym = sy / SIZES.length;
for (let i = 0; i < SIZES.length; i++) { const p = inter + slope * roots[i]; ssr += (tvals[i].t - p) ** 2; sst += (tvals[i].t - ym) ** 2; }
const r2 = sst > 0 ? 1 - ssr / sst : 0;
const cls = r2 < 0.3 ? 'NOISE (no trend)' : slope < 0.05 ? 'CLEAN (flat)' : 'LEAK STILL PRESENT';
console.log('beta=' + slope.toFixed(5) + '  R2=' + r2.toFixed(3) + '  -> ' + cls);
if (tvals.every(function(x) { return x.passed; })) console.log('ALL |t| <= ' + THRESH + ' —verify leak CLOSED');
else console.log('Verify leak persists');
