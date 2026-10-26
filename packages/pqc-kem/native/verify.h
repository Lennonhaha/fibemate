// SPDX-License-Identifier: Apache-2.0
// Source: pq-crystals/kyber (ref/), originally dual-licensed CC0-1.0 OR Apache-2.0
// Vendored: 2026-07-22 (FIBEMATE commit 59a00bd); upstream ref/ snapshot not pinned to a single commit
#ifndef VERIFY_H
#define VERIFY_H

#include <stddef.h>
#include <stdint.h>
#include "params.h"

#define verify KYBER_NAMESPACE(verify)
int verify(const uint8_t *a, const uint8_t *b, size_t len);

#define cmov KYBER_NAMESPACE(cmov)
void cmov(uint8_t *r, const uint8_t *x, size_t len, uint8_t b);

#define cmov_int16 KYBER_NAMESPACE(cmov_int16)
void cmov_int16(int16_t *r, int16_t v, uint16_t b);

#endif
