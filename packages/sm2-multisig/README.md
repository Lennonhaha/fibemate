# @fibemate/sm2-multisig

**SM2 广播多签名教学包** —— 基于宁建廷等（2024）方案的教学实现。

> Yuchen Xiao, Lei Zhang, Yafang Yang, Wei Wu, **Jianting Ning**, Xinyi Huang.
> *Provably Secure Multi-Signature Scheme Based on the Standard SM2 Signature
> Scheme*. Computer Standards & Interfaces 89:103819, 2024.

## 协议（教学版，3 轮广播多签名）

```
R1  每个签名者 i 生成随机 nonce 承诺 R_i = k_i·G 并广播
R2  所有人计算聚合 nonce 点 R = Σ R_i，r = R.x + e (e = SM3(ZA(P*)||M))
    各自计算响应 s_i = k_i - r·d_i (mod n)
R3  聚合者求和 s = Σ s_i → 多签名 (r, s)
验证  R' = s·G + r·P*（P* = Σ P_i 为聚合公钥），验 (R'.x + e) ≡ r
```

- **单签名者退化**：n=1 时 P* = P₁，退化为自洽的 SM2 风格签名（见下方边界说明）
- **篡改拒绝**：消息/签名/ID 任一改动验签失败
- **ID 绑定**：ZA 包含签名者 ID（GB/T 32918.2 标准做法），不同 ID 验签失败

## 边界说明（教学诚实声明）

本包演示**聚合原理**（共享 nonce + 线性响应聚合 + 聚合公钥验证）。
宁教授论文的**完整可证明安全构造**还包含 `(1+d)⁻¹` 因子，使单签名者
**精确退化**为标准 SM2 签名（EUF-CMA / bijective ROM / ECDLP），
并给出了形式化安全证明。生产使用请参照论文原方案或使用标准 SM2
单签名实现（见 `packages/sm2-ref`）。

## 运行

```bash
node test/sm2-multisig.test.js
```

覆盖：SM3 KAT、3 方聚合签名/验证/篡改拒绝、n=1 退化、2 方 + ID 绑定。
