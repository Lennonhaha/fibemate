# LG v2.3 性能基线核查与验收口径澄清 (2026-08-17)

## 1. 结论摘要

完整 v2.3 管线（含 Stage-3 harden）的实际吞吐远低于设计文档声称的
Stage-2 基准（14-17 MB/s）。瓶颈不在 Sprint 1 动态防御引擎，而在 v2.3
既有 Stage-3 hardening 的 O(n²) full-block diffuse。

**验收口径矛盾**：Sprint 1 验收标准（吞吐 ≥10 MB/s 或 Stage-2 基线的 70%）
用完整管线无法达成，因为该基准对应的是"premix + VM"的 Stage-2 定义，
不包含 Stage-3 harden。此项记录为独立后续优化任务，与 Sprint 1 防御逻辑
的正确性验收解耦。

## 2. 测量数据

测量环境：release 构建，8KB payload，逐阶段计时。

| 阶段 | 耗时 | 说明 |
| :--- | :--- | :--- |
| premix + Wreath(depth) | ~290 µs | Stage-1 |
| harden（Stage-3，2 rounds） | ~1.37 s | **瓶颈**：O(n²) diffuse |
| compile_program | ~4.6 µs | Stage-2 程序编译 |
| vm.run（8 指令） | ~69 µs | Stage-2 VM |
| 完整单轮（level0 旁路） | ~2.65 s ≈ 3 KB/s | 完整管线实际吞吐 |

对照：

| 管线口径 | 实测吞吐 | 是否匹配文档基准 |
| :--- | :--- | :--- |
| Stage-2（premix + VM，不含 harden） | ~22 MB/s | ✅ 符合 14-17 MB/s |
| 完整 v2.3（含 Stage-3 harden） | ~3 KB/s | ❌ 差 4 个数量级 |

## 3. 根因定位

- `diffuse.rs` 的 `diffuse_forward` / `diffuse_inverse` 是 O(n²) 实现：
  行内重播种 XorShift64 + GF(256) 乘法，8KB 数据约 3300 万次迭代。
- `harden_forward` / `harden_inverse` 每轮调用一次 diffuse（HARDEN_ROUNDS=2）。
- 这是 Stage-3 hardening 的既有实现（Sprint 1 之前即存在），Sprint 1
  防御引擎未触碰该路径。

## 4. Sprint 1 防御引擎开销

- `run_defended` 在 8 指令程序上采样校验（sample_ratio=20），overhead 可忽略。
- level0 旁路路径与 `run()` 字节级一致（回归测试覆盖）。
- 结论：性能问题与动态防御改动无关。

## 5. 建议的行动项（独立任务）

1. **验收口径**：将吞吐验收基准显式定义为 Stage-2 管线（premix+VM，
   不含 Stage-3 harden），或单独核算 harden 的预算。
2. **diffuse 优化**（后续优化任务）：将 O(n²) diffuse 替换为 O(n log n)
   或 O(n) 全块扩散（如基于 GF(2^n) 的 Toeplitz 矩阵、Walsh-Hadamard
   类变换），目标将 harden 阶段单轮耗时降到毫秒级。
3. 优化后复测完整管线吞吐，更新本文档第 2 节数据。
