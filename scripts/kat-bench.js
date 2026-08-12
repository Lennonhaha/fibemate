// SPDX-License-Identifier: GPL-3.0-only
/**
 * KAT 10,000 轮真实计时测试
 * 运行: node kat_bench.js
 */
const MLKEM768 = require('../www/crypto/ml-kem-768.js');
const fs = require('fs');

const ROUNDS = 10000;
const PROGRESS_EVERY = 1000;

console.log(`=== FIBEMATE ML-KEM-768 KAT ${ROUNDS} 轮一致性测试 ===`);
console.log(`开始时间: ${new Date().toISOString()}`);
console.log(`Node.js: ${process.version}`);
console.log(`平台: ${process.platform} ${process.arch}`);
console.log('');

const totalStart = process.hrtime.bigint();
let mismatch = 0;
let keygenTotalNs = 0n;
let encapsTotalNs = 0n;
let decapsTotalNs = 0n;

for (let i = 1; i <= ROUNDS; i++) {
    // KeyGen
    const t0 = process.hrtime.bigint();
    const { publicKey, secretKey } = MLKEM768.generateKeypair();
    const t1 = process.hrtime.bigint();
    
    // Encaps
    const { ciphertext, sharedSecret: ss1 } = MLKEM768.encapsulate(publicKey);
    const t2 = process.hrtime.bigint();
    
    // Decaps
    const ss2 = MLKEM768.decapsulate(secretKey, ciphertext);
    const t3 = process.hrtime.bigint();
    
    keygenTotalNs += (t1 - t0);
    encapsTotalNs += (t2 - t1);
    decapsTotalNs += (t3 - t2);
    
    // 一致性检查
    if (ss1.length !== ss2.length || !ss1.every((b, j) => b === ss2[j])) {
        mismatch++;
        console.log(`  ❌ MISMATCH at round ${i}`);
    }
    
    if (i % PROGRESS_EVERY === 0) {
        const pct = (i / ROUNDS * 100).toFixed(0);
        process.stdout.write(`  进度: ${i}/${ROUNDS} (${pct}%)\r`);
    }
}

const totalEnd = process.hrtime.bigint();
const totalNs = totalEnd - totalStart;
const totalSec = Number(totalNs) / 1e9;

console.log(`\n=== 测试完成 ===`);
console.log(`完成时间: ${new Date().toISOString()}`);
console.log(`一致性: ${ROUNDS - mismatch}/${ROUNDS} 通过`);
if (mismatch > 0) console.log(`  ⚠️  ${mismatch} 轮不匹配!`);
console.log('');
console.log('--- 计时统计 ---');
console.log(`总耗时:           ${totalSec.toFixed(3)} 秒`);
console.log(`平均每轮:         ${(totalSec / ROUNDS * 1000).toFixed(3)} ms`);
console.log(`KeyGen 总计:      ${(Number(keygenTotalNs) / 1e9).toFixed(3)} 秒 (${(Number(keygenTotalNs) / Number(totalNs) * 100).toFixed(1)}%)`);
console.log(`Encaps 总计:      ${(Number(encapsTotalNs) / 1e9).toFixed(3)} 秒 (${(Number(encapsTotalNs) / Number(totalNs) * 100).toFixed(1)}%)`);
console.log(`Decaps 总计:      ${(Number(decapsTotalNs) / 1e9).toFixed(3)} 秒 (${(Number(decapsTotalNs) / Number(totalNs) * 100).toFixed(1)}%)`);
console.log(`KeyGen 平均:      ${(Number(keygenTotalNs) / ROUNDS / 1000).toFixed(2)} µs`);
console.log(`Encaps 平均:      ${(Number(encapsTotalNs) / ROUNDS / 1000).toFixed(2)} µs`);
console.log(`Decaps 平均:      ${(Number(decapsTotalNs) / ROUNDS / 1000).toFixed(2)} µs`);

// 输出 JSON 结果
const result = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    totalRounds: ROUNDS,
    passed: ROUNDS - mismatch,
    failed: mismatch,
    totalTimeSec: parseFloat(totalSec.toFixed(3)),
    avgPerRoundMs: parseFloat((totalSec / ROUNDS * 1000).toFixed(3)),
    keygenTotalSec: parseFloat((Number(keygenTotalNs) / 1e9).toFixed(3)),
    encapsTotalSec: parseFloat((Number(encapsTotalNs) / 1e9).toFixed(3)),
    decapsTotalSec: parseFloat((Number(decapsTotalNs) / 1e9).toFixed(3)),
    keygenAvgUs: parseFloat((Number(keygenTotalNs) / ROUNDS / 1000).toFixed(2)),
    encapsAvgUs: parseFloat((Number(encapsTotalNs) / ROUNDS / 1000).toFixed(2)),
    decapsAvgUs: parseFloat((Number(decapsTotalNs) / ROUNDS / 1000).toFixed(2)),
};

const resultPath = '/opt/fibemate-full/www/kat_10000_result.json';
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
console.log(`\n结果已保存: ${resultPath}`);
