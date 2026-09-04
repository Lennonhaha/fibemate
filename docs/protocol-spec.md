# FIBEMATE Protocol Specification

> FIBEMATE 端到端加密协议规范 · 正式版 v1.0 · 2026-09-03
> 范围：主仓库 Web/Node 实现（X3DH + Double Ratchet + PQ 混合加固）。桌面端 Rust 规范见 [fibemate-tauri](https://github.com/Lennonhaha/fibemate-tauri)。

---

## 1. 目的与定位 (Purpose)

本文档是 FIBEMATE 消息加密协议的**规范性说明（normative spec）**，描述 Web 端 `www/` 与后端 `backend/` 实际运行的加密协议：消息如何完成密钥协商、会话建立、消息加密、密钥滚动与前向保密。

FIBEMATE 不重造密码学原语：所有底层算法（ML-KEM-768、X25519/P-256、AES-256-GCM、HKDF-SHA256、SM2/SM3/SM4、ML-DSA-65）均采用公开标准实现。本文档规范的是**协议组合层**——原语如何被编排为安全的端到端加密通道。

### 1.1 关联文档（先读这些）

| 文档 | 内容 |
|------|------|
| [deep-dive-01-double-ratchet-pq.md](./deep-dive-01-double-ratchet-pq.md) | PQ 混合加固设计详解（为何/如何用 ML-KEM 加固双棘轮） |
| [x3dh-anonymity-review.md](./x3dh-anonymity-review.md) | X3DH 匿名性自查（宁建廷 2025 匿名认证框架对照审查） |
| [THREAT_MODEL.md](./THREAT_MODEL.md) | 敌手模型与信任边界 |
| [defense-in-depth-design.md](./defense-in-depth-design.md) | 纵深防御整体设计 |
| [hybrid-kex-design.md](./hybrid-kex-design.md) | 混合密钥交换设计比较 |
| [security-model.md](./security-model.md) | 安全模型陈述 |
| [security-limitations.md](./security-limitations.md) | 已知安全局限（诚实地声明） |
| `docs/tla/C2.tla` / `docs/tla/OPK.tla` | 协议核心状态机的 TLA+ 模型（L4 形式化验证） |
| `docs/tla/formal-verification-L4_2026-07-14.md` | L4 验证报告：7 条不变式全部通过 |

### 1.2 术语

- **SPK** — Signed Pre-Key（签名预密钥）
- **OPK** — One-Time Pre-Key（一次性预密钥）
- **IK** — Identity Key（身份密钥，长期）
- **EK** — Ephemeral Key（临时密钥，单次会话）
- **DR** — Double Ratchet（双棘轮）
- **PQ** — Post-Quantum（后量子）
- **KEM** — Key Encapsulation Mechanism（密钥封装机制）
- **FS / PCS** — Forward Secrecy / Post-Compromise Security（前向保密 / 泄露后自愈）

---

## 2. 加密原语与参数 (Primitives & Parameters)

### 2.1 Web/Node 端（本文档范围）

| 用途 | 原语 | 参数 | 说明 |
|------|------|------|------|
| 身份密钥 IK | X25519（经典）/ SM2 P-256 | 32B / 65B | 长寿命，每用户一对待长期 |
| 签名预密钥 SPK | X25519 | 32B | 周期轮换，签名绑定 IK |
| 一次性预密钥 OPK | X25519 | 32B | 一次性消耗，用完即焚 |
| 临时密钥 EK | X25519 | 32B | 每条消息/每次握手新生成 |
| PQ 密钥封装 | **ML-KEM-768**（FIPS 203） | pk 1184B / ct 1088B / ss 32B | PQ 混合加固核心 |
| PQ 签名 | ML-DSA-65（FIPS 204） | 桌面端 SPK 签名 | Rust 线 |
| 国密套件 | SM2 / SM3 / SM4 | 参考实现 | 中国商用密码合规 |
| AEAD | AES-256-GCM | key 32B / nonce 12B | 消息加密 |
| KDF | HKDF-SHA256（RFC 5869） | — | 所有密钥派生 |
| 哈希 | SHA-256 / SM3 | — | 指纹、链式棘轮 |

### 2.2 PQ 混合原则

ML-KEM 只参与**根密钥建立与周期性刷新**（密钥派生层），不参与每消息棘轮（消息层保持经典 DH 以兼容与性能）。这样设计使：
- 每消息前向保密（经典安全）保持不变；
- 根密钥的量子安全由 ML-KEM-768 提供（抗 harvest-now-decrypt-later）。

```
┌──────────────────────────────────────────────┐
│  应用消息层：P-256/X25519 DH 棘轮 (65B hdr)    │  ← 每消息，不变
├──────────────────────────────────────────────┤
│  根密钥刷新层：ML-KEM-768 encaps/decaps        │  ← 周期性 (每 100 条) / 握手
├──────────────────────────────────────────────┤
│  会话建立：X3DH (经典) ⊕ ML-KEM (PQ) → rootKey │  ← 混合握手
│            └─→ HKDF-SHA256                     │
└──────────────────────────────────────────────┘
```

---

## 3. 密钥生命周期 (Key Lifecycle)

### 3.1 身份与长期密钥

1. **注册**：客户端生成 IK 对 + SPK 对；SPK 由 IK 私钥签名（`SPK_SIGN = Sign(IK_sk, SPK_pk)`），防替换攻击。
2. **上传**：IK_pk + SPK_pk + SPK_SIGN + OPK 包 → 服务器密钥簿（`/api/auth/update-keys`）。
3. **轮换**：SPK 定期轮换；OPK 用后即焚，低水位自动补仓。
4. **指纹**：`SafetyNumber = f(IK_A, IK_B, ...)` 双方带外比对，防 MITM（实现见 `www/crypto/`）。

### 3.2 会话密钥

每会话独立派生 `rootKey → chainKey → messageKey` 三级结构（见 §5），会话结束即销毁。

---

## 4. 握手协议 (Handshake)

### 4.1 经典 X3DH 流程

参考 Signal X3DH（SPK 独立化修正版，修复 DH2=DH3 退化）：

```
Alice                                    Bob (服务器密钥簿)
  │ 1. 拉取 Bob: IK_B, SPK_B, SIGN, OPK_B  │
  │←──────────────────────────────────────│
  │ 2. 生成临时 EK_A                        │
  │ 3. DH1 = DH(IK_A, SPK_B)   [身份-预钥]  │
  │    DH2 = DH(EK_A, IK_B)    [临时-身份]  │
  │    DH3 = DH(EK_A, SPK_B)   [临时-预钥]  │
  │    DH4 = DH(EK_A, OPK_B)   [临时-一次]  │
  │ 4. SK = KDF(DH1‖DH2‖DH3‖DH4)           │
  │ 5. 发送初始消息 (IK_A, EK_A, OPK_id)    │
  │───────────────────────────────────────→│
  │                            Bob: 对侧重建 4 个 DH → 同 SK
```

**SPK 独立化**：SPK 使用独立 X25519 密钥对并由 IK 签名（非 Signal 早期 SPK=IK 的退化设计），杜绝 DH2=DH3 时的身份混淆，匿名性优于原版（详见 `x3dh-anonymity-review.md`）。

### 4.2 PQ 混合扩展（Hybrid X3DH）

```
Alice                                          Bob
  │ 1. 拉取 Bob 公钥（含 ML-KEM pk_B）          │
  │←──────────────────────────────────────────│
  │ 2. EK_A = X25519 临时                        │
  │    (ct, pqSS) = ML-KEM.Encaps(pk_B)        │  ct: 1088B, pqSS: 32B
  │ 3. DH1..DH4 同 4.1                          │
  │ 4. SK = HKDF(sm2SS ⊕ pqSS, ctx)            │  ← 混合两个共享秘密
  │ 5. 发送 initMessage (含 ct)                 │
  │───────────────────────────────────────────→│
  │                              Bob: ML-KEM.Decaps(sk_B, ct) → pqSS
  │                                  再重建 DH1..DH4 → 同 SK
```

**安全性**：攻击者必须同时破解椭圆曲线 DH **和** ML-KEM-768 才能恢复会话密钥（hybrid security）。即使量子计算机到来，只要 ML-KEM-768 未被攻破，历史会话仍安全。

**降级**：ML-KEM 模块不可用时优雅降级为纯 X3DH（`www/crypto/algorithm-resolver.js` 运行时决议）。

### 4.3 OPK 子协议（一次性预密钥）

`docs/tla/OPK.tla` 形式化建模，6 条不变式（O1–O6）全部通过（TLC）：

| 不变式 | 内容 |
|--------|------|
| O1 | 同一 OPK 不可二次消耗（NoDoubleConsume） |
| O2 | 每次消耗必然记录（ConsumedRecorded） |
| O3 | 可用/已消耗计数恒正确（CountCorrect） |
| O4 | 已消耗 OPK 不可复用（ConsumedNotReusable） |
| O5 | 只能从可用池消耗（ConsumeFromAvailable） |
| O6 | 消耗量有界（ConsumeBound） |

协议流程：服务器按用户签发 OPK 包（每用户上限 MaxOPKPerUser）→ 握手方按 id 拉取并消耗 → 服务器校验一次性（O1/O4），用完即焚，低水位自动补仓。

---

## 5. 双棘轮 (Double Ratchet)

### 5.1 状态

```
会话状态:
  rootKey   (32B) — 棘轮根，每次 DH ratchet 更新
  sendChain / recvChain  — 发送/接收链 (chainKey)
  DHs (我方 ratchet 公钥), DHr (对端 ratchet 公钥)
  PN, Ns, Nr — 消息序号
  skippedKeys — 跳钥池 (乱序容忍, MAX_SKIP=1000)
```

### 5.2 棘轮推进

```
每收到对端新 ratchet 公钥 (DHr 更新):
  rootKey, chainKey = KDF_RK(rootKey, DH(DHs, DHr))
  新消息: msgKey = KDF_CK(chainKey); header 携带 DHs_pk

每 100 条消息（PQ 周期刷新）:
  (ct, pqSS) = ML-KEM.Encaps(pk_B)  →  rootKey = HKDF(rootKey, pqSS)
```

### 5.3 消息格式

```
明文:  [header ‖ ciphertext ‖ ad]
header: { dh_pk: 33B, pn: 4B, n: 4B, pq_ct?: 1088B }   // pq_ct 仅刷新消息携带
AEAD:  AES-256-GCM(key=msgKey, nonce=12B, ad=header)
```

### 5.4 乱序与重放

- 收到旧序号：先查跳钥池 `skippedKeys`（有序/乱序前进/后到旧 三路分支，见 `double-ratchet.js`）；
- 序号已消耗：**静默丢弃（None）**而非报错——重放消息不得让接收方暴露可区分行为（v3.22 silent-drop 修复）；
- 会话丢失：`trySessionRecovery` 自愈机制（10s 防抖重建会话）。

---

## 6. 形式化验证 (Formal Verification)

### 6.1 C2 模型（Hybrid 握手状态机）

`docs/tla/C2.tla` — SM2 + ML-KEM-768 混合密钥交换，2 并行会话，TLC 模型检查。

```
Client: init → sentCH → rcvdSK → active → closing
Server: waiting → sentSH → sentSK → active → closing
消息: ClientHello → ServerHello → ClientKeyFinish → Finished
```

**7 条不变式全部通过**（TLC, 2026-07-14）：

| 不变式 | 内容 | 状态 |
|--------|------|------|
| TypeOK | 状态变量格式正确 | ✅ |
| K1 | Client active 前密钥必然已派生 | ✅ |
| K2 | Server 派生前提：两端密钥均已交换 | ✅ |
| K3 | 任意两会话派生密钥值永不相等 | ✅ |
| K3' | Server 侧 K3 同等保证 | ✅ |
| K4 | Active 前 tlsExporter 不明文出现在网络层 | ✅ |
| K5 | 会话关闭后密钥不可再派生 | ✅ |

运行命令：`java -cp tla2tools.jar tlc2.TLC C2 -workers 4 -deadlock`

### 6.2 OPK 模型

`docs/tla/OPK.tla` — 一次性预密钥消耗协议状态机（3 用户 × 每用户 5 OPK），验证 6 条不变式 O1–O6（见 §4.3）：同批次 OPK 不可二次使用、消耗记录完备、计数一致、可用池约束。`CHECK_DEADLOCK TRUE`。

---

## 7. 安全属性汇总 (Security Properties)

| 属性 | 机制 | 状态 |
|------|------|------|
| 端到端加密 | X3DH + Double Ratchet | ✅ |
| 前向保密 FS | 每消息 DH ratchet + 消息链单向 KDF | ✅ |
| 泄露后自愈 PCS | 对端新 ratchet 公钥触发根棘轮 | ✅ |
| 抗量子（握手） | Hybrid X3DH (ML-KEM-768) | ✅ |
| 抗量子（会话） | PQ 周期刷新 (每 100 条) | ✅ |
| 重放保护 | 序号 + 跳钥池 + 静默丢弃 | ✅ |
| 身份认证 | IK 指纹 + SPK 签名绑定 | ✅ |
| 一次性前向保密 | OPK 消耗协议 | ✅ |
| 匿名性 | SPK 独立化修复（对照宁建廷 2025 框架） | ⚠️ 部分（见 x3dh-anonymity-review.md） |
| 形式化验证 | TLA+ (C2: 7 不变式, OPK: 单调性) | ✅ |

---

## 8. 已知局限与免责 (Limitations)

- **无第三方审计**：本实现未经独立安全审计，属工程验证/教学平台，不应直接用于生产机密通信。
- **无标准归约证明**：混合设计的"量子安全"依赖 ML-KEM-768 的标准安全性（NIST PQC 标准），但协议组合层无形式化安全归约（对比 Signal 的 ProVerif 验证与 hax 工具链）。
- **JS 侧仍含 P-256 WebCrypto 路径**：完整迁移至 X25519 的桌面端见 fibemate-tauri（Rust, x25519-dalek + rustpq）；Web 端 legacy 路径保留兼容。
- **跳钥池上限**：MAX_SKIP=1000，超过上限的极端乱序消息会丢失（设计取舍）。

---

## 9. 版本与维护 (Versioning)

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-09-03 | 正式规范发布（替代早期决策备忘） |

本文档与 `deep-dive-01-double-ratchet-pq.md`（设计详解）互补：本文档回答"协议是什么"，deep-dive 回答"为什么这样设计"。
