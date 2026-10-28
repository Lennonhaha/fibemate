# Asset manifest — 2026-10 evidence package

This directory is the "core asset" evidence package for October 2026: one reproducible
result, the plan that cites it, and the exact state of every repository at packaging time.
Each published item is covered by an RFC 3161 timestamp, and this manifest is timestamped
too, so the digests cannot be edited afterwards without breaking the chain.

## Contents

| file | bytes | sha256 | token |
|---|---:|---|---|
| `cyclonedx-data-loss-proof-202610.md` | 6302 | `26bf88cdf173db631e248597a32a5f485ca4c14ea69272f263b517123acd1bec` | `lg-111` |
| `verify_cyclonedx_data_loss.py` | 5170 | `accd674461443e264e2daf596f996a8d6717d9a730e34a59da2d878e8b6a6bb6` | `lg-114` |
| `ASSET-MANIFEST.md` | 3450 | `495762ae7afe7cc41ccd5be0143d7ca52a5c1e94cec932e5f0c25a48ca08437f` | `lg-115` |
| `repo-commits.txt` | 1799 | `c427498bad800055de6afd80351eed492fe650b50b906d2d380f26f9b5785da0` | `lg-113` |
| `paper-story.md` | 7473 | `9553c38d89f8d774eab166148a84fc7d345903fc4bd922f2a5041e099e95fd9d` | covered by the manifest token |
| `TOOLS.md` (workspace file, digest only) | 240902 | `08f67445f5443223335a795bbd8fc9d724bf14e9a3283856412d71dc276aabc0` | digest inside the manifest token |

## Why `TOOLS.md` is digest-only

`TOOLS.md` is the working discipline log. It contains internal operational detail —
host aliases, deploy paths, remote-execution notes — that has no business in a public
repository. Its **digest** is published instead: a timestamp over a hash proves the file
existed in this exact form at this time, without disclosing it. Anyone holding the file
can verify it; nobody can reconstruct it from this directory.

## What each item is for

- **`cyclonedx-data-loss-proof-202610.md`** — the reproducible measurement: a 1.7
  document round-tripped through `cyclonedx-python-lib` 11.12.0 loses
  `algorithmFamily` and `ellipticCurve` in all four format directions, keeps
  `parameterSetIdentifier`, and the output still validates against the official schema.
- **`verify_cyclonedx_data_loss.py`** — the script behind that table. Exit 0 means the
  bug is gone, 1 means it reproduced, 2 means the environment was wrong.
- **`repo-commits.txt`** — `main` head per repository, read from the GitHub API at
  packaging time, plus the published version of every artifact on npm and PyPI. This is
  what makes the package a snapshot rather than a story.
- **`paper-story.md`** — the paper plan the measurement feeds (contributions, required
  experiments, threats to validity).

## Superseded token

`lg-112` was issued for an earlier draft of this manifest, before the witness script
gained its SPDX header. The header changed the script digest, which changed this file, so
that token was discarded rather than kept as a decoy: a timestamp that verifies against
bytes nobody can produce is worse than no timestamp. The manifest is now `lg-115`.

## Related, already timestamped

`docs/tsa/2026-10-28-retire-ml-kem-768-td/` — `lg-109` records why the ML-KEM-768
time-domain module was retired, and `lg-110` timestamps the repository-wide
`SHA256SUMS` at that commit. Those answer "what did the tree look like when the module
was removed"; this package answers "what did we learn, and where did every repository
stand at the end of the month".

## Verification

```bash
sha256sum -c SHA256SUMS
openssl ts -verify -data <file> -in <token>.tsr -CAfile ../2026-09-06-vwz-rank2/freetsa-root-ca.pem
```

Tokens were obtained from FreeTSA (`https://freetsa.org/tsr`) and verified against the
pinned root CA before being written; a token whose imprint did not match the file digest
would have been discarded, not stored.

## Closing note

Nothing here is a security claim. This is a data-integrity result about a widely used
serialiser, and the value of the package is that it can be re-run, not that it can be
believed.
