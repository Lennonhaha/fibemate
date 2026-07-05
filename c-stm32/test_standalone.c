/**
 * test_standalone.c — Host-side validation of tensor_tvla C code
 * 
 * Compiles and runs on any Linux/macOS machine (no STM32 required).
 * 
 * Build:
 *   gcc -DTEST_STANDALONE -DTENSOR_MAX_N=16 -DTVLA_TEST_NO_GPIO \
 *       -O0 -o test_tensor_tvla tensor_tvla.c -lm
 * 
 * Run:
 *   ./test_tensor_tvla
 */

#include <stdio.h>
#include <stdint.h>
#include <stddef.h>

/* Forward declarations from tensor_tvla.c */
int  tensor_tvla_self_test(void);
void tvla_run_fixed(void *result, uint8_t n);
void tvla_run(uint16_t iterations, const char *mode);

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;

  /* Self-test */
  int ret = tensor_tvla_self_test();
  if (ret != 0) {
    printf("SELF-TEST FAILED: %d\n", ret);
    return 1;
  }
  printf("SELF-TEST PASSED\n");

  /* Warm-up */
  for (int i = 0; i < 10; i++) tvla_run_fixed(0, 8);

  /* Fixed run */
  printf("Fixed run: 5000 kron() ops... ");
  tvla_run(5000, "fixed");
  printf("done\n");

  /* Random run */
  printf("Random run: 5000 kron() ops... ");
  tvla_run(5000, "random");
  printf("done\n");

  printf("ALL TESTS COMPLETE\n");
  return 0;
}
