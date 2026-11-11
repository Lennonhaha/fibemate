# ML-KEM-768 cross-validation against NIST ACVP vectors

Status: first external agreement result, 2026-11-11. Covers ML-KEM-768 only.

## Why this document exists

Every KAT in this repository is produced by this repository's own code. That proves
self-consistency and nothing else: a wrong implementation with a matching test passes.
The `.rsp` path added earlier had the same defect — its expected values were synthesised
locally, which exercises the parser but not the arithmetic.

This records the first run where the expected values came from someone else: NIST's own
ACVP vector files.

## What was compared

Source: `usnistgov/ACVP-Server`, directory `gen-val/json-files`, fetched 2026-11-11 with
`gh api -H 'Accept: application/vnd.github.raw'`. NIST publishes inputs and outputs as two
files per mode; the harness joins them on `tgId`+`tcId`.

| File | Bytes | SHA-256 |
|---|---|---|
| `ML-KEM-keyGen-FIPS203/prompt.json` | 16,066 | `3f9ce34f6c836c77958bad2729e837c3b213f44ac36c3065976e7acca6389523` |
| `ML-KEM-keyGen-FIPS203/expectedResults.json` | 544,032 | `a253d0ad91c95ebea5b409673defef0aa49d65d4ed72286399e2e798ddf073a4` |
| `ML-KEM-encapDecap-FIPS203/prompt.json` | 624,189 | `998e22dfb12efb14ce9fdff911ca634b13612819a1806f25da69adba7e16db91` |
| `ML-KEM-encapDecap-FIPS203/expectedResults.json` | 190,940 | `9089ec6ff2424da9f2782b89b2f831a329a3e28d6e5e24b802b78ff36ac61cdf` |

Provenance detail that belongs in the record rather than a footnote: the keyGen files
carry `isSample: false`, the encapDecap files carry `isSample: true`. Both are published
by NIST, but the second is the sample set, not the full validation set. Any claim of
"matched NIST's vectors" should say which of the two it means.

## Commands

```
node scripts/cross-validate-pqclean.cjs \
  --vectors  <acvp>/ML-KEM-keyGen-FIPS203__prompt.json \
  --expected <acvp>/ML-KEM-keyGen-FIPS203__expectedResults.json \
  --parameter-set ML-KEM-768

node scripts/cross-validate-pqclean.cjs \
  --vectors  <acvp>/ML-KEM-encapDecap-FIPS203__prompt.json \
  --expected <acvp>/ML-KEM-encapDecap-FIPS203__expectedResults.json \
  --parameter-set ML-KEM-768
```

## Results

| Mode | Cases run | Matched | Content |
|---|---|---|---|
| keyGen | 25 | **25** | `d`,`z` in → `ek` (1184 B), `dk` (2400 B) out, byte for byte |
| encapDecap | 35 | **35** | 25 encapsulation (`ek`,`m` → `c`,`k`) + 10 decapsulation (`dk`,`c` → `k`) |
| **Total** | **60** | **60** | 0 mismatches, 0 errors |

Skipped by group, not by case: the other two parameter sets (ML-KEM-512, ML-KEM-1024,
50 groups' worth of cases) and the key-check function groups. The implementation under
test is 768-only, so those would fail for a reason that is not a defect. The harness
prints how many groups it skipped instead of silently narrowing the run.

## Negative control

Running the same files with no `--parameter-set` filter gives **25/75**, exit code 1: the
512 and 1024 groups are checked against a 768 implementation and fail. This matters more
than the green result — it shows the harness is capable of reporting red. A gate that has
only ever been green has not been shown to work.

## What this does and does not establish

Establishes: this repository's ML-KEM-768 key generation, encapsulation and
decapsulation agree byte for byte with NIST's published ACVP vectors, including the
1184-byte encapsulation key and 2400-byte decapsulation key encodings.

Does not establish: agreement with liboqs, with PQClean's C build, or with any TLS stack;
behaviour under TLS; any parameter set other than 768; that this harness is wired into CI
(it is not — the vectors are 1.4 MB and the run needs network access, so wiring it is a
separate decision about what CI is allowed to fetch).

## Reproducing without the network

The four files above can be cached locally; the SHA-256 values are the pin. The harness
takes file paths, so a cached copy verifies identically offline.
