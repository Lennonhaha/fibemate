# 2026-10-28 — interop matrix, first recorded run

One RFC 3161 timestamp (`lg-116`) over the digest list of the first shipped ML-KEM-768
interoperability matrix run.

| number | artifact | meaning |
|---|---|---|
| lg-116 | `SHA256SUMS` | digests of the 14 matrix artifacts (2 reports + 12 cell logs), as committed |

Stamped by FreeTSA (`https://freetsa.org/tsr`). The `.tsr` carries a certificate and was
verified against `docs/tsa/2026-09-06-vwz-rank2/freetsa-root-ca.pem` with `openssl ts
-verify`; the imprint inside the token was also compared byte for byte against the digest of
`SHA256SUMS`.

## What is being sealed

The artifacts live in the `fibemate-tools` repository, not here; this directory holds the
digest list and the token.

| path (relative to `fibemate-tools`) | bytes |
|---|---:|
| `interop-matrix/out/matrix.json` | 23784 |
| `interop-matrix/out/matrix.md` | 1916 |
| `interop-matrix/out/logs/*.log` (12 files) | 2609–2610 each |

`matrix.json` is the machine record: end versions and source `sha256`, resolved commits, the
seed table, per-cell checks, controls, and the verdict. `matrix.md` is the same result as
tables, with `=P` / `!=P` instead of digests. The 12 logs are the raw hex per cell — pk, ct,
and the shared secret from each side — for anyone who wants to diff by hand rather than trust
a summary column.

## Provenance

| repository | commit | role |
|---|---|---|
| `fibemate-tools` | `c64cf35` | `main` at packaging time; the tree the digests were taken from |
| `fibemate-tools` | `bb58561` | the commit that added these exact bytes |
| `fibemate-tools` | `898ce28` | recorded in `matrix.json` as `commits.fibemateTools` — the code that produced the bytes |
| `fibemate` | `e4d3d58` | recorded as `commits.fibemate` — end P's tree |

`repo-commits.txt` carries the same table in plain text.

The recorded run commit and the artifacts commit differ by design: a run cannot name the
commit that contains its own output. `bb58561` exists to make the two agree — it replaced the
artifacts with a re-run from `898ce28`, after confirming that `matrix.json` was identical
modulo `generatedAt` and that field, `matrix.md` identical modulo its timestamp, and all 12
logs byte-identical. So the recorded commit is the one whose `run.cjs` produced these bytes,
and the refresh that established it is itself a recorded change rather than a silent edit.

## What the token does and does not prove

It proves these digest-list bytes existed at the stamped time. It does **not** by itself prove
the artifacts match: that is one `sha256sum -c` away, because the list is a plain digest list
and the artifacts are pinned by a public commit.

```bash
cd fibemate-tools
git checkout c64cf35
sha256sum -c ../fibemate/docs/tsa/2026-10-28-interop-matrix/SHA256SUMS
openssl ts -verify \
  -data ../fibemate/docs/tsa/2026-10-28-interop-matrix/SHA256SUMS \
  -in ../fibemate/docs/tsa/2026-10-28-interop-matrix/lg-116-interop-matrix-SHA256SUMS.tsr \
  -CAfile ../fibemate/docs/tsa/2026-09-06-vwz-rank2/freetsa-root-ca.pem
```

A green `sha256sum -c` plus a green `ts -verify` gives: *these artifacts, as committed at
`c64cf35`, existed no later than the stamped time.* Neither command says anything about
whether the matrix is correct — that is what the run's own self-test is for
(`interop-matrix/selftest.cjs`, four runs, two of which must report INVALID and one FAIL).

## Result being sealed

PASS, 62/62 checks, 12 cell rows (4 cells × 3 seeds), 6 baselines, 0 failed. `pk` and `sk`
byte-identical across ends on all three seeds; ciphertexts byte-identical per cell; every cell
including the four cross rows decapsulates to the sender's secret. Controls: flipped
ciphertext gives a deterministic pseudo-random secret with no exception and the same secret on
both ends; a wrong key does not return the sender's secret; three seeds give three distinct
`pk`.

This is a conformance/interop measurement between `fibemate-pqc-kem` 0.1.0 and
`@noble/post-quantum` 0.7.1. It is not a security claim, not a KAT, and says nothing about
side channels or timing.
