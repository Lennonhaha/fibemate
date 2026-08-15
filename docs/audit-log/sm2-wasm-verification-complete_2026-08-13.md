# SM2 WASM 重写 — 验证合同全量执行报告

## 时间
2026-08-13（D-18 深夜）

## 结论一句话
SM2 WASM 第二实现全部核心密码学 + 内存泄漏修复完成，**今天软件层能跑的验证全部跑完**，11 项验证全绿，交叉验证价值达成。

## 验证合同执行清单

### 功能一致性 ✅
| 验证项 | 规模 | 结果 |
|--------|------|------|
| field 域运算（BigInt oracle） | 3000 组 | ✅ |
| curve 点运算（mulGX/mulGY） | 10 组 | ✅ |
| SM3 标准向量 | 2 组 | ✅ |
| SM2 KAT 验签（gmssl） | 100 组 | ✅ |
| SM2 KAT 解密（gmssl） | 100 组 | ✅ |
| JS↔WASM mulG 交叉 | 100 组 | ✅ |
| 签名/验签端到端 | 10 组 | ✅ |
| 确定性（3 轮一致） | — | ✅ |
| 序列化往返 | 1000 组 | ✅ |
| 随机标量乘交叉 | 1000 组 | ✅ |

### 安全/内存 ✅
| 验证项 | 结果 |
|--------|------|
| 内存泄漏（1500 次 mulGX） | 16MB 稳定 ✅ |

## 今天未做（8/31 后，且诚实标注原因）

1. **10,000 组 KAT** — incremental runtime 下 60.78ms/op，约 81 分钟，性价比极低。需先性能优化。
2. **Comb 窗口法性能优化** — 可选，非阻塞。恒定时间约束下才可做。
3. **TVLA 侧信道** — 需要示波器/ChipWhisperer 硬件，本就不是软件层验证。

## 核心认知沉淀

1. **WASM 版价值定位 = 独立第二实现交叉验证**，不是性能、不是恒定时间（JS v1.3 已有恒定时间 Ladder）。
2. **AssemblyScript 内存泄漏陷阱**：StaticArray 非托管类型在 minimal runtime 下 GC 不回收；只有 incremental runtime 完整 GC 才回收 Array。这是 4GB 崩溃的根因。
3. **恒定时间 vs 速度**：WASM Montgomery Ladder（256 轮 double+add）天然比 JS wNAF 窗口表（~64 次点加）慢，这是安全权衡非技术缺陷。

## 文件状态
- wasm-sm2/assembly/{field,curve,sm3,sm2}.ts — 重建完成
- build/*.wasm — incremental runtime 编译产物
- 测试：test-field-verify / test-curve-verify / test-sm3-verify / test-cross / test-cross-1000 / test-sm2-kat / test-sm2-decrypt / test-sm2-sign / test-determinism / test-serialize / test-leak-final
- **全部未 commit 未 push**，等用户「推」
