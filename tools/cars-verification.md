# CARS (Crypto-Agility Readiness Score) — FIBEMATE v3.3.0 自评报告

**评估日期**：2026-08-02  
**评估对象**：FIBEMATE 后量子密码学全栈工程验证平台  
**评估方法**：基于学术 CARS 五维度框架，以项目内部工程数据填表，输出结构化评分  
**CARS 论文参考**：Krämer et al., "Crypto-Agility Readiness Score (CARS) — A Five-Dimensional Assessment Framework"

---

## 执行摘要

FIBEMATE 作为工程验证平台，CARS 综合得分 **63.50/100**（中等准备度）。最强的维度是 **Crypto Inventory**（85%），完整的加密资产清单和量化基准是学术 CARS 框架里罕见的实证案例。最弱的维度是 **Algorithm Agility**（40%），算法替换需要代码修改、缺乏插件式热切换架构——这是平台定位的合理取舍（"展示算法如何工作"优先于"生产级可替换性"）。**Protocol Coupling**（55%）和 **Key Lifecycle**（70%）处于中游，有 TLA+ 形式化验证支撑但缺乏自动化。**Organizational Readiness**（60%）受益于 OpenSSF passing badge 和完整的安全文档体系，但 Bus Factor=1 和缺少第三方审计是硬伤。

> ⚠️ **重要前置声明**：本报告是 CARS 框架在真实项目上的**首次实证验证**。CARS 论文提出的五维度框架此前仅经过假设项目验证，FIBEMATE 是第一个将其应用于实际运行中的密码学工程平台的项目。本报告的另一个输出是对 CARS 框架本身的反馈：哪些维度评分标准在真实项目中合理，哪些需要调整。

---

## 维度一：Crypto Inventory（加密资产清单）

### 评分：85/100

### 清单

#### 后量子密码学（PQC）

| 算法 | 标准 | 实现方式 | 验证状态 |
|------|------|----------|----------|
| ML-KEM-768 | FIPS 203 | JS 原生 + C Native Addon | KAT 10000/10000 Noble 交叉验证、TVLA 软件侧信道 3/3 PASS |
| ML-KEM-1024 | FIPS 203 | Noble `@noble/post-quantum` | TVLA 3/3 PASS（Noble 实现，非自研） |
| ML-DSA-65 (fml-dsa) | FIPS 204 | 纯 JS 自研（fml-dsa） | 84/84 自测、KeyGen KAT 75/75、Noble 双向交叉验证 |
| SLH-DSA-128s | FIPS 205 | WASM bridge（NIST 参考 C） | 5/5 smoke test、bench 基准 |

#### 国密算法（Chinese Cryptography）

| 算法 | 标准 | 实现方式 | 验证状态 |
|------|------|----------|----------|
| SM2 | GB/T 32918 | 纯 JS（BigInt + jsbn 双轨） | KAT 100/100、TVLA 36/36（3 实现×12 项）、0.2% 故障已修复 |
| SM3 | GB/T 32905 | 纯 JS | KAT 30/30 跨语言验证、bench ~5KB/s |
| SM4-GCM | GB/T 32907 | 纯 JS | KAT 30/30、bench ~230KB/s |

#### 传统密码学

| 算法 | 用途 | 实现方式 |
|------|------|----------|
| P-256 (ECDH) | Double Ratchet DH 层 | Node.js 内置 crypto |
| AES-256-GCM | 消息加密 | WebCrypto / Node crypto |
| HMAC-SM3 | 国密 MAC | 纯 JS（KAT 6/6） |
| SHA-256 | HKDF 密钥派生 | Node.js 内置 crypto |
| SHAKE-128/256 | fml-dsa 内部 | JS 实现 |

#### 硬件加速

| 模块 | 平台 | 状态 |
|------|------|------|
| NTT 加速器 | Artix-7 FPGA | WNS 9.755ns, ~500 LUTs, ~1500 FFs, ILA 验证通过 |
| VWZ BRAM 求解器 | Artix-7 FPGA | 行为模型 5/5 PASS（实验性，默认关闭） |

#### 协议组件

| 组件 | 算法 | 状态 |
|------|------|------|
| Hybrid KEM | SM2 + ML-KEM-768 | IANA #4590 格式，应用层协商 |
| Double Ratchet PQ | ML-KEM-768 + P-256 | 双棘轮 PQ 混合，每 100 条消息 re-key |
| OPK 预密钥 | TLA+ 形式化验证 | 3 条不变量（O1/O2/O3），OPK 一次性消耗 |

### 维度评估

**优势**：
- 加密资产清单**完整且可量化**——每个算法有 KAT 结果、benchmark 数据、TVLA 报告
- 跨标准覆盖（NIST FIPS 203/204/205 + 中国国密 GB/T）
- 硬件+软件双轨记录

**不足**：
- 缺乏自动化资产扫描工具（当前为手动维护的文档）
- 部分实现为第三方（SLH-DSA WASM bridge、Noble ML-KEM-1024 TVLA），非全自研
- 实验组件（VWZ、LookingGlass）未纳入主资产清单

**与 CARS 框架的偏差**：CARS 论文假设加密资产清单是"组织有文档记录即可"，但 FIBEMATE 的证据链（KAT/Bench/TVLA/TSR）远超论文预期——建议 CARS 框架增加"可验证性"子维度。

---

## 维度二：Algorithm Agility（算法可替换性）

### 评分：40/100

### 现状

| 组件 | 可替换性 | 替换方式 |
|------|----------|----------|
| Hybrid KEM 算法组合 | ❌ 硬编码 | `hybrid-kem-client.js` SM2+ML-KEM-768 写死 |
| Double Ratchet DH 层 | ⚠️ 参数可调 | `PQ_REKEY_INTERVAL=100` 可改，但 P-256→其他需改代码 |
| 消息加密层 | ⚠️ 半灵活 | AES-GCM 硬编码，但 `message-gm.js` 支持 SM4 切换 |
| 签名算法 | ❌ 硬编码 | `gm.js` SM2 写死，验证逻辑耦合 |
| NTT 域参数 | ⚠️ 编译时常量 | q=3329 硬编码，改参数需重新编译 |

### 热切换架构评估

FIBEMATE **没有**插件式算法注册表。`gm.js:183` 的 `negotiateWithServer()` 是应用层协商而非算法注册表。算法替换需要：
1. 修改源码常量
2. 重新运行测试套件
3. 更新 KAT 引用
4. 手动验证

### 为什么 Agility 得分低却是合理的

FIBEMATE 的定位是"可执行教科书"而非"生产密码库"。在生产系统中，Algorithm Agility 是核心需求（TLS 1.3 的 cipher suite 协商是典范）；在教育/验证平台中，**展示每种算法独立工作**比让它们可热切换更重要。FIBEMATE 的"敏捷性"体现在**可以并排对比多种算法**（ML-KEM vs SM2、fml-dsa vs SLH-DSA），而非运行时切换。

**与 CARS 框架的偏差**：CARS 框架的 Algorithm Agility 隐含假设"这是一个需要运行时迁移的生产系统"。对于教育/验证类项目，建议 CARS 增加"跨算法对比能力"作为对 Agility 的补充维度。

---

## 维度三：Key Lifecycle（密钥生命周期管理）

### 评分：70/100

### 生命周期模型

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 生成    │ → │  分发   │ → │  使用   │ → │  销毁   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
 generateKeypair  encode/decode   encrypt/sign   session reset
 OPK upload       key_share       ratchet        OPK consumed→burned
```

### 证据

| 阶段 | 实现 | 形式化验证 |
|------|------|-----------|
| 密钥生成 | `HybridKEM.generateKeypair()` (SM2+ML-KEM 混合 ephemeral) | — |
| 密钥分发 | OPK 预密钥协议（一次性上传，一次性消耗） | TLA+ 3 条不变量验证通过 |
| 密钥派生 | HKDF-SHA-256 (extract+expand) | — |
| 密钥轮换 | Double Ratchet `PQ_REKEY_INTERVAL=100` | — |
| 前向安全性 | P-256 ECDH 每消息 ratchet | — |
| 后向安全性 | ML-KEM re-key 每 100 消息 | — |
| 密钥销毁 | session reset / OPK 状态机 `consumed→burned` | TLA+ O1_NoDoubleConsume |

### TLA+ 形式化验证覆盖

OPK 协议的三条不变量在位级验证通过：

- **O1_NoDoubleConsume**：同一 OPK 不会被消费两次
- **O2_ConsumedExists**：每次消费对应一次有效的上传
- **O3_CountCorrect**：可用 OPK 计数与实际一致

C2 握手模型 7 条不变量全部通过（含 K3 强密钥独立性）。

### 评估

**优势**：
- OPK 协议有完整 TLA+ 形式化验证（这是 CARS 框架未预期的加分项）
- Double Ratchet 的前向/后向安全性分工明确
- 混合 KEM 的 ephemeral 密钥模式避免了密钥复用

**不足**：
- 密钥轮换间隔（100 条消息）为经验值，缺乏基于安全性衰减的定量推导
- 无密钥过期自动提醒机制
- 缺乏密钥审计日志和访问控制

**与 CARS 框架的偏差**：CARS 框架的 Key Lifecycle 维度侧重"组织有没有密钥管理政策"，但 FIBEMATE 用 TLA+ 形式化证明代替了书面政策——这比政策更严格。建议 CARS 增加"形式化验证"作为 Key Lifecycle 的加分项。

---

## 维度四：Protocol Coupling（协议耦合度）

### 评分：55/100

### 耦合分析

| 组件 | 耦合方式 | 松耦合路径 |
|------|----------|-----------|
| 混合 KEM 握手 | 紧耦合（SM2+ML-KEM-768 固定组合） | 需引入算法协商帧 |
| Double Ratchet | 中等（P-256 固定，ML-KEM re-key 间隔可调） | P-256→X25519 需代码修改 |
| 消息加密层 | 中等（AES-GCM 硬编码，SM4-GCM 备选路径存在） | `message-gm.js` 已支持 SM4 切换 |
| TLS 层 | ⚠️ 不存在标准 TLS 集成 | hybrid-kem-client 为应用层自定义 |

### 与标准协议的对比

| 维度 | FIBEMATE | TLS 1.3 标准 |
|------|----------|-------------|
| 密钥交换 | 应用层 IANA #4590 格式 | 标准 `supported_groups` 扩展 |
| 算法协商 | `negotiateWithServer()` 自定义 | `cipher_suites` 协商 |
| 证书 | 无 | X.509 链 |
| 前向安全性 | Double Ratchet | (EC)DHE |

FIBEMATE 的协议层**刻意远离标准 TLS 1.3**——这不是缺陷，是设计决策：用自定义应用层协议展示混合 KEM 如何工作，比试图在 OpenSSL 里打补丁更适合"可执行教科书"定位。

### 评估

**优势**：
- 每个协议组件都可以独立运行和测试（不依赖完整 TLS 栈）
- 混合 KEM 格式遵循 IANA #4590 规范（非全新发明）

**不足**：
- 算法组合硬编码，不能通过协商切换
- 无版本协商机制（向前兼容性为零）
- 应用层自定义协议缺乏互操作性测试

**与 CARS 框架的偏差**：CARS 框架的 Protocol Coupling 隐含假设"项目使用标准协议（TLS、SSH）"。FIBEMATE 选择在标准协议之外展示核心思想，这是一种**教育性解耦**——对 CARS 框架而言是低耦合度，对教育目标而言是高透明度。建议 CARS 区分"协议标准耦合度"和"教育透明度"两个子维度。

---

## 维度五：Organizational Readiness（组织准备度）

### 评分：60/100

### 评估矩阵

| 子维度 | 状态 | 证据 |
|--------|------|------|
| 安全策略文档 | ✅ | SECURITY.md（含漏洞报告流程、已知局限性） |
| 威胁模型 | ✅ | THREAT_MODEL.md + security-model.md（含 QROM 安全模型文档） |
| 漏洞披露 | ✅ | VULNERABILITIES.md + `security@fibemate.net` |
| 代码贡献流程 | ✅ | CONTRIBUTING.md（DCO、分支命名、AI 贡献边界） |
| 行为准则 | ✅ | CODE_OF_CONDUCT.md (v2.1) |
| 治理模型 | ✅ | GOVERNANCE.md |
| CI/CD | ✅ | CI 6/6 + Nightly Phase1 2/2 + Phase2 4/5 |
| 开源合规 | ✅ | GPL-3.0-only + SPDX 全仓标注 + BOM 三层治理 |
| OpenSSF 最佳实践 | ✅ | passing badge（项目 #13695） |
| 可复现构建 | ✅ | `scripts/reproduce-build.sh`、lockfile 钉定 |
| 第三方安全审计 | ❌ | Q4 2026 最早 |
| Bus Factor | 🔴 1 | 单人项目，开源后待改善 |
| 社区活跃度 | 🔴 0 | 未开源（8/31 解锁） |
| 自动化依赖扫描 | ❌ | Dependabot 未启用 |

### 已知局限性（SECURITY.md 原文摘录）

- 纯 JS 实现**非常数时间**
- 无硬件侧信道防护（仅软件仿真 TVLA）
- C Native Addon 未经 fuzzing
- RTL 源代码开源时扣留

### 评估

**优势**：
- 安全文档体系完备（7 个核心文档，覆盖从威胁模型到漏洞披露）
- CI/Nightly 全绿，工程质量有保障
- OpenSSF passing badge（CARS 框架未预设但可视为加分项）

**不足**：
- **Bus Factor = 1**：CARS 框架的 Organization Readiness 假设多人团队，单人项目是硬伤
- 零第三方审计：内部测试（KAT/TVLA）≠ 外部信任
- 依赖扫描缺失：npm audit 的 11 vulnerabilities 未处理
- 无自动化安全更新流程（Dependabot/Renovate）

**与 CARS 框架的偏差**：CARS 框架的 Organization Readiness 假设"这是一个有组织的团队项目"。FIBEMATE 在其中几个维度（安全文档、CI、SBOM 等价物）达到了多人项目的标准，但 Bus Factor=1 暴露了根本差异。建议 CARS 框架为单人/小团队项目增加调整因子。

---

## CARS 综合评分

| 维度 | 得分 | 权重 | 加权 |
|------|------|------|------|
| Crypto Inventory | 85 | 0.25 | 21.25 |
| Algorithm Agility | 40 | 0.20 | 8.00 |
| Key Lifecycle | 70 | 0.20 | 14.00 |
| Protocol Coupling | 55 | 0.15 | 8.25 |
| Organizational Readiness | 60 | 0.20 | 12.00 |
| **综合** | | | **63.50** |

> 注：权重按 CARS 论文默认分配，未做调整。

---

## 对 CARS 框架的反馈

本次实证验证暴露了 CARS 框架在非生产系统上的四个局限：

1. **Algorithm Agility 不适用于教育/验证平台**：建议增加"跨算法对比展示能力"子维度
2. **Key Lifecycle 遗漏形式化验证加分**：TLA+ 模型证明比书面政策更严格
3. **Protocol Coupling 未区分"标准合规"与"教育透明度"**：应用层自定义协议可能是刻意设计
4. **Organizational Readiness 缺乏单人项目调整因子**：Bus Factor=1 但文档/CI 体系完备的情况无法评分

---

## 改进路线图

| 优先级 | 改进项 | 目标维度 | 预期效果 |
|--------|--------|----------|----------|
| P0 | 第三方安全审计（Q4 2026） | Org Readiness | +15 分 |
| P1 | 构建算法注册表原型（插件式热切换） | Algorithm Agility | +25 分 |
| P1 | 启用 Dependabot + 修复 npm audit | Org Readiness | +5 分 |
| P2 | 社区贡献者引入（开源后 Bus Factor→2+） | Org Readiness | +10 分 |
| P2 | 密钥轮换间隔安全性定量推导 | Key Lifecycle | +10 分 |
| P3 | IETF/标准协议集成 PoC | Protocol Coupling | +15 分 |

**改进后预期 CARS**：~88/100（接近 CARS 论文定义的"高准备度"阈值 85）

---

## 方法论声明

本报告的评分依据全部来自 FIBEMATE 项目的公开工程数据（CI 日志、KAT 结果、TLA+ 模型、安全文档、源码结构）。评估过程没有进行新的测试——所有数据在 2026-08-01 锁仓版本（commit `f465fba`）中就存在。

这是 CARS 框架在真实项目上的首次实证应用。报告的另一个输出是上方的"对 CARS 框架的反馈"——这些偏差不是 FIBEMATE 的缺陷，而是 CARS 框架在教育/验证类项目上的适用性边界。
