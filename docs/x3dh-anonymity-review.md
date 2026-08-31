# X3DH Handshake Anonymity & Key-Agreement Review

**FIBEMATE X3DH + SPK 独立化握手的匿名性与密钥协商安全审查**
日期：2026-08-31 · 关联文献：Ning et al., *Anonymous Authentication and Key Agreement, Revisited* (ePrint 2025/1986)

---

## 1. 审查对象

FIBEMATE 当前握手协议（tauri 2c3b021 + 主仓库同步）：

```
Alice                                   Bob
  │ 1. bundle 获取（服务器返回 IK_B, ISK_B, SPK_B, sig）  │
  │ 2. 验签：ISK_B 验证 SPK_B 的 ML-DSA-65 签名          │
  │ 3. X3DH: DH1=DH(IK_A,SPK_B) DH2=DH(EK_A,IK_B)       │
  │          DH3=DH(EK_A,SPK_B) → HKDF → SS             │
  │ 4. x3dh_init_rust {IK_A, EK_A} ────────────────────► │
  │ 5.                               x3dh_respond(SS_B)  │
  │ ◄───────────────── x3dh_accept_rust {SPK_B, session} │
  │ 6. Double Ratchet 开始                                │
```

## 2. 按 Ning 2025 框架的审查维度

### 2.1 匿名性（Anonymity）——服务器能否关联通信双方？

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 握手消息是否含可关联标识 | 🟡 **部分匿名** | x3dh_init_rust 携带 IK_A（公钥，与用户强绑定）——服务器可关联"谁在和谁握手" |
| 元数据（时间/IP） | 🟡 未混淆 | WS 连接本身暴露双方在线状态与时间关系 |
| SPK 独立化的匿名增益 | ✅ 有 | 独立 SPK + 签名使 Bob 的**短期密钥**可轮换，降低长期指纹；但 IK 仍是稳定匿名标识 |

**判定**：FIBEMATE 是**认证型**握手（显式身份），非匿名握手——这与 Ning 2025 讨论的"匿名认证"（用户身份对服务器隐藏）不同。若需要服务器不可关联，需引入匿名凭据（如群签名/盲签名，HHGS 路线）。**当前设计是合理取舍**（教学/参考项目优先可审计性），但应明确写入安全模型。

### 2.2 密钥确认（Key Confirmation）

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 双方是否确认共享同一 SS | ✅ 隐式确认 | Double Ratchet 第一条消息的 AEAD 认证成功 = 密钥一致（Signal 标准做法） |
| 是否有显式 key-confirmation | ❌ 无 | 第一条消息若解密失败仅报错，无重协商提示 |

**判定**：隐式确认足够；建议在 dr_decrypt 首次失败时触发"重新握手"提示（工程改进，非安全缺陷）。

### 2.3 拒绝服务面（DoS）

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 未认证工作 | 🟡 中等 | 服务器仅 authMiddleware（登录态），任意登录用户可对任意 userId 发起 bundle 获取——**可被用于枚举/探测**（需 rate-limit） |
| SPK 签名验证 | ✅ 已防护 | x3dh_initiate 验签失败拒绝（2c3b021），防 bundle 篡改/伪造 SPK |
| shared_secrets 内存池 | 🟡 无上限 | 反复 x3dh_initiate 不 dr_init 会堆积（tauri 侧） |

### 2.4 后量子储备（PQC Alignment）

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 签名层 | ✅ ML-DSA-65（FIPS 204） | SPK 签名已量子安全 |
| DH 层 | 🟡 X25519（经典） | 握手 DH 仍是经典 ECDH；主仓库另有应用层 SM2+ML-KEM-768 混合 KEX（IANA #4590）作为 PQC 补充 |
| 建议 | — | 若需全量子安全握手：X25519 → X25519MLKEM768（混合）或直接 ML-KEM 封装 |

## 3. 结论与改进清单

| # | 发现 | 严重度 | 建议 |
|---|------|--------|------|
| 1 | 握手非匿名（IK 明文随握手传输） | 信息性 | 在 SECURITY.md 明确"认证型握手"定位；若未来需匿名场景走 HHGS 群签名路线 |
| 2 | 无显式 key-confirmation | 低 | dr_decrypt 首次失败提示重新握手 |
| 3 | bundle 获取无 rate-limit | 中 | /api/users/:id/keys 增加限流（与 login 一致） |
| 4 | shared_secrets 无上限/TTL | 低 | tauri 侧加 TTL（10min）与容量上限 |
| 5 | DH 层经典 X25519 | 中（按定位） | 文档注明：全 PQC 握手需 ML-KEM 封装层；现有混合 KEX 是应用层方案 |

**总体评价**：SPK 独立化（ML-DSA-65 签名 + 独立 X25519 SPK）修复了原 SPK=IK 的结构性缺陷，握手在**认证性、防篡改、可轮换**三个维度达到教学参考项目的合理水平；匿名性为设计取舍而非缺陷。
