// SPDX-License-Identifier: MIT AND GPL-3.0-only
// Copyright (c) 2024 Paul Miller (https://paulmillr.com)
// @noble/post-quantum - MIT License (https://paulmillr.com/posts/noble-post-quantum)
// FIBEMATE Project - GPL-3.0-only (https://fibemate.net)
// ---------------------------------------------------------------------------
/** ML-DSA-87 for 256-bit security level. OK after 2030, as per ASD. */
export const ml_dsa87: TRet<DSA> = /* @__PURE__ */ (() =>
  getDilithium({
    ...PARAMS[5],
    CRH_BYTES: 64,
    TR_BYTES: 64,
    C_TILDE_BYTES: 64,
    XOF128,
    XOF256,
    securityLevel: 256,
  }))();