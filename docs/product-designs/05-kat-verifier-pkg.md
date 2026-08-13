# kat-verifier — 可复用 KAT 验证包 设计文档

**类型**：npm 包（轻量）
**状态**：设计阶段
**优先级**：⭐⭐⭐⭐

---

## 1. 产品定位

把 FIBEMATE 最成熟的资产——KAT 10000 轮一致性验证——封装为独立 npm 包。其他 PQC 库可以引用这个包来验证自己的实现是否与 NIST 参考一致。

---

## 2. API 设计

```js
import { KatVerifier } from '@fibemate/kat-verifier';

// 2.1 基本验证
const verifier = new KatVerifier({
  algorithm: 'ML-KEM-768',
  katDir: './kat-vectors/ml-kem-768/',
});

const result = await verifier.run({
  keygen: myKeygenFn,     // () => { pk, sk }
  encaps: myEncapsFn,     // (pk) => { ct, ss }
  decaps: myDecapsFn,     // (sk, ct) => ss
});

console.log(result.summary);
// => "ML-KEM-768: 100/100 KATs PASSED (25 KeyGen, 25 Encaps, 25 Decaps, 25 RoundTrip)"
// result.details → [{ vectorId, stage, passed, expected, actual, duration }]
```

### 2.2 NIST ACVP-Server 自动下载

```js
// 自动从 NIST 下载 KAT 向量
const verifier = await KatVerifier.fromNist('ML-KEM-768');
```

### 2.3 自定义向量

```js
const verifier = new KatVerifier({
  algorithm: 'custom',
  vectors: [ /* 手工定义的 KAT 向量 */ ],
});
```

---

## 3. 输出格式

| 模式 | 输出 |
|------|------|
| default | 彩色终端 table |
| `--json` | `{ algorithm, total, passed, failed, details[] }` |
| `--ci` | exit 0=全部通过, exit 1=有失败 |
| `--benchmark` | 每轮耗时 + 统计（min/avg/max/p95） |

---

## 4. 支持的算法

| 算法 | KAT 来源 | 向量数量 |
|------|----------|:---:|
| ML-KEM-768 | NIST ACVP-Server | 25 KeyGen + 25 Encaps + 25 Decaps = 75 |
| ML-DSA-44/65/87 | NIST ACVP-Server | 25 × 3 = 75 |
| SLH-DSA-128s/192f | NIST ACVP-Server | 100 每组 |
| SM2 | 自研向量 + GM/T 0003 | 11 |
| SM3 | GM/T 0004 | 30 |
| SM4 | GM/T 0002 + 自研 | 10 |

---

## 5. 技术栈

- 纯 JavaScript（Node.js），零 WASM 依赖
- KAT 向量：嵌入包内（或按需下载）
- 发布到 npm：`@fibemate/kat-verifier`

---

## 6. 与现有代码的关系

| 现有资产 | 关系 |
|----------|------|
| `scripts/kat-verify.mjs` (238 行, 6.9KB) | 核心逻辑来源 |
| `scripts/kat-bench.js` | 基准测试 |
| `kat_results/` | 已下载的 NIST KAT 向量 |
| `packages/pqc-kem/` | 参考实现（用于自检） |

---

## 7. 实现细节（伪代码）

### 7.1 核心类 `lib/kat-verifier.js`

```js
class KatVerifier {
  constructor(opts) {
    this.algorithm = opts.algorithm;
    this.vectors   = opts.vectors || [];
    this.katDir    = opts.katDir || null;
  }

  // 从 NIST ACVP-Server 自动下载
  static async fromNist(algorithm) {
    // algorithm → NIST endpoint mapping
    const endpoints = {
      'ML-KEM-768': 'acvp.nist.gov/.../ml-kem-768/prompt.json',
      'ML-DSA-44':  'acvp.nist.gov/.../ml-dsa-44/prompt.json',
      'ML-DSA-65':  'acvp.nist.gov/.../ml-dsa-65/prompt.json',
      'ML-DSA-87':  'acvp.nist.gov/.../ml-dsa-87/prompt.json',
      'SLH-DSA-128s': 'acvp.nist.gov/.../slh-dsa-128s/prompt.json',
    };
    const url = endpoints[algorithm];
    if (!url) throw new Error(`Unknown algorithm: ${algorithm}`);

    const resp = await fetch(url);
    const vectors = parseNistPrompt(await resp.json());
    // parseNistPrompt: 把 NIST JSON prompt 转为标准 KAT 格式
    // → [{ id, stage:'keygen'|'encaps'|'decaps', expect:{pk,sk,ct,ss} }]
    return new KatVerifier({ algorithm, vectors });
  }

  // 运行验证
  async run(impl) {
    const details = [];

    for (const vec of this.vectors) {
      const start = process.hrtime.bigint();
      let result;

      try {
        result = await this._runOne(vec, impl);
      } catch (e) {
        result = { passed: false, error: e.message };
      }

      const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms
      details.push({ vectorId: vec.id, stage: vec.stage, ...result, duration: elapsed });
    }

    return this._summarize(details);
  }

  // 单条 KAT 验证
  async _runOne(vec, impl) {
    switch (vec.stage) {
      case 'keygen': {
        const { pk, sk } = impl.keygen(vec.seed);        // 确定性密钥生成
        return {
          passed:  bufEq(pk, vec.expect.pk) && bufEq(sk, vec.expect.sk),
          expected: { pk: hex(vec.expect.pk), sk: hex(vec.expect.sk) },
          actual:   { pk: hex(pk), sk: hex(sk) },
        };
      }
      case 'encaps': {
        const { ct, ss } = impl.encaps(vec.pk);
        return {
          passed:  bufEq(ct, vec.expect.ct) && bufEq(ss, vec.expect.ss),
          expected: { ct: hex(vec.expect.ct), ss: hex(vec.expect.ss) },
          actual:   { ct: hex(ct), ss: hex(ss) },
        };
      }
      case 'decaps': {
        const ss = impl.decaps(vec.sk, vec.ct);
        return {
          passed:  bufEq(ss, vec.expect.ss),
          expected: { ss: hex(vec.expect.ss) },
          actual:   { ss: hex(ss) },
        };
      }
      default:
        return { passed: false, error: `Unknown stage: ${vec.stage}` };
    }
  }

  _summarize(details) {
    const passed = details.filter(d => d.passed);
    const failed = details.filter(d => !d.passed);
    const times  = details.map(d => d.duration).filter(t => t > 0);
    times.sort((a,b) => a - b);

    return {
      algorithm: this.algorithm,
      total:     details.length,
      passed:    passed.length,
      failed:    failed.length,
      stages:    groupBy(details, 'stage'),
      timing: {
        min:   times[0],
        max:   times[times.length - 1],
        avg:   times.reduce((a,b) => a+b, 0) / times.length,
        p95:   times[Math.floor(times.length * 0.95)],
      },
      summary:   `${this.algorithm}: ${passed.length}/${details.length} KATs PASSED`,
      details,
    };
  }
}

// 常量时间 buffer 比较
function bufEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

### 7.2 CLI 入口 `bin/kat-verify.js`

```js
#!/usr/bin/env node
// args: [--algorithm ALGO] [--json] [--ci] [--benchmark]

async function main() {
  const flags = parseFlags(process.argv);

  // 自动检测：如果当前目录有 kat_results/ 则用它
  const katDir = flags.katDir || findKatDir();
  const algo   = flags.algorithm || detectAlgorithm(katDir);

  const verifier = new KatVerifier({ algorithm: algo, katDir });
  const result = await verifier.run(loadImpl(flags));

  if (flags.json)      return console.log(JSON.stringify(result));
  if (flags.ci)        return process.exit(result.failed > 0 ? 1 : 0);
  if (flags.benchmark) return renderBenchmark(result);
  return renderTable(result);
}

function findKatDir() {
  // 按优先级搜索: ./kat_results → ../kat_results → ~/.kat-vectors
  const candidates = ['./kat_results', '../kat_results'];
  for (const d of candidates) if (fs.existsSync(d)) return d;
  throw new Error('No KAT directory found. Run with --kat-dir <path>');
}

function loadImpl(flags) {
  // 默认使用 FIBEMATE 内置实现
  // 也可通过 --impl ./my-ml-kem.js 指定外部实现
  if (flags.impl) return require(path.resolve(flags.impl));
  return require('@fibemate/pqc-kem');
}
```

### 7.3 NIST Prompt 解析 `lib/nist-parser.js`

```js
function parseNistPrompt(prompt) {
  // NIST ACVP prompt 格式:
  // { "vsId":0, "testGroups":[{ "tests":[{ "tcId":1, "pk":"...", "sk":"...", ... }] }] }
  const vectors = [];
  for (const tg of prompt.testGroups) {
    const stage = tg.testType;  // "AFT" = Algorithm Functional Test
    for (const t of tg.tests) {
      vectors.push({
        id:    `${stage}-${t.tcId}`,
        stage: stageMap[tg.testType] || 'unknown',
        seed:  t.seed || null,
        expect: {
          pk: hexToBuf(t.pk),
          sk: hexToBuf(t.sk),
          ct: hexToBuf(t.ct),
          ss: hexToBuf(t.ss),
        },
      });
    }
  }
  return vectors;
}
```

### 7.4 错误处理

| 场景 | 行为 |
|------|------|
| 算法不支持 | exit 2, "Unsupported algorithm: {algo}. Supported: ..." |
| KAT 目录不存在 | exit 2, "KAT directory not found" |
| 实现函数签名不符 | throw TypeError with expected signature |
| 单条 KAT 失败 (非 CI 模式) | 继续执行，汇总时标红 |
| 单条 KAT 失败 (CI 模式) | 继续执行，最后 exit 1 |
| 随机种子缺失 (keygen 需要固定输出) | 跳过该条，标记 skipped |

### 7.5 包结构

```
@fibemate/kat-verifier/
├── bin/kat-verify.js       CLI 入口
├── lib/
│   ├── kat-verifier.js     核心类
│   ├── nist-parser.js       NIST ACVP prompt 解析
│   └── reporter.js          表格/JSON/HTML 渲染
├── vectors/                 内置 KAT 向量（打包进 npm）
│   ├── ml-kem-768/
│   ├── ml-dsa-44/
│   └── ...
├── test/
│   ├── fixtures/            218 个真实 TSR → 10 条 KAT 样本
│   └── test-kat-verify.js
└── package.json
```

### 7.6 npm 打包策略

- **小包**（默认安装）：只含 CLI + 核心逻辑，向量按需下载
- **全量包**：`@fibemate/kat-verifier/vectors` 子路径导出，含所有 NIST KAT 向量（约 2MB）
- `npm install @fibemate/kat-verifier` → 下载轻量版
- `npm install @fibemate/kat-verifier --with-vectors` → 下载含向量版

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
