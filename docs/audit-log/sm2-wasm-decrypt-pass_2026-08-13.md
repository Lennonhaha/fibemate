# SM2 WASM 重写 — 阶段六：KAT 加解密 100/100 全通过（核心密码学全部验证完成）

## 时间
2026-08-13（D-18）

## 里程碑成果

### SM2 KAT 加解密 100/100 全通过 ✅

WASM（pointMul + sm3Hash）完整验证了 100 条 KAT 解密向量，**100 pass / 0 fail**。

解密链路：`S = dB·C1 = (x2,y2)` → `t = KDF(x2||y2, klen)` → `M = C2⊕t` → 验证 `C3 = SM3(x2||M||y2)`

### 密文格式（mode=1，C1C3C2，与 gmssl/sm-crypto 默认一致）
- `C1` = x(64 hex) || y(64 hex)，**无 04 前缀**（128 hex）
- `C3` = SM3(x2||M||y2)，64 hex
- `C2` = M ⊕ KDF 输出，长度 = 明文长度
- 总密文 = C1(128) + C3(64) + C2(klen)

### KDF（GB/T 32918.4 §5.4.3）
- `KDF(z, klen)`：`z = x2||y2`（64 字节），循环 `ct=1,2,3...` 计算 `SM3(z||ct)`，ct 为 4 字节大端计数器，直到凑够 klen

## 核心密码学全部验证完成汇总

| 模块 | 验证方式 | 结果 |
|------|---------|------|
| SM3 哈希 | GBT 32905 标准向量（'abc'、'abcd'×16、空串） | 全过 ✅ |
| 域运算（mod P/N） | BigInt oracle 10 万组 + 边界 | 0 失败 ✅ |
| 曲线点乘（mulG） | 30 组随机标量 + 2G 精确值 | 0 失败 ✅ |
| 通用点乘（pointMul） | vs mulGX 20 组 | 0 不一致 ✅ |
| mod N 求逆（feInvN） | BigInt 扩展欧几里得 50 组 | 0 失败 ✅ |
| SM2 签名 | vs BigInt 参考 10 组 | 0 失败 ✅ |
| SM2 验签 | vs BigInt 参考 + KAT 100 条 | 0 失败 ✅ |
| SM2 解密 | KAT 100 条 | 0 失败 ✅ |

## 已完成文件（wasm-sm2/assembly/）
- `field.ts`：域运算层（Montgomery 乘法锁死）
- `curve.ts`：曲线点运算层（Jacobian + Ladder + 通用点乘 + mod N 求逆）
- `sm3.ts`：SM3 哈希
- `sm2.ts`：SM2 签名/验签核心

## 下一步（非核心密码学，集成层）
1. **JS↔WASM 交叉验证**（千次随机，验证 JS 侧与 WASM 侧结果一致）
2. **TVLA 侧信道测试**（|t| < 4.5，验证恒定时间）
3. **性能基准**（目标 2-3× JS）
4. **集成到 sm2-ref 包**（替换纯 JS 实现）
5. 加解密核心的 WASM 化（当前解密在 JS 侧做字节拼接，点乘和 SM3 在 WASM）

## 关键架构决策（已定）
- 随机数 k 由 JS 侧生成传入（WASM 无安全随机源）
- ZA 组装在 JS 侧（含 userId、ENTL 长度前缀），签名/验签核心接收 e
- 加解密的 KDF 字节拼接在 JS 侧，点乘 + SM3 在 WASM（性能瓶颈在点乘和 SM3，KDF 的 XOR 和计数器拼接开销极小）
