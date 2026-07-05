# 从 Kyber Round 3 到 FIPS 203 — 对齐实现日志

**项目**: FIBEMATE  
**文件**: `/opt/fibemate-full/src/crypto/` (C 实现)  
**日期**: 2026-05-18 → 2026-05-19

---

## 一、背景

FIBEMATE 最初集成了 **pq-crystals/kyber-768**（NIST PQC Round 3 候选算法）。2024 年 8 月 NIST 正式发布 FIPS 203 ML-KEM-768 标准后，需要将实现从 Round 3 草案对齐至正式标准。

这两个版本**高度兼容**——核心数学（NTT、CBD 采样、多项式运算）完全相同。差异集中在一个领域分隔符的改变上。

## 二、前置修复

在 FIPS 203 对齐之前，先行修复了两个独立的实现 bug：

### 2.1 polyvec 压缩位布局

**问题**: 自定义 `polyvec_compress`/`polyvec_decompress` 使用 8 系数/块→10 字节的布局，与 FIPS 203 规定的 4 系数/块→5 字节不符，导致解压缩时 `u` 值错误。

**修复**: 将 `polyvec.c` 替换为参考实现版本（4-coeff/5-byte 布局，`md5` 验证一致性）。

### 2.2 NTT zeta 表索引

**问题**: `multiplyNTTs`（`basemul`）使用错误范围的 zeta 常数（索引 0..127 而非 64..127），导致 NTT 域乘法结果与 KAT 不匹配。

**修复**: zeta 表索引改为 `zs[64 + i]`。

## 三、核心对齐：领域分隔符

### 3.1 差异定位

通过差分诊断确认：INDCPA 核心（多项式向量、NTT、CBD）在往返测试中全部正确，但 KEM Keygen 的 `ek`（公钥）与 NIST KAT 不匹配。

根因定位至 `indcpa_keypair_derand()` 中 `G(d)` 的调用方式。

### 3.2 Kyber Round 3 vs FIPS 203

| 版本 | K-PKE.KeyGen 输入 | 派生方式 |
|------|-------------------|----------|
| Kyber R3 | `d` (32B) + `K` (1B) = 33B | `G(d ∥ K)` → `(rho, sigma)` |
| FIPS 203 | `d` (32B) | `G(d)` → `(rho, sigma)` |

其中 `K` 是 ML-KEM 的维度参数（768 → K=3 = `0x03`）。

### 3.3 代码改动

仅需修改 `/tmp/kyber_test/indcpa.c` 一处：

```diff
-  buf[KYBER_SYMBYTES] = KYBER_K;
-  hash_g(buf, buf, KYBER_SYMBYTES + 1);
+  hash_g(buf, buf, KYBER_SYMBYTES);
```

### 3.4 验证流程

1. **`verify_ghash.py`** — 验证 `G(d)` 单独产生的 rho/sigma 与 KAT 匹配
2. **`test_fips2.py`** — 验证完整 keygen 的 ek 前 32 字节匹配
3. **`test_fips6.py`** — 验证完整 1184 字节 ek 匹配 + KEM 往返
4. **`test_encaps.py`** — 验证 Encaps KAT（共享密钥 K 匹配）
5. **`test_decaps.py`** — 验证 Decaps KAT（解密 K 匹配）

## 四、最终结果

```
FIPS 203 ML-KEM-768 — 全量 KAT 验证:

  Key Generation  ✅  ek (1184 bytes) MATCH
  Encapsulation   ✅  K  (32 bytes)   MATCH  
  Decapsulation   ✅  K  (32 bytes)   MATCH
  KEM Round-trip  ✅  PASS
```

## 五、不变部分（Kyber R3 ≈ FIPS 203）

以下组件在 Round 3 和 FIPS 203 之间保持完全一致，无需修改：

- NTT 正/逆变换（Montgomery 版本）
- `poly_reduce` / `poly_tomsg` / `poly_frommsg`
- `cbd2` / `cbd3`（CBD 采样，η₁=2, η₂=2）
- A 矩阵展开 (`gen_matrix` via SHAKE-128)
- K-PKE.Encrypt / K-PKE.Decrypt 数学
- KEM.Encaps 的 `G(m || H(ek))` 和 KEM.Decaps 的隐式拒绝

## 六、文件索引

| 文件 | 用途 |
|------|------|
| `verify_ghash.py` | G(d) 哈希验证 |
| `test_fips2.py` | 初步 keygen 验证 |
| `test_fips6.py` | 完整 1184B ek 验证 |
| `test_encaps.py` | Encaps KAT 验证 |
| `test_decaps.py` | Decaps KAT 验证 |
| `/tmp/kyber_test/symmetric-shake.c` | 已修改（G(d) 32B） |
| `/tmp/kyber_test/polyvec.c` | 已修改（FIPS 203 压缩布局） |

---

**总结**: 从 Kyber Round 3 → FIPS 203 的对齐仅涉及 **一处一字修改**（删除领域分隔符字节），其余数学完全兼容。对齐后通过 NIST 所有中间值 KAT 测试。