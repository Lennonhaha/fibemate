# TESTING.md — FIBEMATE Test Guide

> Last updated: 2026-09-05 · Detailed methodology: [docs/testing.md](./docs/testing.md)

## Quick Start

```bash
npm install
npm test                # full local suite (see below)
npm run lint            # ESLint (packages/pqc-kem/src + test)
npm run spdx:check      # SPDX header completeness
```

`npm test` runs `test/test-all.js`, which aggregates:

| Suite | Command | Covers |
|---|---|---|
| Keccak/SHA-3 | `node test/test-keccak.js` | SHA-3/SHAKE vectors, 54/54 vs `node:crypto` |
| Integrity + full harness | `node test/test-fibemate.js` | KAT, round-trip, pairwise consistency, **FIPS 140-3 §11.9 integrity baseline** (`test/INTEGRITY-MANIFEST.json`) |
| Crypto smoke | `node test/smoke-crypto.js` | ML-KEM keygen/encap/decap round-trip |
| ML-KEM roundtrip CI | `node scripts/ci-mlkem-kat.cjs` | 100/100 round-trip, 20/20 key uniqueness |

## CI Pipeline

`.github/workflows/ci.yml` (push + PR):

| Job | What it runs |
|---|---|
| `gm-crossval` | SM2/SM3/SM4 cross-validation (3 OS × 2 Node) |
| `mlkem-kat` | ML-KEM round-trip CI (3 OS × 2 Node) |
| `node-test` | `test/test-keccak.js` + `test/test-fibemate.js` (3 OS × 2 Node) |
| `bench` | PQC benchmark regression (ubuntu) |
| `sbom` | SBOM generation |
| `lint` | ESLint `--max-warnings 0` + **SPDX header check** (`tools/add-spdx-headers.cjs check`) |
| `docs-check` | Documentation consistency |
| `bom-check` | Encoding / corruption scan (`scripts/check-encoding.cjs`) |

Additional workflows: `dco.yml` (Signed-off-by on every PR commit), `ci-native.yml`
(C native addon), `codeql.yml`, `repolinter.yml`, `scorecard.yml`, nightly regressions.

## Where Tests Live

| Path | Purpose |
|---|---|
| `test/test-fibemate.js` | Main harness: KAT + round-trip + integrity (36 checks) |
| `test/test-keccak.js` | Keccak/SHA-3/SHAKE standalone |
| `test/smoke-crypto.js` | Pre-commit crypto smoke |
| `test/test-cross-lang.js` / `-seeded.js` | Cross-language verification (C/Python/JS) |
| `test/a2a-smoke.js` | Agent-to-agent protocol smoke |
| `test/run-compat-fixtures.mjs` | Compat fixture runner (golden JSON) |
| `scripts/ci-mlkem-kat.cjs` | ML-KEM round-trip CI |
| `scripts/ci-gm-sm2/sm3/sm4.cjs` | National-standard algorithm CI |
| `tools/*/test/` | Per-tool unit tests (kat-verifier, pqc-deploy, pqc-migrate, tsr-verify) |
| `packages/*/test/` | Package-level tests (fml-dsa, pqc-kem, algorithm-registry) |

## Integrity Baseline (FIPS 140-3 §11.9)

`test/INTEGRITY-MANIFEST.json` anchors the SHA-256 of
`www/crypto/ml-kem-768.js`. The test **compares** against the baseline; it never
overwrites it silently. On intentional module change, the test rebuilds the
baseline for review — commit both together. The manifest is RFC 3161 timestamped
(`docs/tsa/2026-06-08/test_INTEGRITY-MANIFEST.json.tsr`).

See [docs/INTEGRITY-MANIFEST.md](./docs/INTEGRITY-MANIFEST.md) for full details.

## National Standard Vectors

| Algorithm | Standard | CI script |
|---|---|---|
| ML-KEM-768 | FIPS 203 | `scripts/ci-mlkem-kat.cjs` |
| ML-DSA (fml-dsa) | FIPS 204 | `packages/fml-dsa/test/` (KeyGen KAT 75/75, noble oracle 7/7) |
| SM2 | GB/T 32918 | `scripts/ci-gm-sm2.cjs` (100 sign/verify + 100 encrypt/decrypt) |
| SM3 | GB/T 32905 | `scripts/ci-gm-sm3.cjs` (30) |
| SM4-GCM | GB/T 32907 | `scripts/ci-gm-sm4.cjs` (30) |
