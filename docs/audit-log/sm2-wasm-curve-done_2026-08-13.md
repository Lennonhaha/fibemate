# SM2 WASM 重写 — 阶段三：曲线点运算层完成

## 时间
2026-08-13（D-18）

## 本段核心成果

### 曲线点运算层（`wasm-sm2/assembly/curve.ts`）验证通过

- **mulGX / mulGY**：标量乘法 k·G，30 组随机标量全部 0 失败（对比 BigInt 参考实现）
- **2G 验证**：x = `56cefd60d7c87c000d58ef57fa73ba4d9c0dfa08c08a7331495c2e1da3f2bd52`（精确匹配）

### 关键实现

1. **Jacobian 坐标点加倍**（含 a·Z⁴ 项，a=-3）：
   - S = 4·X·Y²，M = 3X² - 3Z⁴（a=-3 时 3(X²-Z⁴)）
   - X3 = M² - 2S，Y3 = M(S-X3) - 8Y⁴，Z3 = 2YZ

2. **Jacobian 坐标点加法**（标准公式）：
   - U1=X1·Z2², U2=X2·Z1², S1=Y1·Z2³, S2=Y2·Z1³
   - H=U2-U1, R=S2-S1
   - X3 = R²-H³-2·U1·H², Y3 = R(U1H²-X3)-S1·H³, Z3 = H·Z1·Z2

3. **Montgomery Ladder 标量乘法**（恒定时间）：
   - 256 轮固定迭代，每轮 R0/R1 用 constant-time select 交换
   - 无穷远点 (1,1,0) 处理用 ctSelectFe 恒定时间选择

4. **Fermat 求逆**（恒定 256 轮平方乘，模 P-2）

### 三个关键 bug 教训

1. **GX_LIMBS[1] 硬编码错误**：`0x5A458933` → `0x715A4589`。之前手写 limb 时把字节位错位了。教训：**曲线常量必须用脚本从 BigInt 十六进制值精确分解 limb，不能手写**。

2. **PM2_LIMBS（P-2）limb[2]/limb[3] 对调**：`0xFFFFFFFF, 0x00000000` → `0x00000000, 0xFFFFFFFF`。沿用了旧 sm2_field.ts 的 pLimb 对调 bug。

3. **参考实现的 inv() 函数 bug**：之前"30/30 全失败"是我 BigInt 参考实现里扩展欧几里得算法变量命名混乱（u/v/b 互换）导致返回错误逆元，**不是 WASM 的问题**。用标准扩展欧几里得（t/newt/r/newr）重写后，WASM 曲线层一次通过。教训：**debug 前先验证参考实现本身正确**。

### 常量精确值（全部用 node 脚本从 BigInt 分解，非手写）

| 常量 | 值 |
|------|-----|
| GX limbs | 0x334c74c7, 0x715a4589, 0xf2660be1, 0x8fe30bbf, 0x6a39c994, 0x5f990446, 0x1f198119, 0x32c4ae2c |
| GY limbs | 0x2139f0a0, 0x02df32e5, 0xc62a4740, 0xd0a9877c, 0x6b692153, 0x59bdcee3, 0xf4f6779c, 0xbc3736a2 |
| A limbs | 0xfffffffc, 0xffffffff, 0x0, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xfffffffe |
| P-2 limbs | 0xfffffffd, 0xffffffff, 0x0, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xfffffffe |

## 已完成文件

- `wasm-sm2/assembly/field.ts`（5849B）：域运算层，montMul/toMontP/fromMontP/feAddP/feSubP/montMulN，10 万组 0 失败
- `wasm-sm2/assembly/curve.ts`（约 6200B）：曲线点运算层，mulGX/mulGY/mk，30 组 0 失败

## 下一步

1. SM3 哈希（AssemblyScript，从 JS 参考移植）
2. SM2 签名/验签（签名公式 + SM3 + ZA 计算）
3. SM2 加解密（KDF + SM3）
4. KAT 验证（packages/sm2-ref/test/kat/sm2-KAT.json 100 条）
5. JS↔WASM 交叉验证 + TVLA 侧信道测试
