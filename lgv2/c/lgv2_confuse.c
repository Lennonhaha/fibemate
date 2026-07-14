#include "lgv2_confuse.h"
#include <string.h>
#include <stdlib.h>

/* ============================================================
 * LG v3.0 娣锋穯寮曟搸锛圕 瀹炵幇锛夆€?鍖归厤 Python lgv2_nonlinear.py
 *
 * 姣忓眰瀵规暣涓?chunk 鎵ц锛歑OR(off1) 鈫?缃崲(Fisher-Yates) 鈫?XOR(off2) 鈫?SBOX
 * 杈撳叆 鈮?BLOCK_SIZE锛氱洿鎺ュ叏 7 灞? * 杈撳叆 > BLOCK_SIZE锛氭寜 BLOCK_SIZE 鍒嗗潡锛屾瘡鍧楃嫭绔嬫贩娣? * off1/off2 涓?64-bit 绉嶅瓙锛屾瘡灞傚姩鎬佸睍寮€涓?chunk_size 瀛楄妭
 * ============================================================ */

#define NUM_LAYERS 7

/* ---- AES S-box ---- */
static const uint8_t SBOX[256] = {
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
};

static const uint8_t INV_SBOX[256] = {
    0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
    0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
    0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
    0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
    0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
    0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
    0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
    0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
    0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
    0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
    0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
    0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
    0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
    0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
    0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
    0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d
};

/* ---- xorshift64 PRNG (13/7/17) ---- */
static uint64_t xorshift64_next(uint64_t *state) {
    uint64_t x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    return x;
}

/* ---- 绉嶅瓙娲剧敓 ---- */
static uint64_t layer_seed(uint64_t base, int idx) {
    uint64_t s = base ^ ((uint64_t)(idx + 1) * 0x9E3779B97F4A7C15ULL);
    s ^= s >> 30;
    s *= 0xBF58476D1CE4E5B9ULL;
    s ^= s >> 27;
    s *= 0x94D049BB133111EBULL;
    s ^= s >> 31;
    return s;
}

/* ---- Fisher-Yates 缃崲 ---- */
static void gen_perm(int *perm, int n, uint64_t *rng) {
    int i;
    for (i = 0; i < n; i++) perm[i] = i;
    for (i = n - 1; i > 0; i--) {
        int j = (int)(xorshift64_next(rng) % (uint64_t)(i + 1));
        int t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
}

/* ---- 濉厖 offset 瀛楄妭 ---- */
static void fill_offsets(uint8_t *dst, int n, uint64_t *rng) {
    int i;
    for (i = 0; i < n; i++) {
        dst[i] = (uint8_t)(xorshift64_next(rng) & 0xFF);
    }
}

/* ============================================================
 * 鏍稿績锛氬鍗曚釜 chunk (浠绘剰澶у皬 n鈮GV2_BLOCK_SIZE) 鎵ц姝ｅ悜鍏?7 灞? * L1鈫扴BOX鈫扡2鈫扴BOX鈫?..鈫扡7鈫扴BOX
 * ============================================================ */
static void confuse_chunk(uint8_t *buf, int n, uint64_t seed,
                          const uint64_t off1_seeds[NUM_LAYERS],
                          const uint64_t off2_seeds[NUM_LAYERS]) {
    int li, i;
    int *perm = (int *)malloc(n * sizeof(int));
    uint8_t *off1 = (uint8_t *)malloc(n);
    uint8_t *off2 = (uint8_t *)malloc(n);
    uint8_t *tmp  = (uint8_t *)malloc(n);

    for (li = 0; li < NUM_LAYERS; li++) {
        uint64_t rng;
        /* 1. 绾挎€у眰锛歑OR(off1) 鈫?缃崲 鈫?XOR(off2) */
        rng = layer_seed(seed, li);
        gen_perm(perm, n, &rng);
        rng = off1_seeds[li];
        fill_offsets(off1, n, &rng);
        rng = off2_seeds[li];
        fill_offsets(off2, n, &rng);
        for (i = 0; i < n; i++) tmp[i] = buf[i] ^ off1[i];
        for (i = 0; i < n; i++) buf[perm[i]] = tmp[i];
        for (i = 0; i < n; i++) buf[i] ^= off2[i];
        /* 2. 闈炵嚎鎬?S-box */
        for (i = 0; i < n; i++) buf[i] = SBOX[buf[i]];
    }

    free(perm); free(off1); free(off2); free(tmp);
}

/* ============================================================
 * 鏍稿績锛氬鍗曚釜 chunk 鎵ц閫嗗悜鍏?7 灞? * INV_SBOX鈫扡7_INV鈫扞NV_SBOX鈫?..鈫扡1_INV
 * ============================================================ */
static void deconfuse_chunk(uint8_t *buf, int n, uint64_t seed,
                            const uint64_t off1_seeds[NUM_LAYERS],
                            const uint64_t off2_seeds[NUM_LAYERS]) {
    int li, i;
    int *perm = (int *)malloc(n * sizeof(int));
    int *inv  = (int *)malloc(n * sizeof(int));
    uint8_t *off1 = (uint8_t *)malloc(n);
    uint8_t *off2 = (uint8_t *)malloc(n);
    uint8_t *tmp  = (uint8_t *)malloc(n);

    for (li = NUM_LAYERS - 1; li >= 0; li--) {
        uint64_t rng;
        /* 1. INV_SBOX */
        for (i = 0; i < n; i++) buf[i] = INV_SBOX[buf[i]];
        /* 2. 绾挎€ч€嗗眰锛歑OR(off2) 鈫?閫嗙疆鎹?鈫?XOR(off1)
           姝ｅ悜: buf[perm[i]] = tmp[i] 鈫?buf[j] = tmp[inv[j]]
           閫嗗悜: tmp[i] = buf[perm[i]] (NOT buf[inv[i]]) */
        rng = layer_seed(seed, li);
        gen_perm(perm, n, &rng);
        rng = off1_seeds[li];
        fill_offsets(off1, n, &rng);
        rng = off2_seeds[li];
        fill_offsets(off2, n, &rng);
        for (i = 0; i < n; i++) buf[i] ^= off2[i];
        for (i = 0; i < n; i++) tmp[i] = buf[perm[i]];
        for (i = 0; i < n; i++) buf[i] = tmp[i] ^ off1[i];
    }

    free(perm); free(inv); free(off1); free(off2); free(tmp);
}

/* ---- 棰勮绠楀悇灞?off1/off2 绉嶅瓙锛堜笌杈撳叆澶у皬鏃犲叧锛?---- */
static void build_seeds(uint64_t seed,
                        uint64_t off1[NUM_LAYERS],
                        uint64_t off2[NUM_LAYERS]) {
    int li;
    for (li = 0; li < NUM_LAYERS; li++) {
        uint64_t rng = layer_seed(seed, li + NUM_LAYERS);
        off1[li] = xorshift64_next(&rng);
        off2[li] = xorshift64_next(&rng);
    }
}

/* ============================================================
 * 鍏紑 API
 * ============================================================ */

void lgv2_confuse(const uint8_t *in, size_t in_len,
                  uint8_t *out, size_t out_len, uint64_t seed) {
    if (in_len == 0) return;
    uint64_t off1[NUM_LAYERS], off2[NUM_LAYERS];
    build_seeds(seed, off1, off2);

    memcpy(out, in, in_len);
    confuse_chunk(out, (int)in_len, seed, off1, off2);

    if (out_len > in_len) {
        memset(out + in_len, 0, out_len - in_len);
    }
}

void lgv2_deconfuse(const uint8_t *in, size_t in_len,
                    uint8_t *out, size_t out_len, uint64_t seed) {
    if (in_len == 0) return;
    uint64_t off1[NUM_LAYERS], off2[NUM_LAYERS];
    build_seeds(seed, off1, off2);

    memcpy(out, in, in_len);
    deconfuse_chunk(out, (int)in_len, seed, off1, off2);

    if (out_len > in_len) {
        memset(out + in_len, 0, out_len - in_len);
    }
}

/* ============================================================
 * 鍐呭缓娴嬭瘯
 * ============================================================ */
#ifdef TEST_LGV2
#include <stdio.h>

static int test_roundtrip(int size, uint64_t seed, char const *label __attribute__((unused))) {
    uint8_t *data    = (uint8_t *)malloc(size);
    uint8_t *confused = (uint8_t *)malloc(size);
    uint8_t *restored = (uint8_t *)malloc(size);
    int i;
    for (i = 0; i < size; i++) data[i] = (uint8_t)(i ^ 0xAA);

    lgv2_confuse(data, size, confused, size, seed);
    lgv2_deconfuse(confused, size, restored, size, seed);

    int ok = (memcmp(data, restored, size) == 0);
    printf("%s: round-trip %dB 鈥?%s\n",
           ok ? "PASS" : "FAIL", size, ok ? "OK" : "MISMATCH");
    if (!ok) {
        for (i = 0; i < size; i++) {
            if (data[i] != restored[i]) {
                printf("  first mismatch at byte %d: expected %02x got %02x\n",
                       i, data[i], restored[i]);
                break;
            }
        }
    }
    free(data); free(confused); free(restored);
    return ok ? 0 : 1;
}

static int test_deterministic(void) {
    uint8_t out1[64], out2[64], data[64];
    int i;
    for (i = 0; i < 64; i++) data[i] = (uint8_t)i;
    lgv2_confuse(data, 64, out1, 64, 42);
    lgv2_confuse(data, 64, out2, 64, 42);
    int ok = (memcmp(out1, out2, 64) == 0);
    printf("%s: deterministic\n", ok ? "PASS" : "FAIL");
    return ok ? 0 : 1;
}

static int test_seed_sensitivity(void) {
    uint8_t out1[64], out2[64], data[64];
    int i;
    for (i = 0; i < 64; i++) data[i] = (uint8_t)i;
    lgv2_confuse(data, 64, out1, 64, 42);
    lgv2_confuse(data, 64, out2, 64, 43);
    int ok = (memcmp(out1, out2, 64) != 0);
    printf("%s: seed sensitivity\n", ok ? "PASS" : "FAIL");
    return ok ? 0 : 1;
}

static int test_python_100b(void) {
    uint8_t data[100], out[100];
    int i;
    for (i = 0; i < 100; i++) data[i] = (uint8_t)(i * 7);
    lgv2_confuse(data, 100, out, 100, 0x1234);
    /* Python reference: [215, 243, 99, 104, 54, 216, 205, 254] */
    uint8_t expected[8] = {215, 243, 99, 104, 54, 216, 205, 254};
    int ok = (memcmp(out, expected, 8) == 0);
    printf("%s: Python 100B cross-check\n", ok ? "PASS" : "FAIL");
    if (!ok) {
        printf("  got: [");
        for (i = 0; i < 8; i++) printf("%d%s", out[i], i<7?", ":"");
        printf("]\n");
    }
    return ok ? 0 : 1;
}

static int test_python_cross_verify_5vec(void) {
    int failures = 0;

    /* 5B "hello" seed=0x1234 */
    {
        uint8_t out[5];
        uint8_t expected[] = {207, 240, 152, 132, 123};
        lgv2_confuse((uint8_t*)"hello", 5, out, 5, 0x1234);
        if (memcmp(out, expected, 5) != 0) {
            printf("FAIL: 5B hello cross-verify\n");
            failures++;
        } else { printf("PASS: 5B hello cross-verify\n"); }
    }

    /* 100B seq=i seed=0xDEAD */
    {
        uint8_t data[100], out[100];
        uint8_t expected[] = {209, 19, 169, 27, 62, 198, 24, 52};
        for (int i = 0; i < 100; i++) data[i] = (uint8_t)i;
        lgv2_confuse(data, 100, out, 100, 0xDEAD);
        if (memcmp(out, expected, 8) != 0) {
            printf("FAIL: 100B seq cross-verify\n");
            failures++;
        } else { printf("PASS: 100B seq cross-verify\n"); }
    }

    /* 840B seq=i seed=0xCAFE1234 */
    {
        uint8_t *data = malloc(840), *out = malloc(840);
        uint8_t expected[] = {215, 68, 66, 249, 17, 14, 156, 65};
        for (int i = 0; i < 840; i++) data[i] = (uint8_t)i;
        lgv2_confuse(data, 840, out, 840, 0xCAFE1234);
        if (memcmp(out, expected, 8) != 0) {
            printf("FAIL: 840B seq cross-verify\n");
            failures++;
        } else { printf("PASS: 840B seq cross-verify\n"); }
        free(data); free(out);
    }

    /* 64B zeros seed=0xBEEF */
    {
        uint8_t out[64];
        uint8_t data[64] = {0};
        uint8_t expected[] = {151, 85, 234, 245, 83, 210, 164, 107};
        lgv2_confuse(data, 64, out, 64, 0xBEEF);
        if (memcmp(out, expected, 8) != 0) {
            printf("FAIL: 64B zeros cross-verify\n");
            failures++;
        } else { printf("PASS: 64B zeros cross-verify\n"); }
    }

    /* 32B FF seed=0x55 */
    {
        uint8_t out[32], data[32];
        uint8_t expected[] = {143, 174, 209, 228, 135, 100, 99, 94};
        memset(data, 0xFF, 32);
        lgv2_confuse(data, 32, out, 32, 0x55);
        if (memcmp(out, expected, 8) != 0) {
            printf("FAIL: 32B FF cross-verify\n");
            failures++;
        } else { printf("PASS: 32B FF cross-verify\n"); }
    }

    return failures;
}

int main(void) {
    int failures = 0;
    failures += test_roundtrip(1,    99,   "  ");
    failures += test_roundtrip(4,    42,   "  ");
    failures += test_roundtrip(100,  0x1234, "");
    failures += test_roundtrip(840,  0xDEADBEEF, "");
    failures += test_roundtrip(2000, 0xCAFE, "");
    failures += test_deterministic();
    failures += test_seed_sensitivity();
    failures += test_python_100b();
    failures += test_python_cross_verify_5vec();
    printf("\n=== %zu/%zu tests passed ===\n", (size_t)(13 - failures), (size_t)13);
    return failures;
}
#endif /* TEST_LGV2 */
