# SM2 WASM 内存泄漏修复完成 — Array<u64> + incremental runtime

## 时间
2026-08-13（D-18）

## 问题
SM2 WASM 重写中，`StaticArray<T>`（非托管类型）在 stub/minimal runtime 下永久泄漏：
- stub runtime：`__new` bump allocator 永不回收
- minimal runtime：GC 分配器但不追踪 StaticArray 引用

一次 mulG 内部做数千次 `new StaticArray`，导致 WASM 线性内存从 16MB 暴涨到 4096MB（4GB）后 `unreachable` 崩溃（~700-938 次 mulGX）。

## 决定性实验（class-leak-test）

| Runtime | makeArray 100万次 | makeFoo(class含Array) 100万次 |
|---------|------------------|------------------------------|
| minimal | 256MB（泄漏） | 1024MB（严重泄漏） |
| **incremental** | **16MB（不泄漏）** | **16MB（不泄漏）** |

**关键结论**：minimal runtime 的 GC **根本不回收 Array**（之前"Array 走 GC 解决泄漏"的判断是错的，那是在 stub 下测的误导性数据）。只有 **incremental runtime** 有完整 GC，能正确回收 Array 和含 Array 字段的 class。

## 修复方案
1. **4 个文件全部 `StaticArray<T>` → `Array<T>`**（field/curve/sm2/sm3，共 94 处）
2. **runtime 从 stub/minimal 改为 incremental**（完整 GC）
3. 重建过程中发现并修复了 PowerShell `-replace` + `Set-Content -NoNewline` 破坏 UTF-8 换行符的问题（改用 Node.js 直接重写文件，保留干净 UTF-8）

## 验证结果（incremental runtime）

| 验证项 | 结果 |
|--------|------|
| field 域运算（montMulP/feAddP/feSubP，BigInt oracle） | 3000/3000 ✅ |
| curve 点运算（mulGX/mulGY 1..10 vs BigInt oracle） | 10/10 ✅ |
| SM3 标准向量（abc + 空串） | 2/2 ✅ |
| SM2 KAT 验签 | 100/100 ✅ |
| SM2 KAT 解密 | 100/100 ✅ |
| 内存泄漏（mulGX 1500 次） | WASM mem 稳定 16MB ✅ |

## 性能代价（诚实评估，2026-08-13 14:46 实测）
- **incremental runtime 实测 mulGX = 60.78 ms/op**（50 次均值）
- 性能梯队：JS wNAF（生产）9.4ms < JS BigInt 22ms < WASM minimal 27.7ms < WASM incremental 60.8ms
- WASM incremental 比 JS wNAF 慢 ~6.5×，比 JS BigInt 慢 ~2.8×
- **10,000 组 KAT（每组约 8 次点乘）≈ 81 分钟**（incremental GC 下不可行）
- 恒定时间 Montgomery Ladder 本就更慢（vs JS wNAF 的密钥依赖查表），增量 GC 进一步放大差距
- **关键事实：JS v1.3 本身就是恒定时间 Montgomery Ladder 实现**，WASM 版的价值是「第二实现」用于交叉验证 + 类型/内存安全，而非性能

## 性能真相（需用户决策）
"WASM 比 JS 快 2-3×" 目标无法达成，根因是算法选择：
- WASM 用 Montgomery Ladder（恒定时间，256 轮 double+add）
- JS 用 wNAF 窗口表（预计算 16 点，~64 次点加，有密钥依赖查表）
- 这是"恒定时间安全 vs 速度"的经典权衡

如需性能提升，方向是 **Comb 窗口法**（恒定时间 + 预计算表），而非简单 WASM 化。

## 当前产物
- wasm-sm2/assembly/{field,curve,sm3,sm2}.ts — 重建，Array<u64>，干净 UTF-8
- build/*.wasm — incremental runtime 编译产物
- 测试：test-field-verify.mjs / test-curve-verify.mjs / test-sm3-verify.mjs / test-leak-final.mjs / test-sm2-kat.js / test-sm2-decrypt.js

## 待办
1. asconfig.json 需固定 `--runtime incremental`（避免后续编译用错 runtime）
2. 性能优化方向决策（Comb 窗口法 vs 接受恒定时间慢速）
3. 全部未 commit 未 push，等「推」
4. 交叉验证（JS↔WASM 千次）、确定性、序列化、TVLA 侧信道测试尚未做（属验证合同后续项）
