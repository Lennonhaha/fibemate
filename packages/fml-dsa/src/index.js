// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/index.js — ML-DSA (FIPS 204) self-implemented with noble oracle fallback
// 2026-07-29: Phase 1 — noble-backed stubs; Phase 2 → native implementation

import { ml_dsa44_raw, ml_dsa65_raw, ml_dsa87_raw } from './core/native.js';

export const ml_dsa44 = ml_dsa44_raw;
export const ml_dsa65 = ml_dsa65_raw;
export const ml_dsa87 = ml_dsa87_raw;
