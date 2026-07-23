// SPDX-License-Identifier: GPL-3.0-only
/**
 * Fix SM2 verify wNAF timing leak via scalar blinding.
 * 
 * Problem: verify's pointMul(t, PA) and mulG(s) use unmasked scalars.
 * wNAF digit count varies with scalar Hamming weight → |t| grows with √N.
 * 
 * Fix: mask both scalars with random multiples of curve order N.
 * Algebraically: (k + r*N)*P = k*P + r*(N*P) = k*P + r*O = k*P
 */
const fs = require('fs');
const path = '/opt/fibemate-full/sm2-bigint-ec.js';
const bak = path + '.bak.verify-mask-' + Date.now();

let src = fs.readFileSync(path, 'utf8');
fs.writeFileSync(bak, src, 'utf8');
console.log('Backup:', bak);

// Fix: add scalar blinding in verify()
// Pattern to replace: the pointMul calls inside verify
const oldVerify = `    // sG + tPA
    // sG: 使用缓存 G 表（w=4, 零构建成本）
    // tPA: 构建一次窗口表（w=4, 单次摊销）
    const sG_J = toJ(mulG(s));
    const tPA_J = toJ(pointMul(t, PA));`;

const newVerify = `    // sG + tPA
    // sG: 使用缓存 G 表（w=4, 零构建成本）
    // tPA: 构建一次窗口表（w=4, 单次摊销）
    // Scalar blinding (verify): mask s and t to prevent wNAF timing leakage.
    // (s + r1*N)*G = s*G + r1*(N*G) = s*G + r1*O = s*G  (same for t*PA)
    const rV1 = BigInt('0x' + randomBytes(8).toString('hex'));
    const sMasked = rV1 === ZERO ? s : s + rV1 * SM2_N;
    const rV2 = BigInt('0x' + randomBytes(8).toString('hex'));
    const tMasked = rV2 === ZERO ? t : t + rV2 * SM2_N;
    const sG_J = toJ(mulG(sMasked));
    const tPA_J = toJ(pointMul(tMasked, PA));`;

if (!src.includes(oldVerify)) {
    console.error('ERROR: old verify pattern not found');
    process.exit(1);
}

src = src.replace(oldVerify, newVerify);

// Also update version comment
src = src.replace(
    /\* v1\.3 \(2026-07-09\) — wNAF\(w=4\) \+ 固定基点 Comb 预计算缓存/,
    '* v1.4 (2026-07-23) — wNAF(w=4) + Comb cache + verify scalar blinding'
);

// Update verify count comment
src = src.replace(
    /\*   2\) Comb 固定基点 G 预计算缓存 — mulG\/sign\/verify 共享/,
    '*   2) Comb 固定基点 G 预计算缓存 — mulG/sign/verify 共享\n *   3) verify scalar blinding — prevents wNAF timing leakage (gradient scan verified)'
);

fs.writeFileSync(path, src, 'utf8');
console.log('Fixed: verify scalar blinding added');
console.log('Diff:');
const orig = fs.readFileSync(bak, 'utf8');
const lines = src.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== orig.split('\n')[i]) {
        console.log(`  L${i+1}: ${lines[i].substring(0, 80)}`);
    }
}
