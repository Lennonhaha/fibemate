# LG v2.3 变体攻击评估（深入）

**版本**: LG v2.3.0-alpha-stage2（experimental/vwz-lg 分支，commit a0ef4e5）
**评估日期**: 2026-08-16
**评估方式**: 源码级白盒分析（`experimental/vwz-lg/lg-v2.3/src/` 全部 8 个模块）+ 黑盒攻击实证（Python 精确复刻 Rust 语义作 oracle）

---

## 1. 结论（TL;DR）

LG v2.3 引入的**全部**变体（`lgv2_confuse_ex` / `lgv2_confuse_full` / `lgv2_bind_kem` / `lgv3_confuse_mix` / `lgv3_pipeline_obfuscate`）**均未引入字节间值扩散**，全部等价于「逐字节双射 + 位置置换」的组合。此前对 v2.2.3 的黑盒攻击（扰动定位 σ + 逐字节扫描）对**每一个变体**直接适用，8/8 组合实证 100% 命中。

**一句话**: v2.3 的 Stage-1（premix 全字节覆盖）、Stage-2（VM 管道）、ML-KEM binding 三层"增强"均无法抵抗黑盒恢复，混淆在数学上等价于 v2.2.3 已攻破的结构。

---

## 2. 变体清单与结构分析（源码级）

### 2.1 `lgv2_confuse_ex(data, seed, session_key, depth)` — lib.rs:77

```
combined_seed = seed.wrapping_add(session_key)
confuse_chunk_depth(data, combined_seed, LayerSeeds(combined_seed), depth)
```

**结构**: 与 v2.2.3 完全相同的 7 层 wreath，仅把 seed 换成 `seed+session_key`。加法是仿射组合——`combined_seed` 仍是单个 64-bit 值，攻击复杂度不变。

### 2.2 `lgv2_bind_kem(data, kem_ss)` — lib.rs:170 / bind.rs

```
hash = Keccak256("LGv2-KEM-BIND-v1" || kem_ss)   # 32 字节
result[i] = data[i] ^ hash[i % 32]               # XOR keystream，周期 32
```

**结构**: 逐字节 XOR keystream。**三个弱点**:
1. **keystream 周期 32 字节**：长数据重复使用同一 keystream，已知明文即恢复全流
2. **无认证**：纯 XOR，无 MAC/tag，篡改检测为零
3. **不阻碍黑盒**：XOR 是逐字节自逆，单字节扰动性质保持不变

### 2.3 `lgv2_confuse_full(data, seed, session_key, kem_ss, depth)` — lib.rs:188

```
combined_seed = seed + session_key
confuse_chunk_depth(buf, combined_seed, ...)   # wreath 混淆
result = CryptoBinding(kem_ss).bind(buf)       # XOR keystream 绑定
```

**结构**: wreath + XOR 绑定串联。两层均为逐字节可逆，黑盒攻击完全穿透（见 §3）。

### 2.4 `lgv3_confuse_mix(data, seed, session_key, depth)` — lib.rs:107 / premix.rs

```
premix(data, key=seed+session_key)   # Layer 0: XOR keystream 覆盖全部字节
confuse_chunk_depth(data, seed, ...) # Layer 1-7: wreath
postmix(data, key)                   # Layer 8: XOR keystream（自逆）
```

**结构**: 声称"解决活跃维度问题"（wreath 仅覆盖 48/256，premix 覆盖 256/256）。但 premix 只是逐字节 XOR keystream——**它覆盖所有字节，却不引入任何跨字节扩散**。声称的"增强"只是给每个字节 XOR 一个随机数，攻击复杂度不变。

### 2.5 `lgv3_pipeline_obfuscate(data, seed, session_key, depth)` — lib.rs:137 / pipeline.rs / vm.rs

```
full_mix_forward_depth(data, seed, session_key, depth)  # premix + wreath
VM(compile_program(seed, session_key, depth))           # 8 条指令
```

编译程序指令序列（pipeline.rs:56-65）：`Shuffle → Xor → Sbox → Rot → Add → Swap → Mix → Rev`。

逐指令结构判定（vm.rs:169-306）：

| 指令 | 操作 | 类型 |
|------|------|------|
| OpShuffle | Fisher-Yates 位置置换 | 位置置换 |
| OpXor | XOR keystream | 逐字节双射 |
| OpSbox | AES S-box | 逐字节双射 |
| OpRot | 整体旋转 | 位置置换 |
| OpAdd | 逐字节 mod-256 加常数 | 逐字节双射 |
| OpSwap | 交换两位置 | 位置置换 |
| OpMix | XOR keystream + S-box | 逐字节双射 |
| OpRev | 整体反转 | 位置置换 |

**判定**: 8 条指令全部是「逐字节双射」或「位置置换」，**无一条引入跨字节值依赖**。OpcodeMap（opcode.rs）只影响字节码的表示（16 值随机双射），不改变执行语义。声称的"an analyst cannot statically learn the bytecode layout"（pipeline.rs:13）只对抗静态分析，对黑盒恢复无效。

---

## 3. 黑盒攻击实证

**方法**（与 `security-assessment/attack/lg_recover.js` 完全相同，已对真实 WASM 验证过）:
1. 基准：全零输入 → 输出 base
2. 单字节扰动：翻转输入字节 i → 恰好 1 个输出字节变化 → 定位 σ(i)
3. 逐字节扫描：对每个输入位置 i 穷举 256 个值 → 重建双射 F_i
4. 随机输入验证：模型预测 vs oracle 输出

**结果**（`lgv23_attack.py`，Python oracle 精确复刻 Rust 语义，roundtrip 全 PASS）:

| 变体 | 参数 | N | σ 正确 | 双射正确 | 200 随机输入 | oracle 调用 |
|------|------|---|:---:|:---:|:---:|:---:|
| confuse_ex | seed=0x1234 sk=0xDEAD d=7 | 64 | ✅ | ✅ | 100% | 16,649 |
| confuse_mix | 同上 | 64 | ✅ | ✅ | 100% | 16,649 |
| confuse_full | 同上 + kem_ss | 64 | ✅ | ✅ | 100% | 16,649 |
| pipeline | 同上 | 64 | ✅ | ✅ | 100% | 16,649 |
| pipeline | seed=0xDEADBEEF sk=0xBEEF d=3 | 64 | ✅ | ✅ | 100% | 16,649 |
| pipeline | seed=0x1 sk=0xCAFE d=1 | 64 | ✅ | ✅ | 100% | 16,649 |
| pipeline | seed=0x1234 sk=0xBEEF d=5 | 16 | ✅ | ✅ | 100% | 4,313 |
| pipeline | 同上 | 128 | ✅ | ✅ | 100% | 33,097 |

**8/8 组合全部 100% 命中**。seed/session_key/depth 任意变化不改变攻击复杂度（O(N·256) oracle 调用）。N 从 16 到 128 均成立（此前对真实 WASM 已覆盖 16~512）。

---

## 4. 与项目方自身评估结论的分歧

项目方 `experimental/vwz-lg/docs/lookingglass-security-assessment.md` §3.2 声称：

> "逐字节拟合置换映射表 → **5,913 冲突** — 上下文相关置换，字节级逆映射**不可行**"

**这是错误结论**。原因在于项目方攻击脚本（`attack/fit-mapping.py`）采用了**整体拟合**策略：从 10,000+ 随机输入输出对拟合**单张**映射表。但真实结构是「位置置换 σ + 每个位置独立双射 F_i」——整体拟合试图用一个统一的字节→字节函数解释所有位置，必然产生大量伪冲突。

**正确方法**（本次攻击）:
1. **先**用单字节扰动确定 σ（扰动 i 位 → 唯一输出位变），这一步项目方未做
2. **再**按 σ 归位后的每个位置独立建 256 项表，零冲突

项目方因方法论错误，得出了"上下文相关置换"的错误判断，误认为逐字节攻击不可行。实际上 100% 可恢复。

---

## 5. VWZ ML-KEM binding 变体核查

**结论**: VWZ 签名方案**不存在**独立的 ML-KEM binding 变体。核查范围：
- `rust/vwz-sign-wasm/src/` 全部 10 个模块：仅 `field.rs` 注明使用 ML-KEM-768 模数 q=3329（素数域选择），无 KEM 集成
- `rust/vwz-sign-wasm/src/vwz_rank1.rs`：是 **rank-1 公钥压缩**（A/B 因子分解），`to_full()` 用 `ψ[i1][i2][i3] = A[i1][i2]·B[i1][i3]` 重构。**该文件头注释直接承认每片 rank-1 是设计事实**——正是 VWZ 攻击评估（`vwz-attack-assessment.md`）利用的结构。压缩不修复秩退化，攻击依旧成立
- ML-KEM binding 属 LG 侧（`lgv2_bind_kem`），已在本报告 §2.2/§3 覆盖

---

## 6. 根因总结

1. **无扩散架构**：所有变体的原始构件集 = {逐字节双射（S-box/XOR/Add/Mix/keystream）, 位置置换（Shuffle/Swap/Rot/Rev）}。该集合在组合下闭包仍为「逐字节双射 + 位置置换」，永不产生雪崩效应
2. **增强是假象**：premix 覆盖 256 字节 = 每字节 XOR 随机数；VM 8 指令 = 上述构件重组；KEM binding = 周期 32 的 XOR 流。三者都不引入跨字节值依赖
3. **安全性只来自 seed 保密**：一旦 seed/session 泄露（或可黑盒恢复），全部混淆可逆。黑盒攻击无需任何 seed 知识即可完整还原映射

## 7. 修复建议

1. **引入真正的混合层**：在逐字节层之间插入可逆线性扩散（如矩阵乘 mod 256、Feistel/MISTY 结构），使单字节扰动波及 ≥2 输出字节。否则任何深度/变体都是 O(N·256) 可恢复
2. **禁用周期 XOR 绑定**：KEM binding 改为认证加密（AEAD，如 ChaCha20-Poly1305），keystream 不得周期复用
3. **弃用整体拟合误判**：将项目方评估文档 §3.2 结论修正——"上下文相关置换、逐字节不可行"已被实证推翻
4. **接受定位**：LG 是逆向工程开销层，不是密码原语。变体增强应明确定位为"提高静态分析成本"，而非抗黑盒/抗密码分析

## 8. 证据文件

- `attack/lgv23_oracle.py` — LG v2.3 全部 6 个 API 的 Python 精确复刻（roundtrip 自检 PASS）
- `attack/lgv23_attack.py` — 黑盒攻击实证（8/8 组合 100%，约 2 分钟跑完）
- 源码：`experimental/vwz-lg/lg-v2.3/src/{lib,premix,bind,wreath,vm,pipeline,opcode,sbox}.rs`
