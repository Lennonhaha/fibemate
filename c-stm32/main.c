/**
 * main.c — TVLA Power Analysis Firmware for STM32F4 Discovery
 * 
 * Build: arm-none-eabi-gcc -mcpu=cortex-m4 -mthumb -O0 main.c tensor_tvla.c -o tvla.elf
 * Flash: st-flash write tvla.bin 0x08000000
 * 
 * GPIO PA0 → oscilloscope trigger (rising edge = operation start)
 * GPIO PB0 → mode select (GND=fixed, 3.3V=random)
 */

#include "tensor_tvla.h"
#include <stddef.h>

/* Minimal STM32F4 startup — no libc dependency */
void _start(void);
void Reset_Handler(void);
void Default_Handler(void);

/* Vector table */
__attribute__((section(".vectors")))
void (* const vector_table[])(void) = {
  (void *)0x20020000,  /* initial SP */
  Reset_Handler,
  Default_Handler,     /* NMI */
  Default_Handler,     /* HardFault */
  Default_Handler,     /* MemManage */
  Default_Handler,     /* BusFault */
  Default_Handler,     /* UsageFault */
  0,0,0,0,             /* reserved */
  Default_Handler,     /* SVCall */
  Default_Handler,     /* DebugMon */
  0,                   /* reserved */
  Default_Handler,     /* PendSV */
  Default_Handler,     /* SysTick */
};

void Default_Handler(void) {
  while (1) {}
}

/* Simple delay (busy-wait) */
void delay(uint32_t cycles) {
  volatile uint32_t c = cycles;
  while (c--) __asm__("nop");
}

/**
 * Main entry point.
 * 
 * Protocol:
 * 1. Wait 100ms for scope setup
 * 2. Read PB0 to determine fixed/random mode
 * 3. Run N=5,000 kron() operations with GPIO trigger
 * 4. Enter infinite loop (scope triggers stop → end of trace capture)
 */
void Reset_Handler(void) {
  /* Init GPIO for TVLA */
  tvla_trigger_init();
  tvla_mode_init();

  /* Warm-up: run kron() 10 times to stabilize power state */
  for (int i = 0; i < 10; i++) {
    tvla_run_fixed(0, 8);
  }

  /* Brief pause */
  delay(100000);

  /* Start of trace capture */
  tvla_trigger_high();

  /* Collection: 5000 kron() ops */
  int mode = tvla_mode_read();
  if (mode == 0) {
    tvla_run(5000, "fixed");
  } else {
    tvla_run(5000, "random");
  }

  tvla_trigger_low();

  /* Collection complete — halt */
  while (1) {}
}
