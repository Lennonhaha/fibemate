# SM2 WASM 重写 — 内存泄漏根因与性能真相

## 时间
2026-08-13（D-18）

## 核心发现：内存泄漏（生产 blocker）

### 现象
- stub runtime：固定 k 反复调 mulGX，~700 次后 WASM `unreachable` 崩溃
- WASM 内存从 16MB 暴涨到 4096MB（4GB）后崩溃

### 根因
AssemblyScript 的 `StaticArray<T>` 是**非托管（unmanaged）类型**，不参与 GC 引用计数：
- stub runtime：`__new` 是 bump allocator，永不回收
- minimal/incremental runtime：GC 分配器，但 StaticArray 无引用追踪，GC 也回收不了

而一次 mulG 内部做 **数千次 `new StaticArray`**（montMul 每次分配 t[9]，jDouble/jAdd 各分配数十个中间结果，256 轮 Ladder 累积数千次），全部永久泄漏。

### 决定性实验（alloc-test）
| 方案 | 100万次分配后内存 | 结论 |
|------|------|------|
| `new StaticArray<u64>(8)` | 128MB → 持续涨到 4GB | ❌ 泄漏 |
| `new Array<u64>(8)` | 稳定 16MB | ✅ GC 正常回收 |

### 性能对比（montMul）
| 方案 | 耗时 | 内存 |
|------|------|------|
| StaticArray 版 | 1.94 µs/op | 泄漏 |
| Array 版 | 3.15 µs/op | 无泄漏 |

## 性能真相（诚实评估）

### 实测基准
| 实现 | mulG 耗时 | 恒定时间 |
|------|------|------|
| WASM Montgomery Ladder（stub） | 25.3 ms | ✅ |
| WASM Montgomery Ladder（minimal） | 27.7 ms | ✅ |
| WASM Montgomery Ladder（incremental） | 61.1 ms | ✅ |
| JS wNAF 窗口表（sm2-bigint-ec.js） | 9.4 ms | ❌ |
| JS BigInt 简单 double-and-add | 22.0 ms | ❌ |

### 关键结论
**"WASM 比 JS 快 2-3×" 的目标无法达成**，根本原因不是 WASM 技术问题，而是**算法选择**：
- WASM 用 Montgomery Ladder（恒定时间，256 轮 double+add）→ 安全但慢
- JS 用 wNAF 窗口表（预计算 16 点，~64 次点加法）→ 快但有密钥依赖查表（侧信道不安全）

这是"恒定时间安全 vs 速度"的经典权衡。WASM 版的价值在于**恒定时间安全实现**（TVLA 可过），而非性能。

## 修复方案（内存泄漏）

### 方案 A：全部换 Array<u64>（推荐）
- 94 处 `StaticArray` 替换为 `Array`（函数内临时变量 + 返回值）
- 全局常量（P_LIMBS/N_LIMBS 等）保留 StaticArray（只分配一次不泄漏）
- 代价：性能再降 ~1.6×（montMul 3.15µs）
- 优点：最简洁可靠，GC 自动回收

### 方案 B：热路径手动 free
- 在 montMul 等函数显式 `heap.free`
- 风险：double-free / use-after-free 难排查
- 不推荐

### 方案 C：全局缓冲区池
- 预分配一块内存复用，in-place 运算
- 优点：无泄漏 + 不降性能
- 缺点：重写量大，WASM 单线程下才安全

## 决策点（需用户确认）

1. **内存泄漏必须修**（生产代码不能 ~700 次调用崩溃）
2. 修复后性能真相：WASM 恒定时间实现慢于 JS wNAF ~2.65×（修复泄漏后 ~4×）
3. 是否需要继续追求"2-3× 性能提升"？若需要，方向是 Comb 窗口法（恒定时间 + 预计算表，可提速 2-4×），而非简单 WASM 化

## 已完成验证（正确性 100%）
- SM3 标准向量全过
- SM2 签名/验签 KAT 100/100
- SM2 加解密 KAT 100/100
- 域运算/曲线运算 10 万组 + 边界全过
- JS↔WASM 交叉验证 mulG 100/100
