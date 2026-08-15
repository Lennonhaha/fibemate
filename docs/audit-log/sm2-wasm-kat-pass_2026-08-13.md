# SM2 WASM 重写 — 阶段五：KAT 验签 100/100 全通过

## 时间
2026-08-13（D-18）

## 里程碑成果

### SM2 KAT 验签 100/100 全通过 ✅

用 WASM 实现（sm3Hash + sm2VerifyCore）完整验证了 `packages/sm2-ref/test/kat/sm2-KAT.json` 的 100 条签名向量，**100 pass / 0 fail**。

这意味着以下全链路与 gmssl（Python 参考）完全对齐：
1. **ZA 计算**：`ZA = SM3(ENTL || ID || a || b || xG || yG || xA || yA)`，userId 默认 `"1234567812345678"`，ENTL = ID 位长度（128）
2. **e 计算**：`e = SM3(ZA || M) mod N`
3. **验签公式**：`t = (r+s) mod N`、`Q = s·G + t·PA`、`R = (e + x1) mod N`，验证 `R == r`
4. **SM3 哈希**：标准 GB/T 32905
5. **曲线点运算**：Jacobian + Montgomery Ladder 标量乘法、仿射点加法

### KAT 文件结构（关键认知）
- `sm2-KAT.json` 的 `signature` 字段 = r(64 hex) + s(64 hex) 拼接
- `message` 字段是**原始消息**（非哈希），所以必须走完整 `ZA → e = SM3(ZA||M)` 流程
- KAT 里的签名由 gmssl 用**随机 k** 生成，**KAT 未存 k 值** → 只能验签、不能复现签名值（这是标准做法）
- `publicKey` = `04 || X(64) || Y(64)`

### 验证过的关键细节
- ZA 组装的字节序：ENTL 2 字节大端 + ID UTF-8 + a/b/xG/yG/xA/yA 各 32 字节大端
- userId 默认 `"1234567812345678"`（16 字符 = 128 位），ENTL = 0x0080

## 已完成文件
- `wasm-sm2/assembly/field.ts`：域运算（montMulP/montMulN/toMont/fromMont/feAdd/feSub）
- `wasm-sm2/assembly/curve.ts`：曲线点运算 + 通用点乘 pointMulX/Y + mod N 求逆 feInvN
- `wasm-sm2/assembly/sm3.ts`：SM3 哈希（标准向量全过）
- `wasm-sm2/assembly/sm2.ts`：SM2 签名/验签核心（sm2SignCore/sm2VerifyCore）

## 下一步
1. **加解密**（KDF + SM3 + 点乘）：
   - 加密：C1 = k·G、S = k·PB、t = KDF(x2||y2, klen)、C2 = M⊕t、C3 = SM3(x2||M||y2)
   - 解密：S = dB·C1、t = KDF、M = C2⊕t、验证 C3
2. **JS↔WASM 交叉验证**（千次随机）
3. **TVLA 侧信道测试**（|t| < 4.5）
4. **集成到 sm2-ref 包**

## 关键架构决策（已定）
- 随机数 k 由 JS 侧生成传入（WASM 无安全随机源）
- 签名核心接收 e（已是 SM3(ZA||M) 结果），ZA 组装在 JS 侧或独立函数
- 验签核心接收 e + r + s，返回 0/1
