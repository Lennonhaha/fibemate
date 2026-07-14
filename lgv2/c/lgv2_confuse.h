#ifndef LGV2_CONFUSE_H
#define LGV2_CONFUSE_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * LG v3.0 混淆引擎（C 头文件）
 *
 * 7 层全块 Fisher-Yates 置换 + XOR offsets + AES S-box 非线性
 * 匹配 Python lgv2_nonlinear.py 参考实现
 *
 * 输入  ≤ BLOCK_SIZE：直接对原始长度执行全 7 层
 * 输入  > BLOCK_SIZE：按 BLOCK_SIZE=840 字节分块，每块独立混淆
 *
 * lgv2_confuse:    正向 7 层（L1..L7，每层后跟 SBOX）
 * lgv2_deconfuse:  逆向 7 层（INV_SBOX 后 L7..L1 逆线性）
 *
 * seed 控制所有层参数
 * in_len 可以是任意长度
 * out_len >= in_len，建议设为 in_len（无需额外填充）
 */

#define LGV2_BLOCK_SIZE 840

void lgv2_confuse(const uint8_t *in, size_t in_len, uint8_t *out, size_t out_len, uint64_t seed);
void lgv2_deconfuse(const uint8_t *in, size_t in_len, uint8_t *out, size_t out_len, uint64_t seed);

#ifdef __cplusplus
}
#endif

#endif /* LGV2_CONFUSE_H */
