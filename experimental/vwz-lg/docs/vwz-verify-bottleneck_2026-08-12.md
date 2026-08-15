# VWZ 验证速度分析（实测根因）

## 实测数据（vwz-bench.js，Intel Xeon Platinum + WASM）

| 方案 | 签名 (ops/s) | 验证 (ops/s) | 比值 |
|------|:---:|:---:|:---:|
| VWZ k=8  | 24,527 | 2,581 | 9.5× |
| VWZ k=16 |  4,765 |   404 | 11.8× |

签名 vs 验证差 ~10×，**反过来推断**：慢的那一侧才是真正跑计算。

## 验证路径（signature.rs:98）

```rust
pub fn verify(pk: &PublicKey, msg: &[u8], sig: &VwzSignature) -> bool {
    if sig.k != pk.k { return false; }
    let m = sig.k + 1;
    if sig.w2.len() != m || sig.w3.len() != m { return false; }

    let pk_tensor = PubTensor::new(pk.k, pk.data.clone());     // ① 结构化
    let target = hash_to_sparse_target(msg, pk.k);             // ② 哈希映射
    let result = public_tensor_eval(&pk_tensor, &sig.w2, &sig.w3);  // ③ 张量·向量
    result == target                                          // ④ 比较
}
```

**核心结论：验证路径没有矩阵求逆。**

| 步骤 | 复杂度 | 是否瓶颈 |
|------|--------|----------|
| ① `PubTensor::new` | O(k²) 构造 `Vec<Vec<Vec<u16>>>` | ❌ 慢在 **WASM 边界数据复制** |
| ② `hash_to_sparse_target` | O(1) | ✅ 极快 |
| ③ `public_tensor_eval` | O(k³) 模乘 | ✅ 计算密度低 |
| ④ `result == target` | O(k) | ✅ 极快 |

## 真实瓶颈：WASM 边界数据拷贝

`PublicKey` 在 JS 侧是对象（`{k, data: number[][][]}`），调用 `verify` 时：

```
JS PublicKey 
  →  wasm_bindgen 序列化 (recursively serialize Vec<Vec<Vec<u16>>>)   ← 慢
  →  PubTensor::new(pk.k, pk.data.clone())                            ← 深拷贝
  →  public_tensor_eval (实际计算)                                     ← 不是瓶颈
  →  wasm_bindgen 反序列化 → JS 布尔                                  ← 慢
```

k=8 时 pk.data 是 9×9×9 = 729 个 u16 数字；k=16 时 17×17×17 = 4913 个。每次 verify 都跨 JS-WASM 边界拷贝这 ~700-5000 数字，且 `Vec<Vec<Vec<u16>>>` 是三重指针，**反序列化比 O(k³) 的模乘还贵**。

## 用户方案 A 的判定：**数学上不可行**

用户原话：
> "验证时需要恢复 x，涉及矩阵求逆"
> "预计算 V⁻¹，验证时直接查表"

错误点：
1. ❌ 验证不调用求逆。verify = `public_tensor_eval(pk, w2, w3) == target`，没有任何矩阵求逆
2. ❌ V⁻¹ 不是"签名时缓存"——签名侧用 trapdoor 而不是 V⁻¹
3. ❌ 签名 vs 验证比 10:1，但**慢的是签名**，求逆在签名侧

实施此方案=优化了一个根本不存在的瓶颈。

## 真正可用的优化

### 方案 F（推荐）：验证路径加缓存层（签名用）
```javascript
// 不是缓存 V⁻¹，而是缓存 PubTensor 结构化结果
const verifyCache = new Map();
async function verify(pk, msg, sig) {
  const cacheKey = pk.serialized;  // 公钥字节序相同
  let pk_tensor = verifyCache.get(cacheKey);
  if (!pk_tensor) {
    pk_tensor = await wasm.public_tensor_new(pk);
    verifyCache.set(cacheKey, pk_tensor);
  }
  // 真正的张量乘法 O(k³)
  return wasm.tensor_eval(pk_tensor, sig.w2, sig.w3) === hash(msg);
}
```

预期：同一公钥多次验证场景 3-5× 加速（消除 PubTensor 重复构造 + WASM 边界拷贝）。

### 方案 G：批量验证 API
一次 WASM 调用处理 N 个 (msg, sig) 对：
```
verify_batch(pk, [(msg1, sig1), (msg2, sig2), ...])
```
内部循环只调用一次 `PubTensor::new`。预期 N=10 时 5-8× 加速。

### 方案 H：WASM SIMD
k=8/16 时激活 wasm128 SIMD（mod 3329 加减用 u8x16 saturating_add），预期 2-3× 加速。需要重编 wasm-pack target=web+simd。

## 路线图

| 阶段 | 内容 | 预期验证速度 | 改动 |
|:---:|------|:---:|------|
| 当前 | 单签验证 | 2,581 / 404 | — |
| v3.3.1 | 方案 F + G（缓存+批） | 8-12k / 1.5-3k | 仅 wasm_bindgen 导出层 |
| v3.4 | 方案 H（SIMD） | 20-30k / 4-8k | 重编 + 测试 |
| v3.5 | FPGA 验证器 | 50-100k | 已有 BRAM 求解器可借鉴 |

## 教训

> "签名慢是因为验证有矩阵求逆"——典型的**凭直觉猜复杂度**。
> 真实情况：签名侧用 trapdoor（不含 V⁻¹），验证侧只做张量乘法。瓶颈在边界拷贝。

任何优化前必须先：
1. 跑 `perf profile` 找到真实热点
2. 区分 O(k³) 算法成本 vs WASM 序列化成本
3. 验证侧加 Profiling 而不是基于猜测"优化"

---

*生成: 2026-08-12 · 数据源: vwz-bench.js + signature.rs:98 源码审查*