# NTT Benchmark — 跨平台 NTT 性能基准 设计文档

**类型**：CLI 工具 + Web 可视化
**状态**：设计阶段
**优先级**：⭐⭐⭐⭐

---

## 1. 产品定位

NTT（Number Theoretic Transform）是格密码的性能核心。同一次 NTT 运算，在不同平台（JS/WASM/C/FPGA）上的性能可能差 1000 倍。这个工具把差异可视化。

---

## 2. 命令行接口

```
Commands:
  ntt-bench run        在当前平台上运行 NTT 基准测试
  ntt-bench compare    加载多平台结果并对比
  ntt-bench web        启动 Web 对比页面

Options:
  --size 256|512|1024  NTT 维度（默认 256）
  --rounds 1000        测试轮数（默认 10000）
  --modulus 3329|8380417  模数（Q）
```

---

## 3. 测试矩阵

| 平台 | 语言 | 关键优化 | 预期延迟（N=256, Q=8380417） |
|------|------|----------|:---:|
| JS naive | JavaScript | — | ~500µs |
| JS optimized | JavaScript | 预计算 zeta | ~120µs |
| WASM (fml-dsa) | Rust → WASM | SIMD | ~40µs |
| C Native | C | AVX2 + O3 + flto | ~8µs |
| C Native (Neon) | C | ARM Neon | ~15µs |
| FPGA (Artix-7) | Verilog | 硬件流水线 | ~0.5µs |

---

## 4. Web 对比页面

```
┌─────────────────────────────────────────────────┐
│  ⚡ NTT 性能基准对比                             │
│  [N=256] [N=512] [N=1024] [Q=3329] [Q=8380417]  │
├─────────────────────────────────────────────────┤
│                                                  │
│  JS ───────────────████████████████  500µs       │
│  JS opt ────────██████████           120µs       │
│  WASM ─────███████                    40µs       │
│  C AVX2 ██                             8µs       │
│  FPGA  ▌                               0.5µs     │
│                                                  │
│  📊 加速比: FPGA 比 JS 快 1000×                  │
│  💡 每次握手 14 次 NTT → FPGA 省 ~7ms             │
│                                                  │
│  [📤 导出 CSV] [🔗 分享链接]                      │
└─────────────────────────────────────────────────┘
```

---

## 5. 数据来源

| 数据 | 来源 |
|------|------|
| JS naive | `packages/fml-dsa/src/ntt.js` |
| JS optimized | `packages/pqc-kem/src/ntt.js` |
| WASM | `rust/fml-dsa-wasm/` |
| C Native | `packages/pqc-kem/native/ntt.c` |
| FPGA | `rtl/ntt_pipe2.v`（综合后的时序报告） |

---

## 6. 学术价值

NTT 性能对比是密码学会议（CHES/FPL/DAC）的经典主题。这个工具可以：
- 作为论文的性能评估基准
- 帮助研究者理解不同平台的 NTT 实现差异
- 为 FPGA 加速器提供设计参考

---

## 7. 技术栈

- CLI：Node.js（子进程调用 C/WASM/FPGA 仿真）
- Web：纯 Canvas 2D `performance.html` 风格（复用设计系统）

---

## 8. 实现细节（伪代码）

### 8.1 CLI 入口 `bin/ntt-bench.js`

```js
#!/usr/bin/env node
// args: run|compare|web [--size N] [--rounds N] [--modulus Q]

async function main() {
  const flags = parseFlags(process.argv);
  const size    = flags.size    || 256;
  const rounds  = flags.rounds  || 10000;
  const modulus = flags.modulus || 8380417n;
  const cmd     = flags._[0]    || 'run';

  switch (cmd) {
    case 'run':     return runBenchmark({ size, rounds, modulus });
    case 'compare': return compareResults(flags);
    case 'web':     return startWebServer(flags);
    default:        return showHelp();
  }
}
```

### 8.2 基准测试核心 `lib/bench.js`

```js
async function runBenchmark({ size, rounds, modulus }) {
  const platforms = [];

  // 1. JS naive — 直接在进程内调用
  if (hasJsImpl()) {
    const impl = require('../packages/fml-dsa/src/ntt.js');
    platforms.push({
      name: 'JS (naive)',
      result: await benchPlatform('js-naive', impl, { size, rounds, modulus }),
    });
  }

  // 2. JS optimized — 预计算 zeta 表
  if (hasJsOptimized()) {
    const impl = require('../packages/pqc-kem/src/ntt.js');
    platforms.push({
      name: 'JS (optimized)',
      result: await benchPlatform('js-opt', impl, { size, rounds, modulus }),
    });
  }

  // 3. WASM — spawn 子进程加载 .wasm
  if (hasWasm()) {
    const result = await spawnBench('wasm', [
      '--wasm', '../rust/fml-dsa-wasm/pkg/fml_dsa_bg.wasm',
      '--size', size, '--rounds', rounds, '--modulus', modulus.toString(),
    ]);
    platforms.push({ name: 'WASM (fml-dsa)', result });
  }

  // 4. C Native — 子进程调用编译好的二进制
  if (hasNative()) {
    const result = await spawnBench('native', [
      '../packages/pqc-kem/native/build/Release/ntt_bench',
      '--size', size, '--rounds', rounds, '--modulus', modulus.toString(),
    ]);
    platforms.push({ name: 'C (AVX2)', result });
  }

  // 5. FPGA — 调用仿真器（如有）
  if (hasFpgaSim()) {
    const result = await spawnBench('fpga', [
      'vvp', '../rtl/ntt_pipe2_tb.vvp',
      '+N=' + size, '+Q=' + modulus,
    ]);
    platforms.push({ name: 'FPGA (Artix-7)', result });
  }

  // 生成报告
  const report = generateReport(platforms, { size, rounds, modulus });
  saveReport(report);
  renderTable(report);
}
```

### 8.3 基准测试子进程 `ntt-bench-worker.js`

```js
// 被 spawn 调用的独立进程，避免 JIT 预热污染
function benchPlatform(impl, { size, rounds, modulus }) {
  // 预热
  const testVec = randomVec(size, modulus);
  impl.ntt(testVec);

  // 正式测试
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const vec = randomVec(size, modulus);
    const start = process.hrtime.bigint();
    impl.ntt(vec);
    const elapsed = Number(process.hrtime.bigint() - start); // ns
    times.push(elapsed);
  }

  times.sort((a, b) => a - b);
  return {
    platform: 'js',
    size,
    modulus: modulus.toString(),
    rounds,
    min:    times[0] / 1000,                            // µs
    avg:    times.reduce((a,b)=>a+b,0) / times.length / 1000,
    p50:    times[Math.floor(times.length * .50)] / 1000,
    p95:    times[Math.floor(times.length * .95)] / 1000,
    p99:    times[Math.floor(times.length * .99)] / 1000,
    max:    times[times.length - 1] / 1000,
    throughput: Math.round(rounds / (times.reduce((a,b)=>a+b,0) / 1e9)),  // ops/s
  };
}
```

### 8.4 报告结构

```ts
interface NttBenchReport {
  meta: {
    date: string;           // ISO 8601
    machine: string;        // hostname
    cpu: string;            // cat /proc/cpuinfo | grep 'model name' | head -1
    arch: string;           // x86_64 / aarch64
    nodeVersion: string;    // process.version
  };
  params: {
    size: number;
    rounds: number;
    modulus: string;        // BigInt → string for JSON-safe
  };
  results: PlatformResult[];
  comparison: {
    baseline: string;       // 最慢平台 → 加速比基准
    speedups: Record<string, number>;  // 各平台对基准的加速比
  };
}

interface PlatformResult {
  name: string;            // "JS (naive)" / "WASM (fml-dsa)" / "C (AVX2)" / "FPGA (Artix-7)"
  min: number;             // µs
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  throughput: number;      // ops/s
  status: 'ok' | 'skipped' | 'error';
  error?: string;
}
```

### 8.5 Web 对比页面数据流

```js
// compare 模式：加载多平台基准报告
async function compareResults(flags) {
  const reports = [];
  // 1. 当前平台结果
  reports.push(await runBenchmark({ size, rounds, modulus }));

  // 2. 从 JSON 文件加载历史结果
  const historyDir = flags.history || './bench-history/';
  for (const file of fs.readdirSync(historyDir).filter(f => f.endsWith('.json'))) {
    reports.push(JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')));
  }

  // 3. 合并并渲染对比表
  const merged = mergeReports(reports);

  if (flags.web) {
    startWebServer(merged);  // 启动本地 HTTP 服务展示对比页
  } else {
    renderCompareTable(merged);  // 终端打印对比表
  }
}
```

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
