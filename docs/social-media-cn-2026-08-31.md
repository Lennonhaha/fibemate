# 国内社区多平台发布文案

> 基于 `launch-announcement-2026-08-31.md` · 2026-08-31 发布日
> 按平台特征独立撰写：知乎（深度长文）· 掘金（代码工程）· V2EX（短帖）· 开源中国（正式公告）

---

## 一、知乎 — 「后量子密码学全栈工程：从浏览器到 FPGA，一个人的两年实践」

### 配图建议
- 首页截图（fibemate.net）
- FPGA Vivado 时序报告截图
- TLA+ TLC 输出截图（7 invariants · 0 violations）

---

### 正文

两年前我开始问一个问题：**一个人能不能从零实现完整的后量子密码工程栈？** 不只是换算法——而是从浏览器到 FPGA，从国密合规到国际标准，从单元测试到形式化验证。

今天，FIBEMATE v3.3.0 正式开源。这是我的回答。

---

### 项目概述

**FIBEMATE** 是一个后量子密码学全栈工程验证平台，覆盖三条技术线：

| 技术线 | 内容 | 状态 |
|:---|:---|:---|
| **标准 PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA-128s (FIPS 205, WASM bridge) — NTT 域实现、fml-dsa (ML-DSA-65, FIPS 204) Noble 互操作验证 | ✅ 已验证 |
| **国密混合** | SM2/SM3/SM4 + ML-KEM — IANA 注册编号 #4590，应用层验证 | ✅ 双轨在线 |
| **硬件 (FPGA)** | NTT 加速器 Artix-7 35T — 256×256 回环、行为模型 43/43 | ✅ 仿真通过 |

另有实验性模块（默认关闭，无安全保证）：VWZ 张量签名、LookingGlass v2 代数混淆。

---

### 我做了哪些验证？

#### 密码学正确性

- **ML-KEM-768**：FIPS 203 全 NTT 域实现，与 `@noble/post-quantum` 交叉验证 10,000/10,000 ✅，与 liboqs (C) 交叉验证 10,000/10,000 ✅
- **SM2**：GB/T 32918 合规，实现标量掩码防御简易功耗分析（SPA），软件 TVLA N=10,000 全量通过
- **SM3/SM4**：KAT 向量校验、常时 S-box、αGCM 模式
- **混合 KEX**：SM2 + ML-KEM-768，注册 IANA #4590 扩展，Path C-2 握手 5/5 E2E

#### 协议安全

- **TLA+ 形式化验证**：对 Path C-2 混合握手做全状态机建模，7 条不变量全通过，TLC 探索 101,467 个状态，零死锁
- **K3 强密钥独立性**：∀ 会话 sᵢ ≠ sⱼ: keyᵢ ≠ keyⱼ，经由 TLA+ 形式化证明

#### 侧信道防御

- Barrett 归约（常时，比 BigInt 快 14×）
- SM2 标量掩码（k' = k + r·N，64 位随机 r）
- 解封装失败以位掩码方式处理（无提前返回）

#### 可复现性

- **100 份 RFC 3161 时间戳存证**（lg-001~lg-100）— DigiCert + FreeTSA 双机构签发
- 每轮 KAT、每轮交叉验证、每个版本里程碑均有 TSR 存证
- 审计打包：258KB，234 文件，SHA256 文件清单

---

### 我诚实地说

- ❌ 这不是安全产品——是工程演示平台
- ❌ 未经第三方安全审计——自行测试+交叉验证，但未见外部评审
- ❌ 实验性模块默认关闭——VWZ/LookingGlass 无安全保证
- ❌ 纯 JavaScript 有计时限制——交叉验证覆盖算术正确性，但防侧信道不如 C/Rust

**完整披露**：[security-limitations.md](https://github.com/Lennonhaha/fibemate/blob/master/docs/security-limitations.md) · [risk-rectification.md](https://github.com/Lennonhaha/fibemate/blob/master/docs/risk-rectification.md)

---

### 为什么用 JavaScript？

这是最常被问的问题。答案很简单——它是通用运行时：浏览器、Node.js、边缘计算都在跑它。JS 写密码学的确有常时执行的天然劣势，但我做了几件事来弥补：

1. **Barrett 归约**取代原生 BigInt 除模（常时，14× 更快）
2. **与 liboqs (C) 逐字节交叉验证** 20,000 轮，覆盖算术正确性
3. **SM2 掩码**防御 SPA（已通过 N=10,000 软件 TVLA）

如果你需要生产级安全，等 Q4 第三方审计。

---

### 项目数据

| 维度 | 数值 |
|:---|:---|
| ML-KEM-768 KEM/s（纯 JS, 2 vCPU） | 107/s |
| KAT 验证 | 10,000/10,000 |
| 交叉验证 (noble + liboqs) | 20,000/20,000 |
| FPGA NTT 回环 | 256/256 |
| TLA+ 状态探索 | 101,467 |
| TSR 存证 | 100 份 |
| 测试覆盖率（密码核心） | 93.91% |

---

### 路线图
|:---|:---|
| 2026-08-20 | 编译期隔离实验性模块（Feature Flag） |
| 2026-08-25 | ML-KEM 交叉验证 CI 门禁就绪 |
| 2026-08-31 | **v3.3.0 正式发布** |
| Q4 2026 | 物理 TVLA（ChipWhisperer）· Bus Factor ≥ 2 |
| 2027 | 常时 C/Rust 重写 · HSM 集成 |

---

### 代码与链接

- 仓库：https://github.com/Lennonhaha/fibemate
- 官网：https://fibemate.net
- 在线体验：https://fibemate.net/demo/
- PQC 就绪度看板：https://fibemate.net/docs/pqc-readiness.html

---

一个能在浏览器里跑通 ML-KEM + SM2 混合握手、在 FPGA 里跑通 NTT 加速器、在 TLA+ 里证明 7 条不变量全部成立的工程——这是两年 solo 的结果。现在它开源了。

欢迎研究、审计、批评、贡献。

---

## 二、掘金 — 「一个人的后量子密码全栈：从写代码到 TLA+ 形式化证明」

### 封面建议
- FIBEMATE 架构图（浏览器 → Node.js → FPGA）
- ML-KEM KAT 测试通过截图

### 标签
`后量子密码学` `JavaScript` `FPGA` `TLA+` `开源`

---

### 正文

**一句话总结**：一个人用两年时间，从算法实现到 FPGA 加速器，从国密合规到 TLA+ 形式化证明，把后量子密码学全栈走通了一遍。今天开源。

---

### 项目里有什么

```
fibemate/
├── packages/pqc-kem/       # ML-KEM-768 (FIPS 203 NTT 域)
├── www/demo/               # 浏览器端在线体验
├── rtl/ntt/                # FPGA NTT 加速器 (Artix-7)
├── tla/                    # TLA+ 形式化模型 (Path C-2)
├── rust/lgv2/              # LookingGlass v2 (实验)
├── rust/vwz-sign-wasm/     # VWZ 签名 (实验)
├── docs/                   # 15+ 文档 · 100 TSR 存证
└── .github/workflows/      # CI/CD 流水线 (3 层)
```

---

### 技术亮点

#### 1. ML-KEM-768 全 NTT 域实现
```javascript
// FIPS 203 §4.3 — NTT domain keygen + encaps + decaps
const kp = generateKeypair();       // 1184B pk, 2400B sk
const enc = encapsulate(kp.publicKey);  // 1088B ct, 32B ss
const ss = decapsulate(kp.secretKey, enc.ciphertext);
```

- Barrett 归约：常时除法 `a * b mod Q` — 14× 比 BigInt 快
- NTT/iNTT：参考 noble FFTCore，与 liboqs 逐字节验证
- cross-validated: noble 10K/10K + liboqs (C) 10K/10K ✅

#### 2. SM2 国密全栈
- GB/T 32918 签名 + 加密
- 标量掩码防 SPA：`k' = k + r·N`（64 位随机 r）
- 软件 TVLA N=10,000，36/36 PASS

#### 3. FPGA NTT 加速器
- Artix-7 35T (Xilinx)
- 256×256 NTT roundtrip — 行为模型 43/43 PASS
- WNS 9.755ns @ 50MHz

#### 4. TLA+ 形式化验证
```
TLC: 101,467 states · 26,115 distinct · 7 invariants · 0 violations
```

建模的是握手协议（Path C-2），不是格数学本身——但全协议行为空间已经穷举验证。

#### 5. 时间戳全链存证
```
lg-001~lg-100: DigiCert + FreeTSA 双源 RFC 3161 时间戳
```

每份 KAT、每轮交叉验证、每个版本里程碑都有 TSR 存在工程仓库里。密码学的不信任精神，对自身工程也适用。

---

### 快速上手

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate && npm ci
node -e "
  const { generateKeypair, encapsulate, decapsulate } = require('./packages/pqc-kem');
  const kp = generateKeypair();
  const enc = encapsulate(kp.publicKey);
  const ss = decapsulate(kp.secretKey, enc.ciphertext);
  console.log('KEM roundtrip:', Buffer.compare(ss, enc.sharedSecret) === 0 ? '✅' : '❌');
"
```

在线体验：https://fibemate.net/demo/

---

### 适合谁

- **密码工程师**：参考 NTT 域实现、Barrett 归约、侧信道防御
- **安全研究者**：TLA+ 模型、混合 KEX 设计、SM2 掩码攻击面
- **FPGA 开发者**：NTT 流水线、BRAM 布局、行为模型
- **学生/学习者**：架构文档从浏览器到硅片逐层展开

---

### 掘金社区交流

- 仓库：https://github.com/Lennonhaha/fibemate
- 讨论：https://github.com/Lennonhaha/fibemate/discussions
- Issue：https://github.com/Lennonhaha/fibemate/issues

欢迎 ⭐ Star · 提 Issue · 提交 PR · 参与讨论

---

## 三、V2EX

### 节点
`/go/programmer` 或 `/go/opensource`

### 标题
**FIBEMATE v3.3.0 开源 — 一个人用两年实现的后量子密码全栈工程平台**

### 正文

仓库：[github.com/Lennonhaha/fibemate](https://github.com/Lennonhaha/fibemate)

两年 solo 项目，今天正式开源。覆盖：

- ML-KEM-768 (FIPS 203) 纯 JavaScript NTT 域实现，与 noble + liboqs 交叉验证 20,000/20,000
- SM2/SM3/SM4 国密套件，SM2 掩码防 SPA，已过软件 TVLA
- FPGA Artix-7 NTT 加速器，行为模型 43/43 全过
- TLA+ 形式化验证握手协议（7 条不变量，101K 状态探索）
- 100 份 RFC 3161 时间戳存证（lg-001~lg-100）
- Barrett 归约常时除法，比 BigInt 快 14×

诚实说：不是安全产品，是工程验证平台。实验模块默认关闭，无安全担保。完整限制见 security-limitations.md。

浏览器在线体验：https://fibemate.net/demo/

欢迎批评、审计、贡献。

---

### V2EX 评论区话术（备选）

**如果有人问「纯 JS 写密码学不怕时序攻击吗？」**
> Barrett 归约做到了常时除法（14× 快于 BigInt），SM2 有标量掩码。关键是跟 liboqs 的 C 实现做了 20,000 轮逐字节交叉验证，算术正确性有覆盖。但 JS 平台本质上做不到真正的常时——所以 README 里诚实写明了限制。纯 JS 在这个项目里的定位是「可验证的参考实现」，不是「生产级加固方案」。

**如果有人问「为什么不直接用 liboqs？」**
> liboqs 是 C 库，要跨到浏览器需要 WASM 编译链路。这个项目的一部分就是那条链路——Rust → WASM → 浏览器端调用。但项目同时维护了纯 JS 实现作为可读参考，并做了与 liboqs 的 20,000 轮双向交叉验证来确认算术一致性。两者不是二选一，是互补验证。

**如果有人问「一个人怎么做完的？」**
> 两年的晚上和周末。没有团队，没有经费。动力是对工程的执念——「如果我能把整条链走通，说明这条路可行」。现在开源是为了让更多人参与验证和改进。

---

## 四、开源中国

### 发布分类
`软件发布` / `开源推荐`

### 标题
**FIBEMATE v3.3.0 发布：后量子密码学全栈工程验证平台正式开源**

### 正文

#### 项目简介

FIBEMATE 是一个后量子密码学（PQC）全栈工程验证平台。项目以「从浏览器到 FPGA、从算法实现到形式化验证」的全链条覆盖为目标，经过两年独立研发，已于 2026 年 8 月 31 日正式以 GPLv3 协议开源。

**开源地址**：https://github.com/Lennonhaha/fibemate

---

#### 核心特性

##### 1. 标准化 PQC 实现

- **ML-KEM-768**（FIPS 203）：全 NTT 域实现，`keygen/encaps/decaps` 全部对齐 FIPS 标准线格式
- **SLH-DSA-128s**（FIPS 205）：WASM 桥接封装
- **fml-dsa / ML-DSA-65**（FIPS 204）：纯 JavaScript 实现，与 @noble/post-quantum 双向互操作验证通过
- **与 @noble/post-quantum 交叉验证**：10,000/10,000 轮通过
- **与 liboqs 0.12.0 (C) 交叉验证**：10,000/10,000 轮双向通过

##### 2. 国密算法体系

- **SM2**：GB/T 32918 签名与加密，标量掩码防简易功耗分析
- **SM3**：哈希函数，KAT 向量全通过
- **SM4**：常时 S-box，αGCM 认证加密模式
- **混合密钥交换**：SM2 + ML-KEM-768，已注册 IANA #4590

##### 3. 硬件实现（FPGA）

- **平台**：Xilinx Artix-7 35T
- **模块**：NTT 前向/逆向变换加速器
- **验证**：256×256 回环测试通过，行为模型 43/43 全绿
- **时序**：WNS 9.755ns @ 50MHz

##### 4. 形式化验证

- **工具**：TLA+ (TLC model checker)
- **范围**：Path C-2 混合握手协议全状态空间
- **结果**：7 条不变量全部通过，101,467 个状态探索，零违反、零死锁

##### 5. 时间戳全链存证

全项目 100 份 RFC 3161 标准时间戳（lg-001~lg-100），覆盖所有 KAT 测试、交叉验证和版本里程碑。DigiCert + FreeTSA 双证书源签发。

---

#### 技术架构

```
Browser (WebCrypto + IndexedDB)
  ↕ Application-layer Hybrid KEX (X25519+MLKEM768)
Node.js Server (Express + WS)
  ↕ Barrett modMul (constant-time)
Crypto Core (ml-kem-768.js · SM2 · SM3 · SM4)
  ↕ IANA #4590 application-layer hybrid
FPGA NTT Accelerator (Artix-7 · Vivado)
  ↕ BRAM36 · DSP48E1 · 50MHz
TLA+ Formal Model (TLC · 7 invariants)
```

---

#### 诚实声明

本项目定位为**工程演示平台**，而非商用安全产品：

- ❌ 未经第三方安全审计
- ❌ 纯 JavaScript 实现无法保证完全的常时执行
- ❌ 实验性模块（VWZ 签名、LookingGlass 混淆）默认关闭，不提供安全保证
- ✅ 提供完整的 `security-limitations.md` 和 `risk-rectification.md` 披露清单

---

#### 版本信息

| 项目 | 详情 |
|:---|:---|
| 版本号 | v3.3.0 |
| 发布协议 | GPL-3.0-only |
| 主语言 | JavaScript (ES2022) + Rust (WASM 绑定) |
| 运行环境 | Node.js 22 LTS, 所有现代浏览器 |
| 开源日期 | 2026-08-31 |
| TSR 存证 | lg-001~lg-100（DigiCert + FreeTSA） |

---

#### 相关链接

- **源代码**：https://github.com/Lennonhaha/fibemate
- **官方网站**：https://fibemate.net
- **在线体验**：https://fibemate.net/demo/
- **项目文档**：https://github.com/Lennonhaha/fibemate/tree/master/docs
- **PQC 就绪度看板**：https://fibemate.net/docs/pqc-readiness.html
- **发行公告**：https://github.com/Lennonhaha/fibemate/blob/master/docs/launch-announcement-2026-08-31.md

---

#### 联系方式

- **GitHub Issues**：https://github.com/Lennonhaha/fibemate/issues
- **GitHub Discussions**：https://github.com/Lennonhaha/fibemate/discussions
- **邮箱**：fibemate@fibemate.net

---

### 补充材料（开源中国发布时可附带）

#### 项目数据总览

| 维度 | 数值 |
|:---|:---|
| ML-KEM KAT 验证 | 10,000/10,000 |
| 交叉验证 (noble + liboqs) | 20,000/20,000 |
| SM2 TVLA (N=10,000) | 36/36 PASS |
| FPGA 行为测试 | 43/43 PASS |
| TLA+ 状态探索 | 101,467 |
| TSR 存证 | 100 份 |
| 测试覆盖率 | 93.91% |
| 核心代码行数 | ~355 (ml-kem-768.js) |
| 文档字数 | 50,000+ |
| 独立开发时间 | 2 年 |
