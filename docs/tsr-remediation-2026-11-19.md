# TSR attestation remediation, 2026-11-19

Issue #579 found ten tracked `.tsr` files that are not RFC 3161 tokens. This page
records what was removed, what replaced it, and what remains unresolved, so the
next person does not have to re-derive it.

Counting rule from this date on: **`valid` is the only figure that may be called
evidence.** `node scripts/count-tsr.cjs` prints it, and
`node scripts/check-tsr-copy.cjs` refuses to let public copy drift from it.

## What was removed (10 files, 374 -> 364)

Eight HTML error pages, 259 B each, every one a TSA response page saved under a
`.tsr` name:

| path | size | classified |
| --- | --- | --- |
| `evidence/tvla/tvla-9of9-corrected-report.json.tsr` | 259 B | `html_error_page` |
| `evidence/tvla/tvla-9of9-summary.md.tsr` | 259 B | `html_error_page` |
| `evidence/tvla/tvla-defense-for-reviewers.md.tsr` | 259 B | `html_error_page` |
| `evidence/tvla/tvla-experiment-5-polyMul-attack-verification.json.tsr` | 259 B | `html_error_page` |
| `www/docs/tvla/ml-kem-768/tvla-9of9-corrected-report.json.tsr` | 259 B | `html_error_page` |
| `www/docs/tvla/ml-kem-768/tvla-9of9-summary.md.tsr` | 259 B | `html_error_page` |
| `www/docs/tvla/ml-kem-768/tvla-defense-for-reviewers.md.tsr` | 259 B | `html_error_page` |
| `www/docs/tvla/ml-kem-768/tvla-experiment-5-polyMul-attack-verification.json.tsr` | 259 B | `html_error_page` |

Two plain-text TSA errors, 50 B each, body `000.0% #Bad request format or system error`:

| path | size | classified |
| --- | --- | --- |
| `docs/tsa/deploy_sh.tsr` | 50 B | `tsa_text_error` |
| `www/docs/tsa/deploy_sh.tsr` | 50 B | `tsa_text_error` |

The `.tsq` request files next to the eight HTML pages were **kept**: they are the
requests whose tokens exist elsewhere, and a request is not invalidated by a
failed response.

## What covers the eight pages instead

`www/docs/tsa/2026-07-01/` already holds 86 valid tokens, in dual-authority pairs
(FreeTSA + DigiCert), for the same four documents:

| document | tokens (both authorities, classifier verdict `VALID`) |
| --- | --- |
| corrected report | `tvla-9of9-corrected-report_{freetsa,digicert}.tsr` |
| summary | `tvla-9of9-summary-tsr_{freetsa,digicert}.tsr` |
| defense for reviewers | `tvla-defense-reviewers-tsr_{freetsa,digicert}.tsr` |
| experiment 5 (polyMul) | `tvla-exp5-tsr_{freetsa,digicert}.tsr` |

Sizes are 973-1138 B, i.e. DER tokens rather than error pages, and the classifier
returns `VALID` for each. Deleting the error pages therefore removes a broken
copy, not the evidence.

## Originals: located, so re-signing is possible

The four documents are not under `evidence/tvla/`, which is why "the original is
missing" was the first reading. They exist elsewhere on `main`:

| document | canonical copies |
| --- | --- |
| `tvla-9of9-corrected-report.json` | `p0_evidence_20260604_033053/`, `www/docs/tvla/ml-kem-768/` |
| `tvla-9of9-summary.md` | `evidence/tvla/` |
| `tvla-defense-for-reviewers.md` | `docs/`, `p0_evidence_20260604_033053/` |
| `tvla-experiment-5-polyMul-attack-verification.json` | `p0_evidence_20260604_033053/`, `www/docs/tvla/experiments/` |

Re-signing is available if the 2026-07-01 tokens are ever judged insufficient.
It is not required now, and it is deliberately not part of this change.

## Unbound: two requests with no document token

`evidence/tvla/tvla-defense.tsq` and `evidence/tvla/tvla-final.tsq` have no
sibling `.tsr` in either TVLA tree. The 2026-07-01 folder does contain
`tvla-defense-tsq_*` and `tvla-final-tsq_*` tokens, but those attest the request
file, not a document.

Status: **unbound** - request exists, subject unknown, nothing to verify and
nothing to re-sign. They are recorded here rather than deleted, because a missing
token is a fact worth keeping; deleting the request would turn a gap into silence.

## Reproduce

```
node scripts/count-tsr.cjs                 # raw 364, invalid 0, valid 364
node scripts/check-tsr-copy.cjs            # 13 public files, numbers match
node scripts/check-metrics.cjs             # registry matches the tree
```

`invalid 0` is the assertion that matters: it says every remaining tracked `.tsr`
classifies as a token by content, not by extension.
