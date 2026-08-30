# LG v2.3 Sprint 3 实施记录（2026-08-17）

## 范围

Sprint 3 = Stage-3（变异+加密）：rand_seed 随机化 + ChaCha8 轻量加密 + 256B 全 0 输入验证（Sprint 2 收尾漏项补齐）。

与前两个 Sprint 一致，本 Sprint 是对 v2.3 既有设计文档（`lg-v2.3-stage2_20260816.md` 的 Stage-3 规划）的落地执行，纯增量，无重叠工作。

## 目标

在 Stage-2 混淆管道之外再叠加一层密钥派生的流加密：

```
Forward:  data -> obfuscate(seed,session,depth) -> ChaCha8(key,nonce) -> ciphertext
Inverse:  ciphertext -> ChaCha8(key,nonce) -> deobfuscate(seed,session,depth) -> data
```

作用：
1. **rand_seed 随机化**：密钥/nonce 由 `keccak256(seed ‖ session_key ‖ depth)` 派生，替代 Stage-2 的线性 `seed ^ session_key`。线性组合可被差分/代数方法还原，keccak 打散破坏该可逆性。
2. **无密钥连反混淆都进不去**：没有 session 派生的密钥，ciphertext 本身就是密文，反混淆管道无法直接作用。

## 新增模块

### `src/chacha8.rs`（ChaCha8 轻量流加密）

- RFC 8439 风格 ChaCha 块函数，轮数参数化
- 生产路径 `ROUNDS=8`（ChaCha8，轻量）；用 `ROUNDS=20` 通过 **RFC 8439 §2.3.2 官方 ChaCha20 测试向量**验证块函数正确性
- IETF 布局：32-bit block counter + 96-bit nonce
- 零依赖，u32 运算适配 WASM
- 加解密同函数（XOR 自逆）
- 测试：RFC 8439 向量、自逆、key/nonce 敏感、短输入边界（0/1/63/64/65/127/128）、keystream 确定性

### `src/seal.rs`（密封层）

- `rand_seed(seed, session_key, depth) -> u64`：keccak256 打散派生，非线性
- `derive_key_material`：域标签（`seal-key`/`seal-nonce`）分离 key/nonce 派生
- `obfuscate_sealed` / `deobfuscate_sealed`：复用既有 pipeline，出口加密 / 进口解密
- 测试：rand_seed 非线性（≠ Stage-2 线性组合）、sealed roundtrip、与 plain obfuscate 差异、session key 敏感、错误密钥还原失败、确定性

## 新增 WASM API（向后兼容，旧 API 不变）

- `lgv3_sealed_obfuscate(data, seed, session_key, depth) -> Vec<u8>`
- `lgv3_sealed_deobfuscate(data, seed, session_key, depth) -> Vec<u8>`
- `lgv3_rand_seed(seed, session_key, depth) -> String`（hex，审计用）

## 256B 全 0 输入验证（Sprint 2 收尾漏项）

- `test_sprint3_all_zero_256b_pipeline`：pipeline 混淆 256B 全 0 → 全 256 字节变化 + roundtrip 精确还原
- `test_sprint3_all_zero_256b_sealed`：密封层覆盖；断言"绝大多数字节变化"（≥230/256），因 ChaCha8 keystream 每字节有 1/256 概率恰为 0x00，属正常概率事件
- `test_sprint3_all_zero_256b_session_diff`：全 0 输入下不同 session 仍产出不同输出

## 验证结果

- **Rust 测试**：**102/102 全绿**（81 旧 + 21 新）
  - 旧测试全部保持通过（含 Stage-2 字节级黄金向量），确认向后兼容
  - RFC 8439 官方 ChaCha20 向量通过，确认块函数正确
- **WASM 体积**（wasm-opt -Oz，binaryen 118）：

| 指标 | Sprint 2 | Sprint 3 | 增量 |
| :--- | ---: | ---: | ---: |
| raw | 91,730 B | 95,865 B | +4,135 B |
| wasm-opt -Oz | 69,509 B | 73,441 B | +3,932 B |
| **gzip** | 26,450 B | **27,724 B** | +1,274 B |

gzip 27.7KB，仍在 ≤40KB 预算内。

## 合规声明

- ChaCha8 为公开标准流密码（ChaCha 族，Bernstein 2008），非任何商用产品专属实现
- 本层定位为"混淆密封层"（提高自动化分析的静态/数据依赖成本），不用于机密性保护；源码注释已明确该边界
- 实验分支，不合并 main，8/31 冻结期内不部署

## 提交

- `（待提交）` Sprint 3: sealed layer (Stage-3 mutation+encryption)
- 推送到 `experimental/vwz-lg` 分支
