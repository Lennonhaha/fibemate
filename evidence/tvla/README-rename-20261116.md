<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Rename note: `tvla-9of9-corrected-report.json`

On 2026-11-16 this file was renamed to `tvla-mlkem-9ops-3pass-6fail.json`.

**Why.** The old name said "9of9", which reads as "nine of nine passed". The file it names reports
`{"pass":3,"fail":6,"total":9}` - three of nine. Anyone quoting the file by name inherited the wrong claim.

**Content is unchanged.** The rename was `git mv` only; the bytes are identical:

```
sha256 = 86893aa0b7b2737d85f0e4be2fb6fd55bd491618eaaa23e871ae1088575247d4
```

**Timestamps are still valid.** The `.tsq`/`.tsr` files next to it are RFC 3161 timestamps over the
file *content* (message imprint), not over the file name, so the rename does not invalidate them.
Historical records that mention the old path - `docs/TSR-MANIFEST.md` (and its 2026-10-29 snapshot),
`docs/tsa/timestamp-manifest.json`, `www/docs/tvla/ml-kem-768/` - describe the state at the time they
were written and are deliberately left untouched.

**Numbers in this file** (from the JSON itself, not from the prose summary):

| op | \|t\| | verdict |
|---|---|---|
| generateKeypair | 0.03 | PASS |
| encapsulate | 0.19 | PASS |
| decapsulate | 0.99 | PASS |
| byteEncode | 32.28 | FAIL |
| byteDecode | 35.07 | FAIL |
| compress | 50.56 | FAIL |
| decompress | 64.17 | FAIL |
| polyMul | 24.94 | FAIL |
| matVecMul | 10.99 | FAIL |

N = 5,000 samples, 2,000 warm-up, threshold \|t\| < 4.5. The six failures are non-core operations;
the argument that they are not exploitable is in `tvla-defense-for-reviewers.md` and the summary.
