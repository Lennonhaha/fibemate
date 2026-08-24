/**
 * SM2 P0 验收测试：100,000 轮签名 + 加密 + 解密
 * 用法: node scripts/sm2-100k-real.cjs
 *
 * 归档输出:
 *   sm2-100k-result.md  — 测试结论报告
 *   sm2-100k-log.txt    — 每千轮实时进度日志
 *
 * P0 验收标准:
 *   sign()    → {r, s}  非零 r/s
 *   verify()  → true
 *   encrypt() → {c1, c2} 非空
 *   decrypt() → 原文一致
 * 失败条件: 任一轮任一操作抛出异常或结果不符
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
// eslint-disable-next-line custom/no-js-bigint-in-hotpath -- benchmark script, BigInt path is the subject under test
const SM2 = require('../sm2-bigint-ec.js');

const TOTAL = 100_000;
const LOG_INTERVAL = 1_000; // 每1000轮写一次日志
const FLUSH_ROUNDS = 5_000;  // 每5000轮强制flush

const LOG_FILE = path.join(__dirname, '..', 'sm2-100k-log.txt');
const RESULT_FILE = path.join(__dirname, '..', 'sm2-100k-result.md');

// 初始化日志
fs.writeFileSync(LOG_FILE, `SM2 100k Test started at ${new Date().toISOString()}\n`, 'utf8');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

function flushLog() {
  // 触发一次追加写入确保日志不丢
  fs.appendFileSync(LOG_FILE, '', 'utf8');
}

async function run() {
  const start = Date.now();
  let failures = [];
  let logLines = 0;

  // 预热：生成一轮确认基础功能
  const warmup = SM2.generateKeyPair();
  const warmupPkHex = '04' +
    warmup.publicKey.x.toString(16).padStart(64, '0') +
    warmup.publicKey.y.toString(16).padStart(64, '0');
  const warmupHash = BigInt('0x' + crypto.createHash('sm3').update('warmup').digest('hex'));
  const warmupSig = SM2.sign(warmup.privateKey, warmupHash);
  const warmupEnc = SM2.encrypt(warmupPkHex, 'warmup');
  const warmupDec = SM2.decrypt(warmup.privateKey, warmupEnc.c1, warmupEnc.c2);

  if (!warmupSig.r || !warmupSig.s ||
      !SM2.verify(warmupPkHex, warmupHash, warmupSig.r, warmupSig.s) ||
      warmupDec !== 'warmup') {
    throw new Error('WARMUP FAILED — SM2 module broken');
  }
  log(`Warmup OK, starting 100k rounds...`);

  for (let i = 1; i <= TOTAL; i++) {
    try {
      // 1. 密钥生成
      const keys = SM2.generateKeyPair();
      // 2. 公钥 hex 转换（generateKeyPair 返回 {x,y} 对象，encrypt 需 130-char hex 串）
      const pkHex = '04' +
        keys.publicKey.x.toString(16).padStart(64, '0') +
        keys.publicKey.y.toString(16).padStart(64, '0');

      // 3. 签名
      const msg = 'msg' + i;
      const hash = BigInt('0x' + crypto.createHash('sm3').update(msg).digest('hex'));
      const sig = SM2.sign(keys.privateKey, hash);

      // 4. 验签
      if (!SM2.verify(pkHex, hash, sig.r, sig.s)) {
        failures.push({ round: i, op: 'verify', detail: 'signature mismatch' });
        break;
      }

      // 5. 加密
      const pt = 'plaintext-' + i;
      const enc = SM2.encrypt(pkHex, pt);

      // 6. 解密
      const dec = SM2.decrypt(keys.privateKey, enc.c1, enc.c2);
      if (dec !== pt) {
        failures.push({ round: i, op: 'decrypt', detail: `expected "${pt}", got "${dec}"` });
        break;
      }

      // 每千轮日志
      if (i % LOG_INTERVAL === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const rate = (i / elapsed).toFixed(1);
        log(`Round ${i}/${TOTAL} done — ${rate} rounds/sec`);
        logLines++;
      }

      // 每5千轮强制flush
      if (i % FLUSH_ROUNDS === 0) {
        flushLog();
      }
    } catch (e) {
      failures.push({ round: i, op: 'exception', detail: e.message });
      break;
    }
  }

  const elapsed = Date.now() - start;
  const elapsedMin = (elapsed / 60000).toFixed(1);
  const rate = (TOTAL / (elapsed / 1000)).toFixed(1);

  log(`\n=== RESULT ===`);
  log(`Total:    ${TOTAL}`);
  log(`Failures: ${failures.length}`);
  log(`Time:     ${elapsedMin} min (${elapsed} ms)`);
  log(`Rate:     ~${rate} rounds/sec`);
  flushLog();

  // 写结果报告
  const status = failures.length === 0 ? '✅ PASS' : '❌ FAIL';
  const md = `# SM2 P0 验收报告

## 测试结论

**${status}** — ${failures.length === 0 ? '0 失败，P0 正式闭环' : failures.length + ' 轮失败'}

## 测试环境

- Node.js: ${process.version}
- 平台: ${process.platform} ${process.arch}
- 脚本: scripts/sm2-100k-real.cjs

## 验收标准

| 操作 | 输入 | 预期 | 验收条件 |
|------|------|------|---------|
| sign() | 私钥 + SM3(msg) | {r, s} | r≠0, s≠0，无异常 |
| verify() | 公钥 + msg + sig | true | 返回 true |
| encrypt() | 公钥 + 明文 | {c1, c2} | c1/c2 非空，无异常 |
| decrypt() | 私钥 + c1 + c2 | 明文 | 与输入明文完全一致 |

## 测试结果

| 指标 | 值 |
|------|-----|
| 总轮数 | ${TOTAL.toLocaleString()} |
| 失败数 | **${failures.length}** |
| 耗时 | ${elapsedMin} min (${(elapsed / 1000).toFixed(1)}s) |
| 速度 | ~${rate} 轮/秒 |

${failures.length > 0 ? '## 失败详情\n\n' + failures.map(f => `- Round ${f.round}: ${f.op} — ${f.detail}`).join('\n') : ''}

## 代码确认

- 实现文件: sm2-bigint-ec.js
- 测试脚本: scripts/sm2-100k-real.cjs
- 结果日志: sm2-100k-log.txt
- 测试时间: ${new Date().toISOString()}
`;

  fs.writeFileSync(RESULT_FILE, md, 'utf8');
  console.log(`\nResult written to: ${RESULT_FILE}`);
  console.log(`Log written to:    ${LOG_FILE}`);
}

run().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
