# tsr-verify — TSR 证据链验证器 设计文档

**类型**：CLI 工具
**状态**：设计阶段
**优先级**：⭐⭐⭐⭐⭐
**预计实现耗时**：1-2 小时

---

## 1. 产品定位

把 FIBEMATE 最独特的资产（225+ RFC 3161 时间戳存证）提取为独立验证工具。任何人拿到 `.tsr` 文件都可以用这条命令验证"这份代码确实在某个时间点之前就存在了"。

---

## 2. 命令行接口

```
Commands:
  tsr-verify check <path>       验证指定目录下所有 .tsr 文件
  tsr-verify check <file.tsr>   验证单个 TSR 文件
  tsr-verify info <file.tsr>    显示 TSR 文件的详细信息
  tsr-verify manifest <path>    根据 timestamp-manifest.json 批量验证
  tsr-verify chain <path>       验证 TSR 序列连续性（检查序号是否断裂）

Options:
  --verbose                     输出详细的验证过程
  --json                        输出 JSON 格式结果
  --strict                      严格模式：任何失败都 exit 1
```

---

## 3. 输出示例

```
🔐 TSR Evidence Chain Verifier v1.0

📁 Scanning: ./docs/tsa/
📦 Found: 218 .tsr files

🔍 Verification Results:
  ✅ lg-001 ~ lg-218:  218/218 VALID
  ⏱️  Timestamp range:  2026-05-10 ~ 2026-08-12
  🔗 Chain continuity:  ✅ NO GAPS (218 consecutive)
  🏛️  TSA authorities:   DigiCert (167) + FreeTSA (51)

📊 Summary:
  Total:     218
  Valid:     218 ✅
  Expired:   0
  Missing:   0
  Chain gap: 0

🎯 Evidence chain integrity: 100%
```

---

## 4. 验证逻辑

```
For each .tsr file:
  1. openssl ts -reply -in file.tsr -text  解析 TSR
  2. 检查 Status: Granted
  3. 检查 timestamp 在 TSA 证书有效期内
  4. 检查 hash_algorithm (SHA-256/SHA-512)
  5. 如有关联的 .sha256 文件，验证哈希匹配
  6. 如有关联源文件，验证文件当前哈希

For manifest mode:
  7. 读取 timestamp-manifest.json
  8. 逐条核对其中的 sha256 是否与实际文件匹配
  9. 检查 manifest 中的序号是否连续
```

---

## 5. 资产复用

| FIBEMATE 资产 | 复用方式 |
|---------------|----------|
| `scripts/verify-tsr.sh` | 核心验证逻辑 |
| `scripts/verify-tsr.js` | Node.js 版本 |
| `docs/timestamp-manifest.json` | 清单数据结构 |
| `docs/tsa/*.tsr` | 测试用例（218 个真实 TSR） |

---

## 6. 技术栈

- Node.js CLI
- 子进程调用 `openssl ts`（已有验证脚本）
- 零 npm 运行时依赖

---

## 7. 实现细节（伪代码）

### 7.1 入口 `bin/tsr-verify.js`

```js
#!/usr/bin/env node
// args: check|info|manifest|chain <path> [--verbose] [--json] [--strict]

const [cmd, target = '.'] = process.argv.slice(2);
const flags = parseFlags(process.argv); // { verbose:false, json:false, strict:false }

switch (cmd) {
  case 'check':    return check(target, flags);
  case 'info':     return info(target, flags);
  case 'manifest': return checkManifest(target, flags);
  case 'chain':    return checkChain(target, flags);
  default:         return showHelp();
}
```

### 7.2 核心验证 `lib/verify.js`

```js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 单文件验证
function verifyTsr(filePath) {
  // 1. 调用 openssl ts -reply 解析 TSR
  const out = execFileSync('openssl', [
    'ts', '-reply', '-in', filePath, '-text'
  ], { encoding:'utf8', timeout:5000 });

  // 2. 提取关键字段
  const status = /Status:\s*(\w+)/.exec(out)?.[1];           // Granted
  const serial = /Serial number:\s*(0x[0-9A-F]+)/.exec(out)?.[1];
  const ts    = /Time stamp:\s*(.+)/.exec(out)?.[1];          // May 10 08:00:00 2026 GMT
  const algo  = /Hash Algorithm:\s*(\S+)/.exec(out)?.[1];     // sha256
  const hash  = /Message data:\s*\n\s*(.{64})/.exec(out)?.[1]; // hex

  // 3. 验证状态
  if (status !== 'Granted') return { valid:false, reason:`Status: ${status}` };

  // 4. 验证时间戳在 TSA 证书有效期内
  const tsTime = new Date(ts);
  if (tsTime > new Date()) return { valid:false, reason:'Future timestamp' };

  // 5. 验证关联文件哈希（如存在同名 .sha256 文件）
  const shaFile = filePath.replace(/\.tsr$/, '.sha256');
  if (fs.existsSync(shaFile)) {
    const expectedHash = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
    const sourceFile = filePath.replace(/\.tsr$/, '');  // 去掉 .tsr 后缀 = 源文件
    if (fs.existsSync(sourceFile)) {
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
      if (actualHash !== expectedHash) return { valid:false, reason:'Hash mismatch', expected:expectedHash, actual:actualHash };
    }
  }

  return { valid:true, serial, timestamp:ts, algorithm:algo, messageHash:hash };
}
```

### 7.3 批量验证 `lib/check.js`

```js
async function check(targetPath, flags) {
  const stat = fs.statSync(targetPath);
  const files = stat.isDirectory()
    ? walkDir(targetPath).filter(f => f.endsWith('.tsr'))
    : [targetPath];

  const results = [];
  for (const file of files) {
    const name = path.basename(file, '.tsr');
    try {
      const r = verifyTsr(file);
      results.push({ file:name, ...r });
    } catch (e) {
      results.push({ file:name, valid:false, reason:e.message });
    }
  }

  const valid   = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);

  // 提取 TSA 机构
  const authorities = valid.reduce((acc, r) => {
    const tsa = r.serial?.startsWith('0xD') ? 'DigiCert' : 'FreeTSA';
    acc[tsa] = (acc[tsa] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    total:      results.length,
    valid:      valid.length,
    invalid:    invalid.length,
    range:      valid.length > 0
      ? `${valid[0].timestamp} ~ ${valid[valid.length-1].timestamp}`
      : 'N/A',
    authorities,
    chainGaps:  checkSequenceGaps(results),
  };

  if (flags.json) return console.log(JSON.stringify({ summary, details:results }, null, 2));
  return renderTable(summary, results, flags);

  // CI exit code
  if (flags.strict && invalid.length > 0) process.exit(1);
}
```

### 7.4 序列连续性检查 `lib/chain.js`

```js
function checkSequenceGaps(results) {
  // 从文件名提取序号: lg-001, lg-002, ...
  const nums = results
    .map(r => {
      const m = /(\d+)/.exec(r.file);
      return m ? parseInt(m[1]) : null;
    })
    .filter(n => n !== null)
    .sort((a, b) => a - b);

  const gaps = [];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i-1] + 1) {
      for (let j = nums[i-1] + 1; j < nums[i]; j++) gaps.push(j);
    }
  }
  return gaps;  // [] = no gaps = continuous chain
}
```

### 7.5 Manifest 验证

```js
async function checkManifest(manifestPath, flags) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseDir = path.dirname(manifestPath);

  const results = [];
  for (const entry of manifest.entries || manifest) {
    const tsrPath = path.join(baseDir, entry.tsr || `${entry.id}.tsr`);
    const r = verifyTsr(tsrPath);

    // 交叉验证 manifest 中的 sha256
    if (entry.sha256 && r.messageHash) {
      const match = entry.sha256.toLowerCase() === r.messageHash.toLowerCase();
      r.hashMatch = match;
      if (!match) r.valid = false;
    }

    results.push({ id:entry.id || entry.file, ...r });
  }

  return renderTable({ total:results.length, ...aggregate(results) }, results, flags);
}
```

### 7.6 错误处理

| 场景 | 行为 |
|------|------|
| openssl 未安装 | exit 2, "openssl not found. Install: apt install openssl / brew install openssl" |
| .tsr 文件损坏 | per-file: `valid:false, reason:'Parse error: {msg}'` |
| 目录为空 | exit 0, "No .tsr files found in {path}" |
| manifest.json 格式错误 | exit 3, "Invalid manifest: {msg}" |
| 证书链断裂（verification failure） | per-file: `valid:false, reason:'Certificate verification failed'` |

### 7.7 依赖

- **运行时**：Node.js ≥ 18 + 系统 `openssl` 命令
- **npm 依赖**：零（纯 Node.js 标准库）
- **测试数据**：218 个真实 TSR 文件 → 打包为 `test/fixtures/`

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
