# TVLA Power Analysis — STM32 Cortex-M4 C Port
# LookingGlass Core Tensor Operations
#
# Build targets:
#   make test    — host validation (gcc, no hardware needed)
#   make flash   — STM32F4 Discovery (arm-none-eabi-gcc required)
#
# Pre-requisites:
#   Host test: gcc + libm (standard)
#   STM32:     arm-none-eabi-gcc + st-flash (or OpenOCD)

# ============================================
# Host-side validation
# ============================================

test: test_standalone.c tensor_tvla.c tensor_tvla.h main.c
	gcc -DTEST_STANDALONE -DTENSOR_MAX_N=16 -DTVLA_TEST_NO_GPIO \
		-O0 -Wall -Wextra -std=c99 \
		-o test_tensor_tvla \
		test_standalone.c tensor_tvla.c main.c -lm
	./test_tensor_tvla

# ============================================
# STM32F4 Discovery (Cortex-M4)
# ============================================

CC_ARM = arm-none-eabi-gcc
CFLAGS_ARM = -mcpu=cortex-m4 -mthumb -mfloat-abi=soft \
             -O0 -Wall -Wextra -std=c99 -nostdlib -ffreestanding \
             -DTENSOR_MAX_N=16

tvla.bin: main.c tensor_tvla.c tensor_tvla.h
	$(CC_ARM) $(CFLAGS_ARM) -T stm32f4.ld -o tvla.elf main.c tensor_tvla.c -lm
	arm-none-eabi-objcopy -O binary tvla.elf tvla.bin
	arm-none-eabi-size tvla.elf

flash: tvla.bin
	st-flash write tvla.bin 0x08000000

clean:
	rm -f test_tensor_tvla tvla.elf tvla.bin

.PHONY: test flash clean
