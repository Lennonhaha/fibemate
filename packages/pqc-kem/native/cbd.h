// SPDX-License-Identifier: Apache-2.0
// Source: pq-crystals/kyber (ref/), originally dual-licensed CC0-1.0 OR Apache-2.0
// Vendored: 2026-07-22 (FIBEMATE commit 59a00bd); upstream ref/ snapshot not pinned to a single commit
#ifndef CBD_H
#define CBD_H

#include <stdint.h>
#include "params.h"
#include "poly.h"

#define poly_cbd_eta1 KYBER_NAMESPACE(poly_cbd_eta1)
void poly_cbd_eta1(poly *r, const uint8_t buf[KYBER_ETA1*KYBER_N/4]);

#define poly_cbd_eta2 KYBER_NAMESPACE(poly_cbd_eta2)
void poly_cbd_eta2(poly *r, const uint8_t buf[KYBER_ETA2*KYBER_N/4]);

#endif
