# pqc-migrate — PQC 迁移评估 CLI 设计文档

**类型**：npm 全局 CLI 工具
**状态**：设计阶段（冻结期内不实现）
**优先级**：⭐⭐⭐⭐⭐
**预计实现耗时**：2-3 小时

---

## 1. 产品定位

一键扫描项目依赖，输出"量子脆弱组件"报告。`npx pqc-migrate scan` 进入任何 Node.js 项目目录即跑。

**核心叙事**："你的项目做好了抗量子准备吗？这个命令告诉你。"

---

## 2. 命令行接口

```
Commands:
  pqc-migrate scan [path]    扫描指定目录（默认 .）
  pqc-migrate report [path]  输出上一次扫描的 JSON/HTML 报告
  pqc-migrate ci [path]      CI 模式：只返回 exit code（0=安全, 1=有风险）
  pqc-migrate init           生成 .pqc-migrate.yml 配置文件

Options:
  --output json|html|table  输出格式（默认 table）
  --threshold 0-100         风险阈值（默认 50，≥50 标记高风险）
  --ignore-dev              忽略 devDependencies
  --json                    等同于 --output json
  --no-color                禁用颜色输出
```

### 3. 输出示例

```
🔍 PQC Migration Scanner v1.0
📁 Scanning: /home/user/my-project
📦 Dependencies: 147 (127 prod + 20 dev)

🔴 HIGH — 3 components with quantum-vulnerable algorithms:
  jsonwebtoken@9.0.2     → RSA-2048 (sign)      → Replace with ML-DSA-44
  elliptic@6.5.4          → ECDSA P-256 (sign)   → Replace with ML-DSA-44
  crypto-js@4.2.0         → AES-128 (encrypt)    → Monitor (Grover: 64-bit)

🟡 MEDIUM — 5 components with classical cryptography:
  bcrypt@5.1.1            → SHA-512 (hash)        → Replace with SHA3-512
  ...

🟢 OK — 139 components

📊 Overall Quantum Readiness Score: 78/100
⚠️  3 critical items must be addressed before full PQC migration.
```

---

## 4. 数据来源（复用 FIBEMATE 资产）

| 资产 | 复用方式 |
|------|----------|
| `www/docs/pqc-dashboard-data.json` | 算法→量子安全位映射表 |
| `www/pqc-ecosystem-scanner.html` | 扫描逻辑（CJS/ESM import 解析） |
| `www/docs/cbom-cyclonedx.json` | CBOM 生成参考 |
| `scripts/cbom-generator.js` | 依赖图遍历算法 |

---

## 5. 检测规则表

| 密码原语 | 算法 | 量子安全位 | 迁移建议 | 紧急度 |
|----------|------|:---:|------|:---:|
| RSA-2048+ | 非对称加密/签名 | 0 | ML-KEM-768 / ML-DSA-44 | 🔴 |
| ECDSA P-256 | 签名 | 0 | ML-DSA-44 | 🔴 |
| ECDH P-256 | 密钥交换 | 0 | ML-KEM-768 | 🔴 |
| AES-128 | 对称加密 | 64 (Grover) | AES-256 | 🟡 |
| SHA-256 | 哈希 | 128 (Grover) | SHA3-512 / SHAKE256 | 🟡 |
| SM2 | 签名/加密 | 0 | ML-KEM-768 + ML-DSA-44 | 🔴 |
| SM3 | 哈希 | ~128 (Grover) | SHAKE256 | 🟢 |
| SM4 | 对称加密 | ~64 (Grover) | AES-256 | 🟡 |
| ML-KEM-768 | KEM | 128 | — | 🟢 |
| ML-DSA-44 | 签名 | 128 | — | 🟢 |

---

## 6. CI 集成

```yaml
# .github/workflows/pqc-check.yml
- name: PQC Migration Check
  run: npx pqc-migrate ci --threshold 50
```

- exit 0 → 无高风险依赖，通过
- exit 1 → 发现高风险依赖，阻断合并

---

## 7. 技术栈

- Node.js CLI（`bin` 入口 + `commander` 或手写 argv 解析）
- 零运行时依赖（自包含 CBOM 检测逻辑）
- 发布到 npm：`pqc-migrate`

---

## 8. 实现细节（伪代码）

### 8.1 入口 `bin/pqc-migrate.js`

```js
#!/usr/bin/env node
// args: scan|report|ci|init [path] [--output json|html|table] [--threshold N] [--ignore-dev] [--no-color]

const [cmd, target = '.'] = process.argv.slice(2);
const flags = parseFlags(process.argv); // { output:'table', threshold:50, ignoreDev:false, color:true }

switch (cmd) {
  case 'scan':   return scan(target, flags);
  case 'report': return report(target, flags);
  case 'ci':     return ci(target, flags);
  case 'init':   return init(target);
  default:       return showHelp();
}
```

### 8.2 核心扫描 `lib/scan.js`

```js
async function scan(rootDir, flags) {
  // 1. 检测项目类型
  const manifest = detectManifest(rootDir);
  // → { type:'npm', file:'package.json', lock:'package-lock.json' }
  // → { type:'golang', file:'go.mod' }
  // → { type:'maven', file:'pom.xml' }
  // → null (unknown)

  if (!manifest) throw new Error('No supported project found');

  // 2. 解析依赖树
  const deps = parseManifest[manifest.type](rootDir, manifest);
  // npm:   recurse package-lock.json → [{name, version, type:'prod'|'dev'}, ...]
  // go:    parse go.mod require blocks → [{name, version}, ...]
  // maven: parse pom.xml dependencies → [{groupId, artifactId, version}, ...]

  // 3. 过滤 devDependencies (if --ignore-dev)
  const targets = flags.ignoreDev
    ? deps.filter(d => d.type !== 'dev')
    : deps;

  // 4. 匹配密码学依赖
  const findings = [];
  for (const dep of targets) {
    const match = matchCryptoDep(dep.name, dep.version);
    // matchCryptoDep 查询内置规则表 → { algorithm, category, quantumBits, migration, severity }
    if (match) findings.push({ ...dep, ...match });
  }

  // 5. 计算风险评分
  const score = calcScore(findings, deps.length);
  // score = 100 - Σ(severity × weight) / totalDeps × 100
  // severity: HIGH=30, MEDIUM=15, LOW=5

  // 6. 生成报告
  const report = { path: rootDir, manifest, totalDeps: deps.length, findings, score, timestamp: new Date().toISOString() };

  // 7. 保存缓存（供 report 命令使用）
  fs.writeFileSync(path.join(rootDir, '.pqc-migrate-cache.json'), JSON.stringify(report));

  // 8. 输出
  if (flags.output === 'json')   return console.log(JSON.stringify(report, null, 2));
  if (flags.output === 'html')   return renderHtml(report);
  return renderTable(report, flags.color);
}
```

### 8.3 密码算法匹配 `lib/matchers.js`

```js
// 规则表 —— 定义哪些 npm/go/maven 包包含密码学实现
const CRYPTO_PACKAGES = {
  // npm
  'jsonwebtoken': { algorithm:'RSA-2048',  category:'sign',     severity:'HIGH' },
  'elliptic':     { algorithm:'ECDSA',     category:'sign',     severity:'HIGH' },
  'crypto-js':    { algorithm:'AES-128',   category:'encrypt',  severity:'MEDIUM' },
  'bcrypt':       { algorithm:'SHA-512',   category:'hash',     severity:'MEDIUM' },
  'sm-crypto':    { algorithm:'SM2',       category:'sign',     severity:'HIGH' },
  '@noble/curves':{ algorithm:'ECDSA',     category:'sign',     severity:'HIGH' },
  '@noble/post-quantum': { algorithm:'ML-KEM', category:'kem', severity:'LOW' },
  // go
  'crypto/rsa':   { algorithm:'RSA',       category:'sign',     severity:'HIGH' },
  'crypto/ecdsa': { algorithm:'ECDSA',     category:'sign',     severity:'HIGH' },
  // maven
  'bcprov':       { algorithm:'RSA+ECDSA', category:'multiple', severity:'HIGH' },
};

function matchCryptoDep(name, version) {
  // 精确匹配 → 模糊匹配 → 无匹配
  if (CRYPTO_PACKAGES[name]) return enrich(CRYPTO_PACKAGES[name]);

  // 模糊: 包名含 crypto/cipher/ssl/tls → 标记为 "manual-review"
  const keywords = /(crypto|cipher|ssl|tls|encrypt|decrypt|sign|verify|hash|keccak|sha|aes|rsa|ecc|ecdsa|ecdh|kem|dsa)/i;
  if (keywords.test(name)) return { algorithm:'unknown', category:'unknown', severity:'LOW', note:'needs manual review' };
  return null;
}

function enrich(match) {
  // 从 RULES 表填充 quantumBits + migration
  const rule = RULES[match.algorithm];
  return { ...match, quantumBits: rule.quantumBits, migration: rule.migration };
}
```

### 8.4 CI 模式 `lib/ci.js`

```js
async function ci(rootDir, flags) {
  const report = await scan(rootDir, { ...flags, output:'json', color:false });
  const highCount = report.findings.filter(f => f.severity === 'HIGH').length;
  const score = report.score;

  if (highCount > 0 && score < flags.threshold) {
    console.error(`❌ PQC check FAILED: ${highCount} HIGH-risk deps, score ${score}/${flags.threshold}`);
    process.exit(1);
  }
  console.log(`✅ PQC check PASSED: score ${score}`);
  process.exit(0);
}
```

### 8.5 错误处理

| 场景 | 行为 |
|------|------|
| 目录不存在 | exit 2, stderr "Directory not found: {path}" |
| 不支持的项目类型 | exit 2, stderr "No supported manifest found. Supported: package.json, go.mod, pom.xml" |
| package-lock.json 缺失 | exit 2, stderr "Run npm install first to generate lock file" |
| 解析错误 | exit 3, stderr "Parse error: {detail}" |
| 无密码学依赖 | exit 0, stdout "🟢 No crypto dependencies detected" |

### 8.6 数据结构

```ts
interface ScanReport {
  path: string;
  manifest: { type: 'npm'|'golang'|'maven'; file: string; lock?: string };
  totalDeps: number;
  findings: Finding[];
  score: number;           // 0-100
  timestamp: string;       // ISO 8601
}

interface Finding {
  name: string;
  version: string;
  type: 'prod'|'dev';
  algorithm: string;       // RSA-2048 / ECDSA P-256 / ...
  category: 'sign'|'encrypt'|'hash'|'kem'|'multiple'|'unknown';
  quantumBits: number;     // 0=broken by Shor, 64/128=Grover-safe
  migration: string;       // 推荐迁移方案
  severity: 'HIGH'|'MEDIUM'|'LOW';
  note?: string;
}
```

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
