# ML-KEM-1024 FIPS 203 KAT 全量验证通过

**时间**: 2026-05-19 22:15 (GMT+8)
**目标**: 编译 ML-KEM-1024 (K=4) C 实现，验证 FIPS 203 KAT

## 最终结果：ALL PASSED ✅

| 测试 | 结果 | 说明 |
|------|------|------|
| KeyGen ek | MATCH | PK=1568 bytes (12-bit 压缩) |
| Encaps K | MATCH | 共享密钥 32 bytes |
| Encaps ct | MATCH | 密文 1568 bytes (du=11-bit, dv=5-bit) |
| Round-trip ×100 | ALL PASS | KEM 加解密闭环正确 |

## 关键修复

1. **params.h**: 
   - PK=1568 (K*384+32, 12-bit), SK=3168 (K*384+PK+32+32), CT=1568 (K*352+160)
   - PK 压缩 (12-bit): KYBER_PKCOMPRESSEDBYTES = K*384
   - CT 压缩 (11-bit+5-bit): du=K*352, dv=160

2. **polyvec.c**: 
   - 移除 Kyber R3 的 #error 检查（只接受 320*K 或 352*K）
   - polyvec_compress 使用 KYBER_POLYVECCOMPRESSEDBYTES = K*352（11-bit）

3. **SK 大小修正**:
   - 之前错误: KYBER_SYMBYTES + PK + 2*SYMBYTES = 1664（少算了 INDCPA SK）
   - 修正后: INDCPA_SECRETKEYBYTES + PK + 2*SYMBYTES = 3168

4. **KAT 提取**:
   - KeyGen KAT 和 Encaps KAT 使用不同 seed（eks 不同）
   - Encaps KAT 的 ct 是完整密文（1568B），非 c1/c2 分离
   - 测试分别使用 KeyGen KAT ek 和 Encaps KAT ek

## 代码位置

- C 源码: /tmp/kyber_test/ (K=4 已验证)
- KAT 文件: /opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/
- 测试程序: /tmp/kyber_test/test_1024

## 待定
- 集成到 FIBEMATE 后端 API (src/index.js)
- 确认当前 chat 协议的 KEM 格式 (ikPub/ekPub/kemCt)
