# FIBEMATE 技术验证证据地图

> **最后更新**：2026-07-17（v5 · 全局 TSR 76 份 · Path A/C-2 Active · 全站校准）  
> **定位**：本文档汇总 FIBEMATE 项目在硬件加速、软件优化、安全性三个维度的可验证证据，供开源社区、安全研究者及潜在用户查阅。  
> **开源计划**：FIBEMATE 核心协议代码计划于 **2026.08.31** 开源。当前 repo 为 private，本文档所列验证结果均可在 [fibemate.net](https://fibemate.net) 的公开报告页面复现验证。

---

## 总览

| 维度 | 验证项 | 状态 | 证据页 |
|------|--------|------|--------|
| 🔐 后量子 | ML-KEM-768 KAT 一致性 | 10,000/10,000 ✅ | [KAT 报告](https://fibemate.net/kat-10000.html) |
| 🔐 后量子 | ML-KEM-768 TVLA 侧信道 | N=10,000 通过 ✅ | [安全页面](https://fibemate.net/security.html) |
| ⚡ 硬件 | FPGA NTT/INTT Round-trip | 256/256 全匹配 ✅ | [FPGA 报告](https://fibemate.net/docs/fpga-report.html) |
| ⚡ 硬件 | 时序收敛 (WNS) | +0.204ns ✅ | [FPGA 报告](https://fibemate.net/docs/fpga-report.html) |
| 🇨🇳 国密 | SM2 全栈性能 | 2.1×–8.4× 加速 | [SM2 优化报告](https://fibemate.net/docs/sm2-optimization.html) |
| 🇨🇳 国密 | SM2 TVLA 侧信道 (v1.3, 1-4阶) | N=5,000 20/20 ✅ | [TVLA 分析](https://fibemate.net/docs/sm2-tvla-analysis.html) |
| 🇨🇳 国密 | sm-crypto 互操作 | 100% 兼容 ✅ | [SM2 优化报告](https://fibemate.net/docs/sm2-optimization.html) |
| 🛡️ 完整性 | RFC 3161 时间戳存证 | 9 文件 (联合信任 + DigiCert) | `/docs/tsa/` |

---

## 一、后量子密码学 · ML-KEM-768

### KAT 一致性验证

```
实现          测试轮次      通过率
──────────────────────────────────
纯 JS          10,000     100% ✅
C Native Addon  10,000     100% ✅
```

- 对照测试：所有 10,000 轮输出与 NIST KAT 参考向量逐字节比对
- JS / C Native Addon 双轨自洽：同种子 → 同密钥对 → 同共享密钥

### 性能（AMD Ryzen 5600U）

| 操作 | C Native Addon (AVX2) | 纯 JavaScript |
|------|----------------------|---------------|
| keygen | 48 µs | ~1.3 ms |
| encaps | 51 µs | ~1.8 ms |
| decaps | 105 µs | ~2.5 ms |

### TVLA 侧信道验证

- 方法：TVLA v2 Enhanced (Welch's t-test)
- 样本量：N = 10,000
- 阈值：|t| < 4.5
- 结果：全部通过 ✅
- C Native Addon：keygen / encaps / decaps 恒定时间实现

---

## 二、FPGA 硬件加速 · NTT/INTT 验证

### 硬件平台

```
FPGA 芯片    Xilinx Artix-7 xc7a35tfgg484-2
开发板       MicroPhase A7-Lite
时钟         49.5 MHz (WNS +0.204ns ✅)
通信         UART (CH340, 115200 baud)
综合工具     Vivado (clean synthesis)
```

### 验证结果

| 测试项 | 状态 |
|--------|------|
| NTT 256 系数变换 | 256/256 匹配 ✅ |
| INTT 256 系数逆变换 | 256/256 匹配 ✅ |
| NTT → INTT Round-trip | 256/256 全匹配 ✅ |
| 时序收敛 (WNS) | +0.204ns ✅ |
| 时序收敛 (WHS) | +0.049ns ✅ |

### 资源占用

| 资源 | 用量 |
|------|------|
| LUT | ~13,000 |
| FF | ~10,000 |
| DSP48E1 | 2 |
| BRAM | 1 |

### 关键 Bug 修复记录

1. **Barrett 模约减负数输入支持**：GS butterfly 差值可能为负，修复后 INTT 256/256 匹配
2. **FSM 等待信号 (ntt_busy vs ntt_done)**：改等待 ntt_busy 下降沿，修复 NTT 输出错位
3. **Zeta 表 Stage 6 硬编码**：删除硬编码 zeta=1，统一从表读取
4. **RESET 极性冲突**：统一为低有效复位
5. **BRAM 推断双 always 块冲突**：合并为单一 always 块

### FPGA 路线图

| 优先级 | 项目 | 状态 |
|--------|------|------|
| P0 | UART 修复 (CH340) | ✅ 完成 |
| P1 | SHAKE-128/256 Keccak 核心 | 规划中 |
| P2 | 采样/编码 + AXI 接口 | 规划中 |
| P3 | 密钥生成/封装/解封 FSM | 规划中 |
| P4 | ML-KEM-768 全流程软硬集成 | 规划中 |

---

## 三、国密 SM2 · 性能优化与侧信道安全

### 优化路径（5 阶段）

```
Stage 1  Native BigInt 域运算        → 底层 7.33× 加速
Stage 2  Jacobian 投影坐标            → 消除模逆
Stage 3  256 点预计算表               → 固定基点乘 2.6×
Stage 4  wNAF 窗口算法 (w=4)         → 一般点乘 1.16×
Stage 5  跨实现互操作                 → sm-crypto 100% 兼容
```

### 最终性能（Node.js v22, Intel Xeon Ice Lake）

| 操作 | 基线 (jsbn/ms) | 优化后 (ms) | 加速比 |
|------|---------------|-------------|--------|
| 域乘法 | 0.005375 | 0.000733 | **7.33×** |
| 密钥生成 | 11.654 | 1.460 | **7.98×** |
| 签名 | 30.151 | 4.868 | **6.19×** |
| 验签 | 28.359 | 8.998 | **3.15×** |
| 加密 | 23.134 | 2.757 | **8.39×** |
| 解密 | 11.698 | 1.386 | **8.44×** |
| 公钥派生 | 11.408 | 1.325 | **8.61×** |

### TVLA 侧信道安全

- 方法：TVLA v2 (Welch's t-test)
- 阈值：|t| < 4.5

#### 第一阶段：jsbn vs BigInt+wNAF (N=2,000, 2026-06-16)

| 操作 | jsbn \|t\| | BigInt + wNAF \|t\| | 结果 |
|------|-----------|---------------------|------|
| 密钥生成 | 1.05 | 0.84 | ✅ PASS |
| 签名 | 2.41 | 2.03 | ✅ PASS |
| 验签 | 0.63 | 0.08 | ✅ PASS |
| 加密 | 0.29 | 0.46 | ✅ PASS |
| 解密 | 3.91 | 2.71 | ✅ PASS |

`jsbn + BigInt/wNAF` 双路径 **10/10 全部通过**。

#### 第二阶段：BigInt Masked v1.2 (N=5,000, 2026-06-18)

对 BigInt 实现进行 **Scalar Masking + Projective Randomization** 增强：
- `k' = k + r·N`（r ∈ 64-bit random），不取模保持 bit pattern 差异
- 射影坐标随机 z 起始，阻止 V8 JIT 特化
- 性能开销 ~25%

| 操作 | \|t\| (v1.2) | 修复前 \|t\| | 结果 |
|------|-----------|-------------|------|
| 密钥生成 | **0.01** | ~1.4 | ✅ PASS |
| 签名 | **0.06** | ~1.4 | ✅ PASS |
| 验签 | **1.19** | 7.42 | ✅ PASS |
| 加密 | **0.34** | ~4 | ✅ PASS |
| 解密 | **2.06** | 8.22 | ✅ PASS |

**5/5 全部通过 N=5,000 TVLA**。验签从 |t|=7.42 降至 1.19，解密从 8.22 降至 2.06。

**根因**：旧版 `(k + r·N) % N ≡ k`，模运算消掉 mask。
**实现文件**：`sm2-bigint-ec-v1.2.js`（2026-06-18）

#### 第三阶段：v1.3 Montgomery Ladder (N=5,000, 2026-06-18)

在 v1.2 的双重防护基础上，用 **Montgomery Ladder** 替换 binary double-and-add，
实现恒定时间点乘，形成三重防护：

| 防护层 | 作用 | 实现 |
|--------|------|------|
| Scalar Masking | 打散标量位模式 | `k' = k + r·N`，r ∈ 64-bit random |
| Projective Randomization | 随机化起点坐标 | 每次 pointMul 随机化 Jacobian Z 坐标 |
| Montgomery Ladder | 消除 if(kBits[i]) 分支 | 320 轮固定 jDbl + jAdd + 算术掩码 swap |

关键修复：
- **BITS=320**：kMasked 最大 320-bit（r ≤ 2^64, N < 2^256），原 256-bit 导致高位截断
- **算术掩码 swap**：`(1-mask)*R0 + mask*R1` 实现无分支条件交换
- **参数类型**：verify/jAdd 间 Jacobian/仿射坐标转换

| 操作 | \|t\| (v1.3) | v1.2 \|t\| | 降幅 | 结果 |
|------|-----------|-------------|------|------|
| 密钥生成 | **0.10** | 0.01 | — | ✅ PASS |
| 签名 | **0.01** | 0.06 | ↓83% | ✅ PASS |
| **验签** | **0.10** | **1.19** | **↓92%** | ✅ PASS |
| 加密 | **0.35** | 0.34 | — | ✅ PASS |
| **解密** | **0.16** | **2.06** | **↓92%** | ✅ PASS |
| SHA-256 (基线) | **3.27** | 5.81 | ↓44% | ✅ PASS |
| randomBytes(32) | **1.11** | — | — | ✅ PASS |

**7/7 全部通过 N=5,000 TVLA**（含基线对照）。

性能开销：pointMul +52%, sign +67%, verify +47%, encrypt +75%, decrypt +72%。
开销来源：320 轮固定迭代 + 每轮 36 次 BigInt 乘法的算术掩码 swap。

**实现文件**：`sm2-bigint-ec-v1.3.js`（12,920 bytes，最终恒时版本）

#### 第四阶段：v1.3 高阶 TVLA (N=5,000, 2026-06-21)

在一阶 Welch's t-test 基础上，进一步检验 2–4 阶中心矩（方差/偏度/峰度）的侧信道安全。
测试覆盖 5 个核心操作 × 4 阶数 = 20 项指标。

**方法**：
- 对固定/随机输入的时序数据分别计算第 k 阶中心矩 `μ_k = E[(X − μ)^k]`
- Welch's t-test 比较固定/随机两组的 k 阶矩差异
- 阈值 |t| ≤ 4.5 (NIST IR 8214A 参考)
- 数据集：N=5,000 / 操作，预热 500 轮

| 操作 | Order 1 (均值) | Order 2 (方差) | Order 3 (偏度) | Order 4 (峰度) | 结果 |
|------|:---:|:---:|:---:|:---:|:----:|
| 密钥生成 | 0.00 | 0.15 | 0.24 | 0.48 | ✅ PASS |
| 签名 | 0.00 | 0.42 | 0.55 | 0.70 | ✅ PASS |
| 验签 | 0.00 | 0.69 | 0.73 | 0.76 | ✅ PASS |
| 加密 | 0.00 | 0.69 | 1.12 | 1.24 | ✅ PASS |
| 解密 | 0.00 | 0.45 | 0.61 | 0.74 | ✅ PASS |

**20/20 全部通过** (耗时 571.7s)。

**关键结论**：
1. **一阶全部 ≈ 0.00**：Montgomery Ladder 固定 double+add 每轮完美消除条件分支泄漏
2. **高阶最高 |t| = 1.24**（encrypt, Order 4）：KDF+XOR 带来轻微数据依赖方差，但远在阈值 4.5 内
3. **decrypt 最稳健**：高阶 t ≤ 0.74，固定密钥标量乘上恒时特性最显著
4. **三重防护在 1–4 阶统计下均有效**，无操作间交叉泄漏，t 值平滑无突变

**报告文件**：`tvla-sm2-high-order-report.json`  
**测试脚本**：`tvla_sm2_high_order.js`

### sm-crypto 互操作

- BigInt 签名 → jsbn 验签：✅
- jsbn 签名 → BigInt 验签：✅
- 500 次加密/解密：0 失败
- KDF 计数器格式、C3 完整性哈希双向兼容

---

## 四、时间戳存证

所有核心实现文件已通过 RFC 3161 标准时间戳存证。

| 文件 | SHA256 | 存证方 | 日期 |
|------|--------|--------|------|
| `_bigint_sm2.js` | `91cb89b7...` | DigiCert | 2026-06-16 |
| `_sm2_scalarmul.js` | `c1deb990...` | DigiCert | 2026-06-16 |
| `keccak.js` | `517976e6...` | DigiCert | 2026-06-15 |
| 其他 6 个核心文件 | — | FreeTSA + DigiCert | `/docs/tsa/2026-06-08/` |

**验证命令**：
```bash
openssl ts -reply -in *.tsr -text | grep "Status: Granted"
```

---

## 五、下一步：他证 → 第三方审计

当前所有验证均为**自证**（项目方独立完成，全过程可复现）。对于企业级应用场景，需补充以下**他证**：

| 类型 | 优先级 | 说明 |
|------|--------|------|
| ML-KEM-768 密码学审计 | P0 | 独立实验室 KAT / TVLA 复现 |
| SM2 侧信道审计 | P0 | 功耗/EM 级别补充评估 |
| FPGA NTT 核心审计 | P1 | 第三方综合/烧录复现 |
| 协议层安全审计 | P1 | TLS 1.3 + Double Ratchet + Mixnet |

---

## 参考链接

- [ML-KEM-768 KAT 验证报告](https://fibemate.net/kat-10000.html)
- [FPGA NTT/INTT 硬件验证报告](https://fibemate.net/docs/fpga-report.html)
- [SM2 逐级性能优化报告](https://fibemate.net/docs/sm2-optimization.html)
- [SM2 TVLA 侧信道分析](https://fibemate.net/docs/sm2-tvla-analysis.html)
- [安全部署详情](https://fibemate.net/security.html)

---

> ⚠️ **免责声明**：FIBEMATE 当前为非商用密码产品，所有实现仅供技术研究与学术验证。SM2 算法的使用须遵守《中华人民共和国密码法》及相关法规。本文档中引用数据来自项目方自测，不构成第三方安全审计结论。

---

## 本文档存证（最新）

| 属性 | 值 |
|------|-----|
| SHA-256 | 见 `TECHNICAL-VERIFICATION-v5.sha256` |
| 时间戳 | ✅ Granted · 见 `TECHNICAL-VERIFICATION-v5.tsr` · `openssl ts -reply -in TECHNICAL-VERIFICATION-v5.tsr -text` |
| TSA 授时机构 | FreeTSA (RFC 3161) |
| 版本 | v5 — 全局 TSR 76 份 · Path A/C-2 Active · 2026-07-17 |
| TSR 文件 | `TECHNICAL-VERIFICATION-v5.tsr` |

**历史存证 (v1)**：

| 属性 | 值 |
|------|-----|
| SHA-256 | `TECHNICAL-VERIFICATION.sha256` |
| 时间戳 | 2026-06-17 22:51:50 GMT (2026-06-18 06:51:50 CST) |
| TSA 授时机构 | FreeTSA (RFC 3161) |
| 状态 | **Granted** ✅ |
| TSR 文件 | `TECHNICAL-VERIFICATION.tsr` |

**验证命令**：
```bash
openssl ts -reply -in TECHNICAL-VERIFICATION.tsr -text | grep "Status: Granted"
sha256sum TECHNICAL-VERIFICATION.md
```
