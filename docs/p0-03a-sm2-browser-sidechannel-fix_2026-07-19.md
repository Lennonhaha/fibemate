# P0-03a: SM2 侧信道加固 — 全平台 (Browser + Node.js)

**日期**: 2026-07-19  
**状态**: ✅ 已完成  
**文件**:
- `www/crypto/sm2-ec-browser.js` — 浏览器版（k-masking + Fermat modInv）
- `sm2-bigint-ec.js` — Node.js 版（k-masking + Fermat modInv）

---

## 一、审计发现（修复前）

### 1.1 浏览器版 — `www/crypto/sm2-ec-browser.js`

| # | 泄漏点 | 严重度 | 机制 |
|---|--------|--------|------|
| 1 | `sign()` ephemeral k 无 masking | 🔴 P0 | `k = randomBigInt(32) % SM2_N` 裸奔 |
| 2 | `extEuclidInv()` 变时长 | 🔴 P0 | `while (nr !== ZERO)` 迭代次数取决于输入 |
| 3 | `encrypt()` ephemeral k 无 masking | 🟡 P1 | ECDH 临时密钥泄漏 |
| 4 | 浏览器版从未 TVLA | 🔴 P0 | TVLA 仅 Node.js v1.3, 非实际部署版 |

### 1.2 Node.js 版 — `sm2-bigint-ec.js`

| # | 泄漏点 | 严重度 | 机制 |
|---|--------|--------|------|
| 5 | `sign()` ephemeral k 无 masking | 🔴 P0 | 同浏览器版 |
| 6 | `extEuclidInv()` 变时长 | 🔴 P0 | 同浏览器版，且被 TVLA 脚本直接引用 |
| 7 | `encrypt()` ephemeral k 无 masking | 🟡 P1 | 同浏览器版 |
| 8 | exports 中 `modInvExt: extEuclidInv` 暴露旧函数 | 🔴 P0 | 外泄变时长模逆给调用者 |

---

## 二、修复内容

### 2.1 sign() — k-masking（双平台）
```javascript
// 修复前:
k = randomBigInt(32) % SM2_N;
Q = pointMul(k, G);

// 修复后:
k = randomBigInt(32) % SM2_N;
const rK = randomBigInt(8);
const kMasked = rK === ZERO ? k : k + rK * SM2_N;
Q = pointMul(kMasked, G);
// kMasked ≡ k (mod N), pointMul 内部已有 scalar masking + projective randomization
```

### 2.2 encrypt() — k-masking（双平台）
```javascript
// 同上: k → kMasked = k + rK·SM2_N
```

### 2.3 extEuclidInv → modInv (Fermat 恒定时间)
```javascript
// 修复前: 变时长扩展欧几里得 (while nr != 0)
// 修复后: a^(N-2) mod N (Fermat 小定理)
// N-2 是公开常量, square-and-multiply 每次执行相同次数操作
function modInv(a, m) {
  let base = a % m, exp = m - 2n, result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return result;
}
```

### 2.4 exports 修复（Node.js 版）
```javascript
// 修复前: modInvExt: extEuclidInv,
// 修复后: modInv,
```

---

## 三、性能基准：Fermat vs extEuclid

```
=== modInv Benchmark (SM2_N, 256-bit) ===
Iterations: 100

extEuclidInv (old, variable-time):
  Per call: 288.0 μs

modInv (Fermat, constant-time):
  Per call: 911.1 μs

Slowdown: 3.2x
Per signature overhead: +623 μs
Correctness: YES (100/100 一致)
```

**结论**: 3.2x 减速，每次签名 +623μs — 交互式应用不可察觉。

---

## 四、测试结果

### 4.1 浏览器版 — 12/12 PASS
```
 Key Generation       ✅
 Sign / Verify         ✅ 4/4 (roundtrip + wrong-sig + wrong-msg)
 k-masking sig         ✅ 10/10 unique, all verify
 k-masking encrypt     ✅ 10/10 unique C1, all decrypt correctly
 Stress 200 rounds     ✅
 ECDH shared secret    ✅
 modInv correctness    ✅
```

### 4.2 Node.js 版 — 10/10 PASS
```
 keygen valid          ✅
 sign ok               ✅
 verify ok             ✅
 wrong sig rejected    ✅
 10/10 unique sigs     ✅ (all verify)
 encrypt ok            ✅
 decrypt ok            ✅
 10/10 unique C1       ✅
 100 rounds stress     ✅
 extEuclidInv removed  ✅
```

---

## 五、extEuclidInv 全项目扫描

| 位置 | 状态 |
|------|:---:|
| `www/crypto/sm2-ec-browser.js` | ✅ 已移除（仅注释） |
| `sm2-bigint-ec.js` | ✅ 已移除 + exports 更新 |
| `archives/sm2-versions/v1.2.js` | 📦 历史存档 |
| `archives/sm2-versions/v1.3.js` | 📦 历史存档 |
| `scripts/bench-modinv.js` | 📏 基准参考实现 |
| `scripts/test-sm2-node-fix.js` | 🧪 grep 断言 |
| **活跃代码** | **0 定义** |

---

## 六、对齐检查

| 检查项 | 状态 |
|--------|:---:|
| 浏览器 `sign()` k-masking | ✅ |
| 浏览器 `encrypt()` k-masking | ✅ |
| 浏览器 `extEuclidInv` 移除 | ✅ |
| Node.js `sign()` k-masking | ✅ |
| Node.js `encrypt()` k-masking | ✅ |
| Node.js `extEuclidInv` 移除 | ✅ |
| Node.js `exports.modInvExt` 修复 | ✅ |
| 浏览器 12/12 测试 | ✅ |
| Node.js 10/10 测试 | ✅ |
| modInv 性能基准 | ✅ 3.2x, +623μs |
| 全项目 extEuclidInv 扫描 | ✅ 活跃代码 0 |

---

## 七、待办

- [ ] **P0-03b**: 浏览器版 TVLA N=5,000 实测
- [ ] **P1-03d**: `pointMul` double-and-add → Montgomery Ladder（v1.3 三重防护 vs 当前二重）
- [ ] `sm2-tvla-analysis.html` 标注测试对象为 Node.js v1.3
