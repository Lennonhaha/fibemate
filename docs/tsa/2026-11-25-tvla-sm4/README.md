# SM4 TVLA timing screen — 2026-11-25

This directory anchors the SM4 timing screen required by issue #697, without
reusing or modifying the old `lg-080` token.

## Object

- `www/crypto/sm4-browser.js`
- SHA-256: `8058ab76058a0780a45b41b2e47521930a2585048d9891a2ea77709f677e39ef`
- 15,619 bytes at commit `4465ab8c34b61abd3c09acc5a021f89b9d9b78eb`
- `lg-080.tsr` timestamps a different object (`368b30d8…`, 2026-07-17); it is
  historical evidence only and is neither reused nor modified here.

## Run

```text
node scripts/tvla-sm4-live.cjs --n 5000 --runs 3 \
  --negative-control --negative-control-runs 3 \
  --out tmp/tvla-sm4-5000-main-20261125.json
```

The report at `evidence/tvla/tvla-sm4-5000-main-20261125.json` records three
independent runs (5,000 samples per group) with |t| = 0.18, 0.72, 0.64. All
three pass the project screen threshold (`|t| <= 4.5`). Three negative-control
runs produce |t| = 67.31, 64.37, 68.76, so the harness can fail on a deliberately
leaky path. The object hash is identical before and after the run.

## What this does and does not prove

This is a Node/V8 timing screen, not a formal constant-time proof. A pass means
no timing difference was detected at this sample size on this host; it does not
rule out data-dependent behaviour that this harness cannot observe. No new
cryptographic claim is made beyond the report's `overall: pass` and its stated
caveat.

## Contents

- `SHA256SUMS` — digests of the two TVLA JSON reports and the exact served
  `sm4-browser.js` object.
- `lg-117-tvla-sm4-20261125.tsq` / `.tsr` — RFC 3161 timestamp over
  `SHA256SUMS`, issued by FreeTSA.
- `timestamp-manifest.json` — token metadata, imprint and verification result.
