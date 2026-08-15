# SM2 WASM 重写 — 阶段四：SM3 哈希 + SM2 签名/验签层完成

## 时间
2026-08-13（D-18）

## 本段核心成果

### SM3 哈希（`wasm-sm2/assembly/sm3.ts`）
- 完整 GB/T 32905-2016 实现：IV 常量、消息扩展 W[68]/W1[64]、64 轮压缩
- **标准向量全部精确匹配**：
  - `SM3('abc')` = `66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0` ✓
  - `SM3('abcd'×16)` = `debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732` ✓
  - 空串 `1ab21d8355cfa17f8e61194831e81a8f22bec8c728fefb747ed035eb5082aa2b` ✓

### SM2 签名/验签核心（`wasm-sm2/assembly/sm2.ts`）
- `sm2SignCore(dA, e, k)` → r, s：完整签名公式 `s = (1+dA)⁻¹·(k - r·dA) mod N`
- `sm2VerifyCore(px, py, e, r, s)` → 0/1：`t=(r+s) mod N`、`Q=sG+tPA`、`R=(e+x1) mod N == r`
- **端到端验证 0/10 失败**（含签名正确性 + 验签闭合）
- 注意：k（随机数）由 JS 侧生成传入（WASM 无安全随机源，避免 Math.random）

### 关键 bug 修复
1. **R² mod N 常量首字节错误**：`0x8C114F20` → `0x7C114F20`。导致 feInvN 全失败（50/50）。这是手写常量时的笔误，教训同曲线层：**常量必须用脚本从 BigInt 精确分解，不能手写**。同时修正了 field.ts 里同源的 R2_N 常量错误（之前 montMulN 测试通过是因为 R2_N 只用在 toMont 转换，而 toMontP 测试可能没覆盖到 N 域的 R2）。

### 新增 curve.ts 导出
- `pointMulX/pointMulY(k, px, py)`：通用标量乘法（任意基点）
- `feInvN(a)`：mod N Fermat 求逆（恒定 256 轮）
- 已验证：feInvN 0/50 失败、pointMulX vs mulGX 0/20 一致

## 已完成文件
- `wasm-sm2/assembly/field.ts`：域运算（montMul 锁死 + R2_N 常量修正）
- `wasm-sm2/assembly/curve.ts`：曲线点运算 + 通用点乘 + mod N 求逆
- `wasm-sm2/assembly/sm3.ts`：SM3 哈希（标准向量全过）
- `wasm-sm2/assembly/sm2.ts`：SM2 签名/验签核心

## 下一步
1. **ZA 计算**：`ZA = SM3(ENTL || ID || A || B || GX || GY || PX || PY)`（签名前需要）
2. **KAT 100/100 验证**：`packages/sm2-ref/test/kat/sm2-KAT.json`
3. **加解密**（KDF + SM3）
4. JS↔WASM 交叉验证 + TVLA 侧信道测试
5. 集成到 sm2-ref 包

## 关键架构决策
- **随机数 k 由 JS 侧生成**：WASM 无 crypto.getRandomValues，不能自己生成 k。这样签名函数保持确定性（给定 dA/e/k 输入输出唯一），便于 KAT 验证和 TVLA 侧信道测试。
- **ZA 与 e 的构造在 JS 侧或独立函数**：签名核心只接收 e（已经是 SM3(ZA||M) 结果），ZA 组装（含用户 ID、ENTL 长度前缀）作为独立函数。
