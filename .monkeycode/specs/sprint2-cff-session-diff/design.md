# Sprint 2: 控制流扁平化 (CFF) + session diff 量化

- **版本**: v2.4-dynamic, Sprint 2
- **基于**: v2.3-alpha-stage2 + Sprint 1 dynamic defense (`2f0655e`)
- **日期**: 2026-08-17
- **状态**: 已实施，81/81 测试全绿

## 1. 目标与边界

### 1.1 核心目标

在 Sprint 1（运行时主动防御）之上，把静态逆向成本再抬高一档：

1. **控制流扁平化 (CFF)**：把 VM 解释器主循环的 `match ins.op` 分派从
   结构化 switch 改为 seed 驱动的扁平化分派（状态变量 + 哈希跳转），使
   IDA/Ghidra/angr 无法直接读出 opcode → handler 的静态映射。
2. **session diff 量化**：建立可复现的度量，量化不同 session_key 在
   完整管线下输出差异比例，作为混淆质量回归基线。

### 1.2 明确边界（诚实声明）

| 能力 | 目标 | 不承诺 |
| :--- | :--- | :--- |
| 静态分析抗性 | 分派逻辑不可静态直读 | 防不住人工耐心逆推 |
| 动态调试抗性 | 与 Sprint 1 叠加 | 不防内存转储 + 宿主替换 |
| 度量可复现 | session diff 量化基线 | 不承诺绝对"最优"混淆度 |
| 性能 | 不劣化（CFF 仅重排分派，不增数据面开销） | 不优化 Stage-3 harden O(n²)（独立任务） |

**约束**：WASM 环境，不得引入 WASI/OS 依赖；体积预算沿用 gzip ≤40KB 口径
（当前 25.3KB，余量充足）。

## 2. 设计

### 2.1 控制流扁平化（新模块 `cff.rs`）

现状：`vm.rs` 的 `run()` / `run_defended()` 用 `match ins.op` 直分派，
angr 的 CFG 恢复 + 符号执行可直接枚举全部 handler 分支。

改造目标：将**解码→分派**的对应关系与 seed 绑定，静态时不可知。

方案（不新增真实控制流，仅重排分派结构）：

```
A. 解码后的 op 先做一次 seed 派生的置换混淆：
      let dispatch = CFF_DISPATCH[seed, op_index];   // 16 项置换表，seed 派生
B. 主循环以 dispatch 值为状态，经 match 进入对应 handler；
      match dispatch {
          0 => handle_nop(),      // 每个 handler 独立小函数，顺序随 seed 打乱
          1 => handle_wreath(),   // 命中率表在编译期由 CFF_MAP 重排
          ...
      }
C. handler 内部不再直接 return 到循环，而是落到统一的下一条指令解码。
```

要点：

- **零数据面开销**：置换表 `[u8; 16]` 在 `compile_program` 时随
  `(seed, session_key, depth)` 派生，一次查表多 1 次数组访问。
- **正确性保持**：`run()` 与 `run_defended()` 语义不变，全部 72 项测试
  必须仍绿；新增 CFF 单测覆盖置换表性质（双射、seed 敏感性、恒等性）。
- **与 Sprint 1 叠加**：`run_defended` 的采样校验、计时、投毒路径不动。
- **无硬编码表**：dispatch 表编译期由 seed 生成，二进制中无固定映射
  （延续 opcode.rs 的差异化合规原则）。

### 2.2 session diff 量化（`lib.rs` 新增度量 API + 测试）

背景：Stage-2 已保证"不同 session 产出不同字节码"，但缺少可复现的
**数量化证据**。Sprint 2 补上度量：

```
session_diff_ratio(data, seed, sk1, sk2, depth) -> f64
    out1 = obfuscate(data, seed, sk1, depth)
    out2 = obfuscate(data, seed, sk2, depth)
    changed = |{ i : out1[i] != out2[i] }|
    ratio   = changed / len(data)
```

- 对多种 size（64/256/1024）、多种 seed、多组 (sk1,sk2) 运行，记录 ratio 分布。
- 回归断言：**ratio 必须显著 > 0 且无系统性 0**（防止未来改动退化）。
  不设死线"必须 100%"——诚实度量，避免人为挑选参数美化结果。
- WASM API：`lgv3_session_diff_ratio(data, seed, sk1, sk2, depth) -> f64`。

### 2.3 验收标准

| # | 标准 | 验证方式 |
| :--- | :--- | :--- |
| 1 | 全部既有测试仍绿（≥72） | `cargo test` |
| 2 | CFF 置换表是双射且 seed 敏感 | 新增 cff 单测 |
| 3 | CFF 不改输出语义 | run vs run_defended 字节一致回归 |
| 4 | session diff ratio 全样本 > 0 且分布有区分度 | 新增量化测试 + 输出记录 |
| 5 | WASM 构建通过 | `cargo build --release --target wasm32-unknown-unknown` |
| 6 | gzip 体积 ≤40KB | wasm-opt -Oz + gzip |

## 3. 工作量拆解

| 任务 | 文件 | 说明 |
| :--- | :--- | :--- |
| 1 | `src/cff.rs`（新） | CFF dispatch 表生成 + 置换性质测试 |
| 2 | `src/vm.rs` | `run`/`run_defended` 接入 CFF 分派 |
| 3 | `src/pipeline.rs` | `compile_program` 派生 CFF 表并注入 Program |
| 4 | `src/lib.rs` | `lgv3_session_diff_ratio` API + 量化测试 |
| 5 | `docs/` | 记录量测结果与体积复测 |

## 4. 风险

- **CFF 引入回归**：靠全量 72 测试 + 新增单测兜底；改动集中在分派结构，
  数据面逻辑不触碰。
- **diff 度量为 0 的退化**：若某 (seed,sk,depth) 组合 ratio 为 0，
  说明 session 未进入混淆路径，量化测试会失败暴露，而非静默。
- **体积**：CFF 增加少量指令；gzip 口径余量充足，若超预算可 --strip-debug。
