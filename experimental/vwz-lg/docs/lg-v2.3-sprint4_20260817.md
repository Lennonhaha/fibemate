# LG v2.3 Sprint 4 实施记录（2026-08-17）

## 范围

Sprint 4 = 五短板补全 #1「防自动化攻击」：**dynamic_path 动态路径**（Wreath 层内双路径）。

基于 research/lgv2/rust/dynamic_path.rs 的 Standard/Substitute 双路径原型移植到
v2.3 模块化架构，同时补齐 Sprint 4 边界中「不透明谓词」作为本 Sprint 的补充项
（见下文"不透明谓词定位"）。

与前三个 Sprint 一致，本 Sprint 是对 v2.3 既有设计文档规划的执行，纯增量。

## 目标

在 Wreath 核心的每一层，用 `session_key`（不依赖数据）在两条路径间选择：

```
Standard:   XOR(off1) -> 置换 -> SBOX(XOR(off2))     （原有真实变换）
Substitute: SBOX -> INV_SBOX -> XOR(k) -> XOR(k)      （恒等层，含中间 S 盒查找）
```

作用：
1. **会话路径差异化**：同一 `seed` 下不同 `session_key` 在部分层走不同路径，
   session 独立性高于固定管线（Sprint 2 的 session diff 量化得到进一步加强）。
2. **路径选择不可静态枚举**：哪些层是"空转"、哪些是"真实变换"，由 session 决定，
   自动化分析工具无法从单一二进制或单一会话推断固定结构。
3. **前向/逆向天然一致**：路径选择不依赖数据，`confuse` 与 `deconfuse` 对同一
   session_key 逐层选择相同；Substitute 层自逆，roundtrip 对任意 session 精确。

## 集成方式（Wreath 层内双路径）

按用户确认的方案，在 `wreath.rs` 执行循环内做路径分派，不新增独立 Stage、不改
pipeline 顺序、不碰 premix/harden/seal 结构。

### `src/wreath.rs`

- **抽出 per-layer 函数**：`confuse_layer_std` / `deconfuse_layer_std`，与 v2.2.2
  单层语义逐字节一致（perm 由 `layer_seed(seed, li)` 派生，off1/off2 由 seeds
  派生）。原 `confuse_chunk_depth` / `deconfuse_chunk_depth` 改为循环调用它们，
  行为不变（黄金向量回归测试验证）。
- **新增**：
  - `dynamic_path_mode(session_key, li) -> bool`：由 session_key 派生路径选择
    （true = Substitute），与 research 原型语义一致（XorShift64 推进 li+1 次取
    1 bit），不依赖数据。
  - `substitute_layer`：`SBOX -> INV_SBOX -> XOR(k) -> XOR(k)` 恒等层；keys 由
    `layer_seed(seed, li + NUM_LAYERS)` 派生（与 v2.3 LayerSeeds 风格一致）。
  - `confuse_chunk_depth_dynamic` / `deconfuse_chunk_depth_dynamic`：逐层按
    `dynamic_path_mode` 选择 Standard 或 Substitute；沿用现有 pre-alloc 复用
    perm/tmp/off1/off2/keys，无逐层分配开销。
  - `confuse_full_dynamic` / `deconfuse_full_dynamic`：全 7 层变体。
- 旧函数字节级保持（黄金向量依赖 `confuse_chunk_depth` 精确行为），新函数只做叠加。

### `src/premix.rs`

- 新增 `full_mix_forward_depth_dynamic` / `full_mix_inverse_depth_dynamic`：
  premix -> Wreath(dynamic) -> postmix，仅 Wreath 段换成 dynamic 版本。

### `src/pipeline.rs`

- 抽出 `obfuscate_impl` / `deobfuscate_impl`（带 `dynamic: bool`），新增
  `obfuscate_dynamic` / `deobfuscate_dynamic`。非 dynamic 路径逻辑不变。

### `src/lib.rs`

- WASM API（旧 API 全部不变）：
  - `lgv3_pipeline_obfuscate_dynamic(data, seed, session_key, depth)`
  - `lgv3_pipeline_deobfuscate_dynamic(data, seed, session_key, depth)`
  - `lgv3_dynamic_path_profile(session_key) -> String`（每层 'S'/'T'，审计/测试用）

## 不透明谓词（本 Sprint 补充项）定位

Sprint 4 边界确认：dynamic_path 优先（五短板 #1），不透明谓词作为同一 Sprint 的
补充项。本轮落地中，**Substitute 恒等层即一种"结构不透明"手段**——层内嵌
SBOX/INV_SBOX 查找与双 XOR，静态分析无法直接判定该层是否改变数据（恒等但含
真实查表），配合 session 驱动的层选择构成路径级混淆。独立的算术不透明谓词
（如 `(x*x+x)%2` 恒真判定）留给 Sprint 5 作为专项，避免本 Sprint 语义膨胀。

## 验证结果

- **Rust 测试**：**111/111 全绿**（102 旧 + 9 个 Sprint 4 新增）
  - 旧测试全部保持通过（含 Stage-1/2/3 字节级黄金向量），确认向后兼容
  - Sprint 4 新增：dynamic roundtrip（多 size/seed/sk/depth）、WASM API、
    session diff 全样本 > 0、确定性、错误 key 失败、path profile 双路径覆盖、
    256B 全 0 全字节发散、固定路径黄金向量不变、dynamic 与固定输出差异
- **WASM 构建**：`cargo build --release --target wasm32-unknown-unknown` 通过
- **体积**（无 wasm-opt 环境，raw + gzip 口径）：

| 指标 | 值 |
| :--- | ---: |
| raw | 100.1 KB |
| gzip | 32.7 KB |

gzip 32.7KB，仍在 ≤40KB 预算内（raw 较 Sprint 3 的 95.9KB 略增，源于 dynamic
路径分派 + Substitute 层 + 3 个新 API）。

## 合规声明

- dynamic_path 仅提高静态/自动化分析的路径恢复成本，属混淆范畴，不提供
  密码学安全保证（与 README 实验组件边界一致）
- 实验分支，不合并 main，8/31 冻结期内不部署

## 提交

- `（待提交）` Sprint 4: dynamic_path (Wreath 层内双路径, Standard/Substitute) + 测试
- 推送到 `experimental/vwz-lg` 分支
