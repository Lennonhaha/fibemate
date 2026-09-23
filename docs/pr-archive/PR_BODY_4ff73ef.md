## What
Fix factual errors in SM2/security docs:
- security.html: git clone URL 404 -> Lennonhaha/fibemate (curl verified);
  TSR count 122 -> 260 (lg-001~lg-108); open-source status "届时" ->
  already open 2026-08-31 v3.3.0
- blog.html: N=10,000 TVLA -> N=5,000 high-order (20/20)
- sm2-optimization.html: TVLA ref corrected (v1.3 high-order N=5,000/
  max|t|=1.24); perf v1.3 (Comb 07-09) disambiguated from sec v1.3
  (Montgomery Ladder 06-18); stage count 5/7->6; word count ~3500->~2700

## Why
These were incorrect published figures (off-by-version, outdated counts,
dead clone URL). All corrections trace to audited source docs.

## Scope
- 3 files: www/security.html, www/blog.html, www/docs/sm2-optimization.html
- Text-only; no markup/layout change
- git clone URL fix verified: github.com/fibemate/fibemate 404 ->
  Lennonhaha/fibemate 200

## Audit
- git clone URL fix = A-tier item #9
- TVLA/TSR/version/stage/npm corrections = B-tier #10, folded in after per-item review
- Deferred (NOT in this PR): #4 tsr loop command, #3 timeline