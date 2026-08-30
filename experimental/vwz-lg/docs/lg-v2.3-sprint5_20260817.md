# LG v2.3 Sprint 5 实施记录（2026-08-17）

## 范围

Sprint 5 = 五短板补全 #1「防自动化攻击」的独立专项：**算术不透明谓词
（arithmetic opaque predicates，恒真判定混淆）**。

Sprint 4 边界确认将「独立算术不透明谓词（恒真/恒假判定混淆）」明确留给本 Sprint；
Sprint 4 的 Substitute 恒等层只算"结构不透明"（层内嵌查表，路径由 session 驱动），
本轮补上**独立的、数学上恒真的算术谓词**，作为 VM 执行循环中的 checkpoint。

与前四个 Sprint 一致，本 Sprint 是对 v2.3 既有设计文档规划的执行，纯增量，不改
任何既有字节级行为。

## 目标

在 VM 程序执行的每一步插入一个**恒真算术谓词**检查点：

- 谓词是数学恒等式（二次剩余 / 费马小定理 / 连续整数乘积等），对任意输入恒真。
- 静态分析器若想消除该检查，必须完成数论推理（例如证明 `x^3 - x` 恒被 6 整除），
  否则只能假设「检查失败」分支存在，被迫同时跟踪两条路径 → 扩大自动化分析成本。
- 运行时结果恒真，不影响数据与 roundtrip，黄金向量逐字节不变（向后兼容）。

作用：
1. **判定混淆**：每个 checkpoint 的谓词族与盐由 (seed, session_key, depth) 派生，
   不同参数的程序携带不同谓词族，分析结论无法跨程序复用。
2. **运行时篡改检测**：恒真断言一旦失败（理论不可达），说明程序状态被动态补丁，
   触发防御引擎异常记录（与 Sprint 1 的主动防御联动，可驱动投毒）。
3. **防 LLVM 优化消除**：用 `std::hint::black_box` 阻止编译器常量折叠，确保谓词
   表达式真实保留在 WASM 二进制中。

## 集成方式

按用户确认的方案，在 `vm.rs` 的执行循环内做 checkpoint 注入，不新增指令、不改
opcode 表（保持 NUM_OPS=16）、不碰 premix/wreath/harden/seal 结构。

### `src/opaque.rs`（新增模块）

- `OpaqueFamily` 枚举，7 个数学上恒真的算术谓词族：
  - `QuadraticParity`：`(x^2 + x) & 1 == 0`
  - `ConsecutiveProd`：`x*(x+1) & 1 == 0`（连续整数乘积恒为偶数）
  - `CubicMod6`：`(x^3 - x) % 6 == 0`（三连续整数乘积恒被 6 整除）
  - `SquareMod3`：`(x^2 % 3) != 2`（平方模 3 只能是 0/1）
  - `SquareMod4`：`(x^2 % 4) <= 1`（平方模 4 只能是 0/1）
  - `FermatMod5`：`(x^5 - x) % 5 == 0`（费马小定理，p=5）
  - `FermatMod7`：`(x^7 - x) % 7 == 0`（费马小定理，p=7）
- 关键实现点：每个谓词先把输入缩小到模数域（`x % m`）再求值，避开 u64 wrapping
  乘法破坏数论恒等式的风险，所有表达式在 u64 下无溢出。
- `OpaqueConfig { family, salt }` + `config_from_seed(seed)`：族与盐从任意 seed 派生。
- `checkpoint(cfg, pc, step) -> bool`：由 (salt, pc, step) 派生输入 x 并求值，
  恒真；`checkpoint_value` 供审计复算。

### `src/defense.rs`

- 新增 `DefenseEngine::check_opaque(ok)`：不透明谓词失败（恒真断言被违反）时记录
  一次异常，与既有 `check_memory` 一样受 `poison_after` 门限约束，可驱动投毒。

### `src/vm.rs`

- `Program` 新增字段 `opaque: OpaqueConfig`：由 opcode map + CFF 表的 FNV-1a
  派生（`config_from_seed(fnv1a64(map || cff))`），因此随 (seed, session_key,
  depth) 变化，且同一三参数的 forward/inverse 程序共享同一配置。
- `run`：每步在指令执行前做 `opaque::checkpoint`，失败返回 false（理论不可达）。
- `run_defended`：每步 checkpoint 结果喂给 `engine.check_opaque`，干净环境永远
  不产生异常。

### `src/lib.rs`

- 注册 `pub mod opaque;`。
- WASM API（旧 API 全部不变）：
  - `lgv3_opaque_families() -> String`：全部谓词族名（审计）。
  - `lgv3_opaque_check(family_id, x) -> bool`：单点求值（恒真验证/演示）。
  - `lgv3_opaque_program_cfg(seed, session_key, depth) -> String`：
    `"family,salt_hex"`，与 `compile_program` 完全一致（静态分析对照）。

## 验证结果

- **Rust 测试**：**124/124 全绿**（111 旧 + 13 个 Sprint 5 新增）
  - 旧测试全部保持通过（含 Stage-1/2/3 字节级黄金向量），确认向后兼容
  - Sprint 5 新增：7 个谓词族对边界值+伪随机样本恒真、checkpoint 全 true、
    输入随 (pc,step) 变化、确定性、配置随 session/seed 变化、forward/inverse
    共享配置、roundtrip 稳定、黄金向量逐字节不变、与防御引擎组合无投毒、
    WASM API 返回格式
- **WASM 构建**：`cargo build --release --target wasm32-unknown-unknown` 通过
- **体积**（无 wasm-opt 环境，raw + gzip 口径）：

| 指标 | 值 |
| :--- | ---: |
| raw | 107.5 KB |
| gzip | 35.5 KB |

gzip 35.5KB，在 ≤40KB 预算内（较 Sprint 4 的 32.7KB 增加 2.8KB，来自 7 个谓词
族 + checkpoint 注入 + 3 个新 API）。

## 合规声明

- 不透明谓词仅提高静态/自动化分析的判定成本，属混淆范畴，不提供密码学安全
  保证（与 README 实验组件边界一致）。
- 实验分支，不合并 main，8/31 冻结期内不部署。

## 提交

- `（待提交）` Sprint 5: 独立算术不透明谓词 (恒真谓词族 + VM checkpoint + 防御联动)
- 推送到 `experimental/vwz-lg` 分支
