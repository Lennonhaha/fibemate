# SM2 WASM 重写 — 阶段一：底层域运算算法锁定

## 时间
2026-08-13（D-18，距 8/31 开源 18 天）

## 任务背景
用户明确要求「SM2 WASM 重写 现在重写」，目标是把纯 JS 的 SM2 实现（`www/crypto/sm2-bigint-ec.js`，当前 v1.4 wNAF 版）移植为 AssemblyScript → WASM，以提升性能并保持恒定时间。

## 关键结论

### 1. 现有代码全部作废重写
- `wasm-sm2/assembly/sm2_field.ts`（Phase 0 产物）含 Python 语法错误（`elif`）、REDC 不完整、invMod 空 stub、**pLimb 本身写错**（i=6 应为 0xFFFFFFFF 写成 0xFFFFFFFE，且 i=1/i=2 对调）
- `index.ts` 根本没 import sm2_field.ts
- 结论：不基于任何现有坏代码，从头重写

### 2. 算法基准选择
- JS v1.4 用的是 wNAF（有密钥依赖分支，非恒定时间）
- JS v1.3 用 Montgomery Ladder（恒定时间，三重防护：scalar masking + projective randomization + 320 轮固定 double+add）
- **重写 WASM 的正确基准是 v1.3 的 Montgomery Ladder，而非 v1.4 的 wNAF**

### 3. 曲线参数与 Montgomery 常量（已精确锁定并验证）

| 常量 | 值 |
|------|-----|
| P（域模数） | 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF |
| N（群阶） | 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123 |
| A | 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC |
| B | 0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93 |
| GX | 0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7 |
| GY（非标准值） | 0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0 |
| **p'（= -p⁻¹ mod 2³²）** | **0x1**（p ≡ -1 mod 2³² 特例，极高效） |
| **n'（= -n⁻¹ mod 2³²）** | **0x72350975** |
| R² mod p | 0x400000002000000010000000100000002FFFFFFFF0000000200000003 |
| R² mod n | 0x1EB5E412A22B3D3B620FC84C3AFFE0D43464504ADE6FA2FA901192AF7C114F20 |

### 4. CIOS Montgomery 乘法（核心突破）

**多次失败后锁定的正确形态**：
- `t[0..8]` 全部用 u64（不 mask 到 32 位）
- `carry` 用 u64
- **关键 bug 根因**：`t[8]` 在右移前会累积到 **2^33**（实测 max = 8504497693 ≈ 2^33），之前所有版本失败都是把 `t[8]` 用 `& MASK32` mask 掉了溢出位
- `cur`（t[j] + ai*bj + carry）实测 max = 18446740417126282760 < 2^64，**u64 安全不溢出**

**验证结果**：mod p（p'=1）和 mod n（n'=0x72350975）各 **10 万组随机 + 边界 (p-1)² 全部 0 失败**。

**算法伪代码（可精确翻译 AssemblyScript）**：
```
t[0..8] = 0 (u64)
for i in 0..7:
    ai = a[i]
    carry = 0
    for j in 0..7:
        cur = t[j] + ai*b[j] + carry
        t[j] = cur & 0xFFFFFFFF   // 低 32 位
        carry = cur >> 32
    t[8] += carry
    m = (t[0] * n') & 0xFFFFFFFF
    carry2 = 0
    for j in 0..7:
        cur = t[j] + m*mod[j] + carry2
        t[j] = cur & 0xFFFFFFFF
        carry2 = cur >> 32
    t[8] += carry2
    for j in 0..7: t[j] = t[j+1]   // 右移一个 limb
    t[8] = 0
结果 = t[0..7]；若 >= 模数则减一次
```

### 5. AssemblyScript u64 乘法验证
- `u32×u32→u64` 乘法不截断（0xFFFFFFFF² = 0xFFFFFFFE00000001 正确）
- `carry = cur >> 32` 正确
- `i64` 算术右移正确
- JS 端返回的是 i64（有符号 BigInt），但位模式正确（-8589934591 的位模式 = 0xFFFFFFFE00000001）

### 6. 测试验证合同（已与用户确认）
- 功能一致性：KAT 100/100、JS↔WASM 千次交叉、确定性 800/800、序列化 10/10
- 安全侧信道：TVLA |t|<4.5、性能 2-3×
- 集成回归：npm test 199/199、三平台 node-gyp

## 工具链状态
- AssemblyScript 0.28.20 已装（wasm-sm2/ 本地 devDependency）
- `wasm-sm2/package.json` 已建（445B，绕过根 better-sqlite3 node-gyp）
- `wasm-sm2/asconfig.json` 已建（626B，去掉 extends）

## 下一步
1. 把 CIOS 翻译成 AssemblyScript field.ts
2. 域运算完整实现（toMont/fromMont/add/sub/mul/inv）
3. Jacobian 点运算 + Montgomery Ladder 标量乘法
4. 签名/验证
5. KAT 验证 + JS↔WASM 交叉

## 文件
- 临时调试脚本（_sm2-*.js 系列，未跟踪）
- wasm-sm2/assembly/probe.ts、mul-test.ts（工具链验证）
