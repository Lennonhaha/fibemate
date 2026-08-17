# Sprint 2 实施记录: CFF + session diff 量化 (2026-08-17)

## 状态

- 实现完成，**81/81 测试全绿**（72 旧 + 9 个 Sprint 2 新增）。
- WASM 构建通过，gzip 体积 26.4KB（预算 40KB 内）。

## 实现内容

### 1. 控制流扁平化（`src/cff.rs` 新增 + `vm.rs` 改造）

- 新增 `CffMap`：seed 派生的 16 槽双射置换表（Fisher-Yates，域分离常量
  `0xC0FF_EE00_4E00_C0FF`）。
- `Program::new()` 构造时由 `cff.order` 的逆映射生成 `handlers[slot]`，
  `run()`/`run_defended()` 改为 `slot = cff.slot(op)` 查表分派。
- 效果：opcode → handler 的静态对应关系不再存在于二进制中，随
  (seed, session_key, depth) 变化；静态 CFG 恢复只能看到"查表 + 间接分派"。
- 数据面零开销：仅每次解码多一次数组查表。
- `prog_checksum` 纳入 `cff.order`，Sprint 1 内存完整性校验覆盖分派表。

### 2. session diff 量化（`lib.rs`）

- 新增 WASM API `lgv3_session_diff_ratio(data, seed, sk1, sk2, depth) -> f64`。
- 语义：两个不同 session_key 在完整管线下输出差异字节占比；同 session 返回 0。
- 新增 3 个量化测试：全样本 ratio > 0、同 session = 0 / 异 session > 0、
  empty input = 0。

## 体积复测（Sprint 2 后）

| 口径 | Sprint 1 | Sprint 2 | 增量 |
| :--- | :--- | :--- | :--- |
| raw | 87.8KB | 91.7KB | +3.9KB |
| wasm-opt -Oz | 66.2KB | 69.5KB | +3.3KB |
| gzip | 25.3KB | **26.4KB** | +1.1KB |

预算口径（gzip ≤40KB）达标，余量 13.6KB。

## 验证

- 既有 72 项全部通过（含 KAT 交叉验证、全部回归）。
- 新增 9 项：CFF 双射/seed 敏感/全覆盖（cff.rs 单测），CFF roundtrip 稳定、
  level0 字节一致、defense 叠加稳定（lib.rs），session diff 3 项。
- level0 旁路与 `run()` 字节级一致保持。

## 说明

- `cff.rs` 归属：Sprint 2 混淆引擎改造，纳入本次提交。
- 与 Stage-3 harden O(n²) 性能问题无交集（独立后续任务）。
