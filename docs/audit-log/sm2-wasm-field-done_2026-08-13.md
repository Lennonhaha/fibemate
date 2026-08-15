# SM2 WASM 重写 — 阶段二：域运算层完成（CIOS Montgomery 乘法彻底锁定）

## 时间
2026-08-13（D-18，距 8/31 开源 18 天）

## 本次核心成果

### CIOS Montgomery 乘法：从反复失败到彻底锁定

**最终正确实现**（`wasm-sm2/assembly/field.ts` 的 `montMul`）：

```typescript
function montMul(a, b, m, c, np) {
  const t = new StaticArray<u64>(9); // t[0..8]，t[8] 可到 2^33
  for (let i = 0; i < 8; i++) {
    const ai = a[i];
    // 阶段1：t += a[i] * b
    let carry = 0;
    for (let j = 0; j < 8; j++) {
      const cur = t[j] + ai * b[j] + carry;  // cur < 2^64，u64 安全
      t[j] = cur & MASK32;
      carry = cur >> 32;
    }
    t[8] += carry;
    const mm = (t[0] * np) & MASK32;
    // 阶段2：t += mm * m
    let carry2 = 0;
    for (let j = 0; j < 8; j++) {
      const cur2 = t[j] + mm * m[j] + carry2;
      t[j] = cur2 & MASK32;
      carry2 = cur2 >> 32;
    }
    t[8] += carry2;
    for (let j = 0; j < 8; j++) t[j] = t[j + 1]; // 右移一个 limb
    t[8] = 0;
  }
  // final reduction ...
}
```

### 三个关键 bug 根因（按发现顺序）

1. **t[8] 溢出位被 mask 掉**：montV2 结构的 t[8] 会累积到 **2^33**（实测 max = 8546781914），之前所有 u32 版本失败都是把 t[8] 用 `& MASK32` 截断了。**解决：t 数组全部用 u64。**

2. **final reduction 的 borrow 减法没 mask**：borrow 链减法中 `t[j] = t[j] - mv` 在 u64 回绕后得到 2^64 级别的数，必须 `& MASK32` 取低 32 位。之前 BigInt 版用了 `& MASK32` 但 AssemblyScript 版漏了。

3. **t[7] 的 33 位溢出**：右移后 t[7] 承接了 t[8] 的 2^33 溢出位，final reduction 必须分离 hi bit（`t[7] >> 32`）单独处理 257 位场景。

### final reduction 正确方案（三分支）

- 分离 `hi = t[7] >> 32`（0 或 1）
- 若 hi=1：值 = 2^256 + t，减 M → 结果 = (2^256 - M) + t（用预存常量 C = 2^256 - M）
- 若 hi=0：值 = t（256 位），条件减 M（borrow 链），若 borrow 则加回 M

### 关键常量（已精确算出并验证）

| 常量 | 值 |
|------|-----|
| p' = -p⁻¹ mod 2³² | 0x1（P ≡ -1 mod 2³² 特例，极高效） |
| n' = -n⁻¹ mod 2³² | 0x72350975 |
| R² mod p（小端 limb） | 3, 2, FFFFFFFF, 2, 1, 1, 2, 4 |
| R² mod n（小端 limb） | 8C114F20, 901192AF, DE6FA2FA, 3464504A, 3AFFE0D4, 620FC84C, A22B3D3B, 1EB5E412 |
| 2^256 - P | 1, 0, FFFFFFFF, 0, 0, 0, 0, 1 |
| 2^256 - N | C62ABEDD, AC440BF6, DE39FAD4, 8DFC2094, 0, 0, 0, 1 |

### 验证结果

- `montMulP` / `montMulN`：各 **10 万组随机 + 边界 (p-1)² 全部 0 失败**
- `toMontP` / `fromMontP` 往返：2000 组 0 失败
- `feSubP`：2000 组 0 失败
- u64 语义验证：`u32×u32→u64` 不截断、`>> 32` 逻辑右移、`+` 溢出、`& MASK32` 全部正确

### 上界分析（保证 u64 不溢出）

- `cur`（t[j] + ai*b[j] + carry）实测 max = 18446740417126282760 < 2^64 ✓
- `t[j]` after shift 实测 max = 8504497693 ≈ 2^33，故 t 用 u64
- `ai*b[j]` max = 18446740410102448980 ≈ 2^64 - 2^32

## 已完成的文件

- `wasm-sm2/assembly/field.ts`（5480B）：域运算层，含 montMul/toMontP/fromMontP/feAddP/feSubP/montMulN，全部验证通过
- `wasm-sm2/assembly/curve.ts`（初稿）：曲线点运算框架，feInvP（Fermat）已写但需完善

## 工具链状态

- AssemblyScript 0.28.20（wasm-sm2/ 本地 devDependency）
- 编译命令：`npx asc assembly/field.ts --target release --outFile build/field.wasm` → 2445B WASM

## 下一步

1. 完善 curve.ts：Jacobian 点加法/倍点、Montgomery Ladder 标量乘法（参照 JS v1.3 恒定时间）
2. 签名/验签（SM2 签名公式 + SM3 哈希）
3. KAT 验证（packages/sm2-ref/test/kat/sm2-KAT.json 100 条）+ JS↔WASM 交叉验证
4. TVLA 侧信道测试

## 教训

- CIOS 这类进位敏感的 limb 运算，**必须先在 BigInt 里逐 limb 对比 debug**（用 `asUintN(64)` 而非 `asUintN(32)` 组合），确定算法正确后再翻译
- u64 回绕后的减法结果必须 `& MASK32`，这是 BigInt 模拟和真实 u64 的关键差异
- 测试脚本的 limb 组合方式（32 位 vs 64 位截断）会导致「算法正确但测试失败」的假象
