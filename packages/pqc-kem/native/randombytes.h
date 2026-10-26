// SPDX-License-Identifier: Apache-2.0
// Source: pq-crystals/kyber (ref/), originally dual-licensed CC0-1.0 OR Apache-2.0
// Vendored: 2026-07-22 (FIBEMATE commit 59a00bd); upstream ref/ snapshot not pinned to a single commit
#ifndef RANDOMBYTES_H
#define RANDOMBYTES_H

#include <stddef.h>
#include <stdint.h>

#define RANDOMBYTES_SUCCESS 0
#define RANDOMBYTES_FAILURE (-1)

/*
 * Fill buf with n bytes from the operating system CSPRNG.
 *
 * Returns RANDOMBYTES_SUCCESS, or RANDOMBYTES_FAILURE after zeroising buf.
 * Callers MUST NOT use buf or derive key material when this fails: upstream
 * ref/ aborts, this port propagates the error so the addon can throw instead of
 * killing the host process. Failure must never degrade into a key.
 */
int randombytes(uint8_t *buf, size_t n);

#endif
