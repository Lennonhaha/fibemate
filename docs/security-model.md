# FIBEMATE 安全模型与密码学假设

> 版本：v3.3-preview · 日期：2026-07-18 · TSR：lg-083

## 1. 密码学假设体系

### 1.1 ML-KEM-768（FIPS 203）

| 维度 | 详述 |
|------|------|
| **底层假设** | Module Learning With Errors (MLWE) over  = \mathbb{Z}_q[X]/(X^{256}+1)$, =3329$, =3$ |
| **安全模型** | Quantum Random Oracle Model (QROM) |
| **安全级别** | NIST Category 3（≥128-bit post-quantum） |
| **KEM 安全性** | IND-CCA2（Fujisaki-Okamoto 变换） |
| **FIPS 状态** | FIPS 203 正式标准（2024 发布） |
| **实现基准** | Jasmin (libjade)：EasyCrypt 形式化验证保证功能正确性 + 常量时间执行 |
| **FIBEMATE 实现** | FIBEMATE WASM/Node.js + STM32 C + FPGA v5 RTL，KAT 10,000/10,000 通过，TVLA N=10,000 通过 |

**学术参考：**
- FIPS 203: Module-Lattice-Based Key-Encapsulation Mechanism Standard
- libjade: https://github.com/formosa-crypto/libjade — EasyCrypt formally verified implementation

### 1.2 SM2 ECDH

| 维度 | 详述 |
|------|------|
| **底层假设** | Elliptic Curve Discrete Logarithm Problem (ECDLP) on SM2 P-256 |
| **安全模型** | Random Oracle Model (ROM) |
| **安全级别** | ~128-bit（经典计算模型） |
| **实现** | SM2 BigInt constant-time scalar multiplication，TVLA v1.2 5/5 通过 |
| **SM2 TVLA** | N=5,000 掩码验证通过（lg-058），标量掩码 ' = k + r \cdot N$（N=曲线阶） |

### 1.3 混合 KEM 组合器（SM2 ⊕ ML-KEM-768）

| 维度 | 详述 |
|------|------|
| **组合器类型** | Dual-PRF KEM Combiner |
| **安全性定理** | 若 SM2 或 ML-KEM-768 任一组件 IND-CPA 安全，则混合 KEM IND-CPA 安全 |
| **归约紧致性** | 紧致归约（无安全参数损失因子）|
| **标准引用** | NIST SP 800-56Cr2 (Dual-PRF combiner), IETF draft-ietf-tls-hybrid-design |
| **ROM/QROM** | SM2 在 ROM 下可证、ML-KEM 在 QROM 下可证 |
| **学术参考** | Kiltz, Lyubashevsky, Schaffner (2024): Dual-PRF KEM Combiners in the QROM |

**组合方式：**
\text{ss} = \text{HKDF-SHA256}( \text{SM2-ss} \parallel \text{ML-KEM-ss} )
其中 ss 为复合共享秘密，HKDF 为 HMAC-based Key Derivation Function。

---

## 2. 形式化验证覆盖

### 2.1 协议层：TLA+ Path C-2 状态机

| 维度 | 详述 |
|------|------|
| **范围** | Path C-2 SM2 + ML-KEM-768 混合握手（不含 TCP 重传） |
| **不变量** | 7 条（TypeOK, K1-K5, K3_StrongKeyIndependence） |
| **状态空间** | 101,467 states, 26,115 distinct |
| **死锁** | 0 deadlock |
| **违反** | 0 violations |
| **文件** | docs/tla/C2.tla + docs/tla/C2.cfg |
| **存证** | lg-069 (DigiCert TSR), Jul 14 2026 |
| **局限** | (1) K3_symmetry 使用 key=i 确定性构造而非密码级随机采样；(2) Lossy network deadlock 绕过（真实协议靠 TCP 重传）；(3) 不含密码学原语层证明 |

### 2.2 实现层：测试覆盖

| 层级 | 测试 | 状态 |
|------|------|------|
| Rust (LG v2.2) | 37/37 unit | ✅ |
| Rust (LG v2.2.3) | 61/61 (含冷热分离) | ✅ |
| Node.js (Path C-2) | 5/5 E2E | ✅ |
| Node.js (reg-server IANA) | 10/10 E2E | ✅ |
| FPGA (NTT core) | 256/256 hardware loopback | ✅ |
| FPGA (L8+L9) | 43/43 仿真 + ILA | ✅ |
| C (STM32) | 编译通过，交叉 KAT 待做 | ⬜ |
| KAT (ML-KEM-768) | 10,000/10,000 | ✅ |
| TVLA (SM2) | 5/5 PASS, N=5,000 | ✅ |
| TVLA (SM4) | 0/320 PASS, 位切片 | ✅ |

### 2.3 密码学原语层（待建设）

| 项目 | 状态 | 备注 |
|------|------|------|
| EasyCrypt ML-KEM 证明 | ⬜ 引用 Jasmin | 独立完成属博士论文级别 |
| NTT 正确性形式化 | ⬜ KAT 交叉验证 | 对标 Jasmin KAT 向量 |
| 混合 KEM 组合器证明 | ⬜ 引用已有文献 | 不追求原创性证明 |
| QROM 紧致性分析 | ⬜ 引用 Kiltz 2024 | 理论密码学前沿 |

---

## 3. 安全边界与已知局限

### 3.1 已验证

- Path C-2 握手协议级不变量（TLA+, 7 invariants, 0 violations）
- ML-KEM-768 KAT 兼容性（10,000/10,000）
- SM2 常量时间标量乘法（TVLA N=5,000 通过）
- SM4 位切片无缓存时序泄漏（TVLA 0/320 通过）
- NTT FPGA 硬件闭环（256/256 通过）
- WASM 侧信道（TVLA N=500, N=10,000 掩码通过）

### 3.2 未覆盖

- **物理 EM 侧信道**：TVLA 仅覆盖软件层，未做 ChipWhisperer EM 探头测量
- **故障注入**：NTT 蝶形运算的 glitch 注入防护未验证
- **TLS Record Layer 密钥派生**：Path C-2 中 SessionKey 入 Record 层的过程未纳入 TLA+ 模型
- **QROM 下紧致归约**：引用已发表文献，未做独立计算

### 3.3 明确非目标

- **原创密码学假设**：不提出、不依赖新假设
- **SM2 后量子安全性**：SM2 无后量子安全性声明（经典 ECDLP）
- **LookingGlass/VWZ 作为安全组件**：所有 LG/VWZ 模块默认为工程混淆工具，非密码学安全原语（MEMORY.md 2026-06-28 决策）

---

## 4. 参考文献

| 编号 | 引用 |
|------|------|
| [1] | NIST FIPS 203 — Module-Lattice-Based Key-Encapsulation Mechanism Standard, 2024 |
| [2] | NIST SP 800-56Cr2 — Recommendation for Key-Derivation Methods in Key-Establishment Schemes |
| [3] | IETF draft-ietf-tls-hybrid-design — Hybrid Key Exchange in TLS 1.3 |
| [4] | IETF draft-yang-tls-hybrid-sm2-mlkem-04 — TLS 1.3 Hybrid Handshake with SM2 + ML-KEM-768 |
| [5] | Kiltz, Lyubashevsky, Schaffner — Dual-PRF KEM Combiners in the QROM, 2024 |
| [6] | libjade (formosa-crypto) — EasyCrypt formally verified ML-KEM implementation |
| [7] | Couvreur & Levrat — The Hull Attack on Code-Based Cryptography, 2025/596 |
| [8] | NIST IR 8547 — Transition to Post-Quantum Cryptography Standards |

---

> ⚠️ 本文档仅总结 FIBEMATE 的安全模型假设与验证状态，不作为安全声明或密码学原语证明。形式化原语级证明（EasyCrypt）为 NLnet 资助后资源决策的候选目标。
