/**
 * tensor_tvla.h — LookingGlass Core Tensor Operations for STM32 Cortex-M4
 * 
 * Bare-metal C port for side-channel (TVLA) power analysis.
 * No OS, no dynamic allocation, no interrupts beyond GPIO trigger.
 * 
 * q = 3329 (ML-KEM modulus)
 * Max dimension: n=8 (adjust TENSOR_MAX_N for larger tests)
 */

#ifndef TENSOR_TVLA_H
#define TENSOR_TVLA_H

#include <stdint.h>
#include <stddef.h>

/* === Constants === */
#define Q 3329            /* modulus, prime */
#define Q_HALF 1664       /* (Q-1)/2 for centered reduction */
#define TENSOR_MAX_N 16   /* max dimension for static allocation */

/* === Types === */
typedef int16_t zq_t;     /* element in Z_q, fits Q in int16 */

/* Matrix stored as contiguous row-major */
typedef struct {
  zq_t data[TENSOR_MAX_N * TENSOR_MAX_N];
  uint8_t rows;
  uint8_t cols;
} matrix_t;

/* === Core Arithmetic === */
zq_t  mod_q(int32_t v);
zq_t  mod_mul(zq_t a, zq_t b);
zq_t  mod_add(zq_t a, zq_t b);
zq_t  mod_sub(zq_t a, zq_t b);

/* === Matrix Operations === */
void  mat_zero(matrix_t *M, uint8_t rows, uint8_t cols);
void  mat_identity(matrix_t *I, uint8_t n);
void  mat_mul(const matrix_t *A, const matrix_t *B, matrix_t *C);
void  mat_add(const matrix_t *A, const matrix_t *B, matrix_t *C);
void  mat_sub(const matrix_t *A, const matrix_t *B, matrix_t *C);
void  mat_kron(const matrix_t *A, const matrix_t *B, matrix_t *R);
void  mat_transpose(const matrix_t *A, matrix_t *T);

/* === Random Number Generation === */
void  prng_seed(uint32_t s);
uint32_t prng_rand(void);           /* 32-bit LCG */
zq_t  prng_zq(void);               /* uniform in [0,Q-1] */
float prng_gaussian(float sigma);  /* Box-Muller */

/* === Matrix Fill Helpers === */
void  mat_fill_random(matrix_t *M, uint8_t rows, uint8_t cols);
void  mat_fill_gaussian_secret(matrix_t *M, uint8_t n, float sigma);

/* === TVLA Trigger Interface === */
void  tvla_trigger_init(void);    /* configure GPIO PA0 as output */
void  tvla_trigger_high(void);    /* set PA0 high (operation start) */
void  tvla_trigger_low(void);     /* set PA0 low  (operation end) */
void  tvla_mode_init(void);       /* configure PB0 as input for mode select */
int   tvla_mode_read(void);       /* 0=fixed, 1=random */

/* === TVLA Test Orchestration === */
void  tvla_run_fixed(matrix_t *result, uint8_t n);
void  tvla_run_random(matrix_t *result, uint8_t n);
void  tvla_run(uint16_t iterations, const char *mode);

#endif /* TENSOR_TVLA_H */
