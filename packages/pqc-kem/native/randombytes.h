// SPDX-License-Identifier: Apache-2.0
// Source: pq-crystals/kyber (ref/), originally dual-licensed CC0-1.0 OR Apache-2.0
// Vendored: 2026-07-22 (FIBEMATE commit 59a00bd); upstream ref/ snapshot not pinned to a single commit
// Stub - not needed for derand API
#ifndef RANDOMBYTES_H
#define RANDOMBYTES_H
#include <stdint.h>
#include <stddef.h>
void randombytes(uint8_t *buf, size_t n);
#endif