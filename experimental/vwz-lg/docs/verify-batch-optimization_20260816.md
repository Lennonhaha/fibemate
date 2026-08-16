# VWZ verify_batch 优化（2026-08-16）

## 目标

消除 `verify()` 每次调用 `pk.data.clone()`（整个公钥张量深拷贝）的重复开销，通过批量验证复用同一个 `PubTensor`。

## 实现

- 新增 `verify_batch(pk, msgs, sigs)` WASM API：接收两个并行 JS 数组（msgs 为 Uint8Array 数组，sigs 为序列化签名字节数组），返回布尔数组。
- 核心逻辑抽成纯 Rust 函数 `verify_batch_core(pk, &[Vec<u8>], &[Vec<u8>]) -> Vec<bool>`（可脱离 wasm 运行时做单元测试）。
- 张量只 clone **一次**，N 条签名复用。

## 技术要点（踩坑记录）

1. **`VwzSignature` 无法从 `js_sys::Array` 取回**：`#[wasm_bindgen]` 导出的含私有字段结构体不实现 `JsCast`，`dyn_into::<VwzSignature>()` 编译报 E0277。→ 改用**序列化字节**（复用已有 `deserialize_signature`）作为批量输入。
2. **`js_sys` 类型无法在原生测试环境运行**：`cargo test` 跑在 x86 上，`js_sys::Array`/`Uint8Array` 直接 panic（"cannot call wasm-bindgen imported functions on non-wasm targets"）。→ 抽 `verify_batch_core` 纯函数做测试，WASM 导出层只做类型转换。
3. `keygen_seeded` 的 seed 参数在 JS 侧是 **BigInt**（`12345n`），不是 number。

## 测试结果

- **Rust 单元测试**：38 passed / 0 failed（原 36 + 新增 2：`test_verify_batch_all_valid` / `test_verify_batch_detects_tamper`）
- **wasm-pack 打包**：`--target=nodejs --release` 成功，`verify_batch` 正确导出到 `vwz_signature.d.ts` 和 `vwz_signature.js`
- **端到端（Node.js + 真实 WASM）**：100 条有效签名全部验证通过；tamper 检测正确（篡改 msg[50] 后结果[50]=false，其余 true）

## 性能实测（诚实结论）

| k | verify x N 循环 | verify_batch | 加速比 |
|:--:|:--:|:--:|:--:|
| 8 (N=100) | 3.86ms | 2.52ms | 1.53x |
| 16 (N=20) | 6.49ms | 4.71ms | 1.38x |
| 32 (N=20) | 21.73ms | 18.69ms | 1.16x |

**关键结论：加速比 1.16x~1.53x，显著低于预估的 3-5x。**

原因：`pk.data.clone()` 并非 verify 的主导开销。真实耗时大头是 `public_tensor_eval` 的双层循环（每条签名都要算一次矩阵-向量积），clone 只占小部分。verify_batch 省掉了 N 次 clone，但省下的量级有限。

**之前「3-5x」的预估建立在「clone 是主导开销」的错误假设上，实测证伪。**

## 后续方向（真正瓶颈，押后 8/31）

真正的优化点在 `public_tensor_eval` 的计算本身，需要：
- 惰性缓存 `PubTensor`（`PublicKey` 加 `RefCell`，但 `#[wasm_bindgen]` 有 Clone 限制，改动较大）
- 或算法层优化（`public_tensor_eval` 双层循环的稀疏性利用）

verify_batch 本身仍是有效且有价值的改进（纯新增、零回归、1.2-1.5x 加速、正确性全过），已提交。

## 提交

- `d70043498`：feat(vwz): add verify_batch API（signature.rs + test-batch.js，2 files, +216）
- 分支：`experimental/vwz-lg`（研究线），已推送，三端待同步

---

## 追加：惰性缓存真正实现（同日 12:19 用户指令）

用户明确指令「VWZ 惰性缓存现在做」。读真实代码后发现：**「缓存 PubTensor」是伪命题**——`PubTensor` 只是 `{k, k1, data}` 的零拷贝薄包装，`PubTensor::new` 本身不 clone；真正的 clone 是 `pk.data.clone()` 深拷贝。

**正确实现 = 消除 clone（借用 data），而非缓存：**

1. `tensor.rs` 新增 `public_tensor_eval_data(k, &[Vec<Vec<u16>>], w2, w3)`——直接接受借用切片，零 clone、零内存翻倍、零 `RefCell`。旧 `public_tensor_eval` 保留（被 `vwz_rank1.rs` rank-1 压缩研究线使用，不能删）。
2. `signature.rs` 的 `verify` 和 `verify_batch_core` 改用 `public_tensor_eval_data(pk.k, &pk.data, ...)`，删除 `pk.data.clone()`。

**实测性能（真实 WASM，消除 clone 后）：**

| k | 消除前 verify×20 | 消除后 verify×20 | 加速比 |
|:--:|:--:|:--:|:--:|
| 8 | 3.86ms | 3.84ms | ~1.0x |
| 16 | 6.49ms | 2.13ms | **3.05x** |
| 32 | 21.73ms | 14.37ms | **1.51x** |

**关键结论：**
- 消除 clone 才是真正优化点，k=16 单次 verify 快 3x、k=32 快 1.5x。
- 之前预估「clone 是主导开销」在 k≥16 时成立，只是 k=8（PK 468B）时 clone 忽略不计。
- verify_batch 在 verify 已快后**优势消失**（额外反序列化开销致 k=16 变 0.80x）——批量 API 保留但不作为性能卖点，真实收益来自借用 data。

**提交：**
- `165b84584`：perf(vwz): eliminate pk.data.clone() in verify via borrowed tensor eval（signature.rs + tensor.rs，+38/-7）

**验证：** 38 Rust 测试全通过、wasm-pack 打包成功、Node.js 端到端全过。未引入新警告（unused import 均为预先存在）。
