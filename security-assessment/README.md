# FIBEMATE PQC 平台第三方安全评估报告（汇总）

**评估对象**: experimental/vwz-lg 分支 (commit a0ef4e5) 的两项实验组件
1. **VWZ 签名方案** — rust/vwz-sign-wasm（IACR 2025/624 tensor trapdoor 实现）
2. **LookingGlass v2.2.3 混淆器** — www/crypto/lgv2（wreath-product 混淆）

**评估角色**: 独立第三方攻击者（VWZ 仅持公钥+消息；LG 仅持黑盒 oracle）
**评估日期**: 2026-08-16

---

## 总体结论

| 组件 | 结论 | 攻击复杂度 | 结果 |
|------|------|:---:|------|
| **VWZ 签名** | **完全攻破 (Total break)** | 多项式 O(k³) | 无需私钥伪造任意签名，官方 verify() 通过，36/36 批量成功 |
| **LG v2.2.3 混淆** | **完全可逆** | 6.6 万次 oracle | 100% 精度重构正/逆映射，反混淆零误差 |
| **LG v2.3 全部变体** | **完全可逆** | O(N·256) oracle | confuse_ex / confuse_full(KEM) / confuse_mix / pipeline 全部 100%，8/8 组合 |

两项组件均处于"工程自洽但安全未证"状态，实际攻击成本远低于官方预期：
- VWZ 声称 k=8 ~73 bits（本已低于 128 安全线），实测为**多项式时间**完全破坏，参数放大（k=16/32）无法修复。
- LG 官方预期"Frida/Angr 能攻破"，实测**纯黑盒查表重构**即可，无需任何动态/符号分析工具。
- LG v2.3 的 Stage-1 premix、Stage-2 VM 管道、ML-KEM binding 三层"增强"均未引入字节间值扩散，黑盒攻击复杂度不变；项目方自评估报告"上下文相关置换、逐字节不可行"结论被实证推翻。

---

## 1. VWZ 签名 — 完全攻破

**漏洞根因**: 公钥张量每个切片 ψ[i1] 必为 rank-1 矩阵（Vandermonde 结构经可逆基底变换保持秩），验签方程 `t[i1]=(u[i1]·w2)(v[i1]·w3)` 退化为两个线性因子乘积。

**攻击步骤**（详见 `vwz-attack-assessment.md`）:
1. 对每个切片做 rank-1 分解 ψ[i1]=u[i1]⊗v[i1]
2. 用 k 个零位置约束解齐次系统 u[i1]·w2=0 → 非零 w2
3. 用 k+1 个非零位置解仿射系统 v[i1]·w3=t/(u·w2) → w3

**实证**: k=2,4,8,16 × 3 密钥 × 3 消息 = 36/36 伪造成功；伪造签名序列化后通过官方预编译 WASM `verify()`（`e2e_verify.js`）。

## 2. LG v2.2.3 混淆 — 完全可逆

**漏洞根因**: 混淆等价于逐字节独立 S-box（256 项双射表）+ 输出位置置换，无字节间扩散。

**攻击步骤**（详见 `lg-v2-attack-assessment.md`）:
1. 单字节扰动定位输出位置置换 σ
2. 逐字节扫描 256 值重建 S-box 表 S_j
3. 由 (σ, S_j) 构造正/逆映射

**实证**: 4 个 seed 下正/逆模型 100% 精度；N=64 与 N=256 均成立；任意长度 roundtrip 官方自洽。

## 2.1 LG v2.3 变体 — 完全可逆（深入评估）

**范围**: experimental/vwz-lg 分支 lg-v2.3 的 `confuse_ex` / `confuse_full`(KEM 绑定) / `confuse_mix`(premix 全字节) / `pipeline_obfuscate`(VM 层)。

**结构判定**（源码级，详见 `lg-v23-variants-assessment.md`）: 全部变体由「逐字节双射（S-box/XOR/Add/Mix/keystream）+ 位置置换（Shuffle/Swap/Rot/Rev）」组成，**无一条指令引入跨字节值依赖**。VM 的 8 条指令、premix 的 256 字节 XOR keystream、KEM binding 的周期-32 XOR 流，均不产生扩散。

**实证**: 用 Python 精确复刻 Rust 语义作 oracle，对 4 种变体 × 多组 seed/session/depth × N=16/64/128 共 **8/8 组合**，黑盒攻击（扰动定位 σ + 逐字节扫描）100% 命中（200 随机输入零误差）。

**与官方评估分歧**: 项目方自评估报告声称"上下文相关置换，逐字节不可行"（5,913 冲突）——源于整体拟合方法错误（未先定位 σ）。正确的先定位后建表方法零冲突。

---

## 3. 复现材料

所有攻击脚本与报告位于 `security-assessment/`：

```
security-assessment/
├── vwz-attack-assessment.md      VWZ 攻击报告
├── lg-v2-attack-assessment.md    LG v2.2.3 攻击报告
├── lg-v23-variants-assessment.md LG v2.3 变体攻击报告（深入）
└── attack/
    ├── attack_vwz.py             VWZ 核心伪造（rank-1 分解攻击）
    ├── attack_bulk.py            批量伪造（36 组）
    ├── check_rank1.py            公钥切片 rank-1 检测
    ├── export_bulk.js            数据集生成（预编译 WASM）
    ├── e2e_verify.js             伪造签名送官方 verify()
    ├── lg_recover.js             LG 核心恢复（σ + S-box 重建）
    ├── lg_blackbox.js            LG 初测（非线性/确定性）
    ├── lg_diffusion.js           LG 扩散分析
    ├── lg_lengths.js             LG 长度无关性/查询预算
    ├── lg_len64.js               LG N=64 恢复验证
    ├── lgv23_oracle.py           LG v2.3 Rust 语义的 Python 复刻（6 API）
    └── lgv23_attack.py           LG v2.3 变体黑盒攻击实证（8/8 组合）
```

## 4. 建议

- VWZ: 在验签方程获得严谨安全性归约（对抗代数/插值攻击）前，**禁止用于任何签名用途**。
- LG: 明确其仅为"逐字节查表混淆"，无密码学强度；若用于保护敏感逻辑，攻击者可纯黑盒 100% 还原。
- LG v2.3 变体: 增强设计须引入真正的可逆线性扩散（矩阵乘/Feistel 结构），否则 premix/VM/KEM 绑定均徒增复杂度而不增安全性；KEM 绑定改用认证加密（AEAD）并禁止 keystream 周期复用。
- 项目方自评估报告（lookingglass-security-assessment.md §3.2）中"上下文相关置换、逐字节不可行"结论应修正。
- 两项组件均建议维持实验隔离（不并入 main / 不生产部署），与官方 8/31 冻结期决策一致。
