# 2026-10 core asset evidence package

One reproducible result, the plan it feeds, and the state the month closed on. Four RFC
3161 tokens from FreeTSA, each verified against the project's pinned root CA before being
stored.

| lg | subject | bytes | granted |
|---|---|---:|---|
| `lg-111` | `cyclonedx-data-loss-proof-202610.md` | 6302 | Oct 28 09:23:32 2026 GMT |
| `lg-113` | `repo-commits.txt` | 1799 | Oct 28 09:23:34 2026 GMT |
| `lg-114` | `verify_cyclonedx_data_loss.py` | 5170 | Oct 28 09:30:57 2026 GMT |
| `lg-115` | `ASSET-MANIFEST.md` | 3867 | Oct 28 09:30:59 2026 GMT |

## Contents

- `cyclonedx-data-loss-proof-202610.md` — a CycloneDX 1.7 document loses
  `algorithmFamily` and `ellipticCurve` when round-tripped through
  `cyclonedx-python-lib` 11.12.0, in all four format directions, while the emitted
  document still validates. Re-measured 2026-10-28.
- `verify_cyclonedx_data_loss.py` — the script behind that table. Exit 0 = fixed,
  1 = reproduced, 2 = environment error.
- `ASSET-MANIFEST.md` — digests of every item, including the digest-only entry for the
  workspace discipline log (`TOOLS.md`), which is not published.
- `repo-commits.txt` — `main` head of every repository plus the published version of
  every artifact, read from the GitHub and registry APIs at packaging time.
- `paper-story.md` — the paper plan these results support.
- `timestamp-manifest.json` — machine-readable record of the tokens.
- `SHA256SUMS` — per-file digests for `sha256sum -c`.

## Superseded: lg-112

`lg-112` was issued for an earlier draft of `ASSET-MANIFEST.md`. The witness script
then gained the SPDX header the repository gate requires, which changed the script
digest, which changed the manifest. The token was discarded instead of committed: a
timestamp that verifies against bytes nobody can reproduce is worse than no timestamp.
The manifest is now `lg-115`.

## Verify

```bash
cd docs/tsa/2026-10
sha256sum -c SHA256SUMS

openssl ts -verify -data cyclonedx-data-loss-proof-202610.md \
  -in lg-111-cyclonedx-data-loss-proof.tsr \
  -CAfile ../2026-09-06-vwz-rank2/freetsa-root-ca.pem
```

Same for `lg-113` (`repo-commits.txt`), `lg-114` (`verify_cyclonedx_data_loss.py`) and
`lg-115` (`ASSET-MANIFEST.md`).

Related: `docs/tsa/2026-10-28-retire-ml-kem-768-td/` (`lg-109`, `lg-110`) timestamps
the retirement of the ML-KEM-768 time-domain module and the repository-wide checksums at
that commit.
