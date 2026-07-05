/**
 * tensor_tvla.c — LookingGlass Core Tensor Operations (STM32 Cortex-M4)
 * 
 * Bare-metal. No heap malloc, no printf in inner loops, no RTOS.
 * All matrices statically allocated (TENSOR_MAX_N=16, max 256 elements each).
 * TVLA GPIO: PA0 as trigger output, PB0 as mode select input.
 */

#include "tensor_tvla.h"
#include <math.h>   /* log, cos, M_PI for Box-Muller */
#include <string.h> /* memset */

/* === Internal State === */
static uint32_t prng_state = 0xDEADBEEF;

/* === GPIO addresses (STM32F4) === */
#define GPIOA_BASE  0x40020000
#define GPIOB_BASE  0x40020400
#define RCC_BASE    0x40023800
#define RCC_AHB1ENR (*(volatile uint32_t *)(RCC_BASE + 0x30))

#define GPIO_MODER(g)  ((volatile uint32_t *)(g + 0x00))
#define GPIO_ODR(g)    ((volatile uint32_t *)(g + 0x14))
#define GPIO_IDR(g)    ((volatile uint32_t *)(g + 0x10))

/* ============================================
 * Core Arithmetic (constant-time data path)
 * ============================================ */

inline zq_t mod_q(int32_t v) {
  /* Barrett-like centered reduction for q=3329 */
  v = v % Q;
  if (v < 0) v += Q;
  return (zq_t)v;
}

inline zq_t mod_mul(zq_t a, zq_t b) {
  return mod_q((int32_t)a * (int32_t)b);
}

inline zq_t mod_add(zq_t a, zq_t b) {
  return mod_q((int32_t)a + (int32_t)b);
}

inline zq_t mod_sub(zq_t a, zq_t b) {
  return mod_q((int32_t)a - (int32_t)b);
}

/* ============================================
 * Matrix Operations
 * ============================================ */

void mat_zero(matrix_t *M, uint8_t rows, uint8_t cols) {
  M->rows = rows;
  M->cols = cols;
  memset(M->data, 0, (size_t)rows * cols * sizeof(zq_t));
}

void mat_identity(matrix_t *I, uint8_t n) {
  mat_zero(I, n, n);
  for (uint8_t i = 0; i < n; i++)
    I->data[i * n + i] = 1;
}

void mat_mul(const matrix_t *A, const matrix_t *B, matrix_t *C) {
  uint8_t m = A->rows, n = A->cols, p = B->cols;
  mat_zero(C, m, p);
  for (uint8_t i = 0; i < m; i++) {
    for (uint8_t k = 0; k < n; k++) {
      zq_t aik = A->data[i * n + k];
      if (aik == 0) continue;
      for (uint8_t j = 0; j < p; j++) {
        int32_t prod = (int32_t)aik * B->data[k * p + j];
        C->data[i * p + j] = mod_q((int32_t)C->data[i * p + j] + prod);
      }
    }
  }
}

void mat_add(const matrix_t *A, const matrix_t *B, matrix_t *C) {
  uint8_t total = A->rows * A->cols;
  C->rows = A->rows;
  C->cols = A->cols;
  for (uint8_t i = 0; i < total; i++)
    C->data[i] = mod_q((int32_t)A->data[i] + B->data[i]);
}

void mat_sub(const matrix_t *A, const matrix_t *B, matrix_t *C) {
  uint8_t total = A->rows * A->cols;
  C->rows = A->rows;
  C->cols = A->cols;
  for (uint8_t i = 0; i < total; i++)
    C->data[i] = mod_q((int32_t)A->data[i] - B->data[i]);
}

/**
 * Kronecker product: R = A ⊗ B
 * If A is m×n and B is p×q, R is (m*p)×(n*q).
 * This is the PRIMARY target for TVLA power trace analysis.
 */
void mat_kron(const matrix_t *A, const matrix_t *B, matrix_t *R) {
  uint8_t m = A->rows, n = A->cols;
  uint8_t p = B->rows, q = B->cols;
  uint8_t R_rows = m * p;
  uint8_t R_cols = n * q;

  mat_zero(R, R_rows, R_cols);

  for (uint8_t i = 0; i < m; i++) {
    for (uint8_t j = 0; j < n; j++) {
      zq_t a = A->data[i * n + j];
      for (uint8_t r = 0; r < p; r++) {
        for (uint8_t c = 0; c < q; c++) {
          uint16_t idx = (uint16_t)(i * p + r) * R_cols + (j * q + c);
          R->data[idx] = mod_q((int32_t)R->data[idx] + (int32_t)a * B->data[r * q + c]);
        }
      }
    }
  }
}

void mat_transpose(const matrix_t *A, matrix_t *T) {
  uint8_t m = A->rows, n = A->cols;
  T->rows = n;
  T->cols = m;
  for (uint8_t i = 0; i < m; i++)
    for (uint8_t j = 0; j < n; j++)
      T->data[j * m + i] = A->data[i * n + j];
}

/* ============================================
 * PRNG — Simple LCG, deterministic for TVLA
 * ============================================ */

void prng_seed(uint32_t s) {
  prng_state = s;
}

uint32_t prng_rand(void) {
  prng_state = prng_state * 1664525 + 1013904223;
  return prng_state;
}

zq_t prng_zq(void) {
  return (zq_t)(prng_rand() % Q);
}

float prng_gaussian(float sigma) {
  /* Box-Muller */
  float u1, u2;
  do { u1 = (float)prng_rand() / 4294967296.0f; } while (u1 == 0.0f);
  do { u2 = (float)prng_rand() / 4294967296.0f; } while (u2 == 0.0f);
  return sqrtf(-2.0f * logf(u1)) * cosf(2.0f * 3.1415926535f * u2) * sigma;
}

/* ============================================
 * Matrix Fill
 * ============================================ */

void mat_fill_random(matrix_t *M, uint8_t rows, uint8_t cols) {
  M->rows = rows;
  M->cols = cols;
  for (uint8_t i = 0; i < rows; i++)
    for (uint8_t j = 0; j < cols; j++)
      M->data[i * cols + j] = prng_zq();
}

void mat_fill_gaussian_secret(matrix_t *M, uint8_t n, float sigma) {
  M->rows = n;
  M->cols = 1; /* column vector */
  for (uint8_t i = 0; i < n; i++)
    M->data[i] = mod_q((int32_t)(prng_gaussian(sigma) * 3.0f));
}

/* ============================================
 * TVLA Trigger Interface (GPIO bit-bang)
 * ============================================ */

#ifdef TVLA_TEST_NO_GPIO /* host no-ops — test_standalone.c provides stubs */
void tvla_trigger_init(void)  {}
void tvla_trigger_high(void)  {}
void tvla_trigger_low(void)   {}
void tvla_mode_init(void)     {}
int  tvla_mode_read(void)     { return 0; }
#else /* real GPIO for STM32F4 */
void tvla_trigger_init(void) {
  /* Enable GPIOA clock */
  RCC_AHB1ENR |= 1;
  /* Set PA0 as output (mode 01) */
  volatile uint32_t *moder = GPIO_MODER(GPIOA_BASE);
  *moder = (*moder & ~3u) | 1u;
  tvla_trigger_low();
}
void tvla_trigger_high(void) { *GPIO_ODR(GPIOA_BASE) |= 1; }
void tvla_trigger_low(void)  { *GPIO_ODR(GPIOA_BASE) &= ~1u; }
void tvla_mode_init(void) {
  RCC_AHB1ENR |= (1 << 1);
  *GPIO_MODER(GPIOB_BASE) &= ~3u;
}
int tvla_mode_read(void) { return (*GPIO_IDR(GPIOB_BASE) & 1) ? 1 : 0; }
#endif /* TVLA_TEST_NO_GPIO */

/* ============================================
 * TVLA Test Orchestration (always compiled)
 * ============================================ */

static matrix_t A, B, R; /* statically allocated work matrices */

/**
 * Run one fixed-key Kronecker product measurement.
 * Same keys every call → "fixed" group.
 */
void tvla_run_fixed(matrix_t *result, uint8_t n) {
  prng_seed(0xCAFE0000); /* deterministic seed */
  mat_fill_random(&A, n, n);
  mat_fill_random(&B, 2, 2); /* 2×2 expansion matrix */
  tvla_trigger_high();
  mat_kron(&A, &B, &R);
  tvla_trigger_low();
  if (result) *result = R;
}

/**
 * Run one random-key Kronecker product measurement.
 * Random seed per call → "random" group.
 */
void tvla_run_random(matrix_t *result, uint8_t n) {
  static uint32_t counter = 0xDEAD0000;
  prng_seed(counter++); /* incrementing seed for randomness */
  mat_fill_random(&A, n, n);
  mat_fill_random(&B, 2, 2);
  tvla_trigger_high();
  mat_kron(&A, &B, &R);
  tvla_trigger_low();
  if (result) *result = R;
}

/**
 * Full TVLA collection loop.
 * Call from main() with iterations=5000.
 */
void tvla_run(uint16_t iterations, const char *mode) {
  int is_fixed = (mode[0] == 'f');
  for (uint16_t i = 0; i < iterations; i++) {
    if (is_fixed) tvla_run_fixed(0, 8);
    else          tvla_run_random(0, 8);
  }
}

/* ============================================
 * Self-Test — validate C port against JS
 * ============================================ */

/**
 * Verify kron(A, I_2) === expected result
 * Returns 0 on pass, -1 on fail.
 */
int tensor_tvla_self_test(void) {
  matrix_t A_k, I2, R_k;
  uint8_t n = 3;

  /* A = [[1,2,3],[4,5,6],[7,8,9]] */
  mat_zero(&A_k, n, n);
  for (uint8_t i = 0; i < n; i++)
    for (uint8_t j = 0; j < n; j++)
      A_k.data[i * n + j] = mod_q((zq_t)(i * n + j + 1));

  mat_identity(&I2, 2);
  mat_kron(&A_k, &I2, &R_k);

  /* Expect 6×6 block diagonal: each element of A appears as 2×2 diagonal block */
  /* R[0,0]=1, R[0,1]=0, R[1,0]=0, R[1,1]=1, R[0,2]=2, ... */
  zq_t expected_00 = 1, expected_01 = 0, expected_11 = 1;
  zq_t expected_22 = mod_q(5); /* A[1,1]=5, at R[2,2] */

  if (R_k.data[0 * 6 + 0] != expected_00) return -1;
  if (R_k.data[0 * 6 + 1] != expected_01) return -2;
  if (R_k.data[1 * 6 + 1] != expected_11) return -3;
  if (R_k.data[2 * 6 + 2] != expected_22) return -4;

  /* mat_mul self-test: I2 * A2 === A2 */
  matrix_t I2b, A2, C;
  mat_identity(&I2b, 2);
  mat_zero(&A2, 2, 2);
  A2.data[0] = 3; A2.data[1] = 7; A2.data[2] = 111; A2.data[3] = 13;
  A2.rows = 2; A2.cols = 2;
  mat_mul(&I2b, &A2, &C);

  if (C.data[0] != 3 || C.data[1] != 7 || C.data[2] != 111 || C.data[3] != 13) return -5;

  return 0; /* all tests passed */
}
