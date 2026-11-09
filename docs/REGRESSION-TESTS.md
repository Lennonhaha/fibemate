# Regression tests

The silver badge asks for regression tests covering at least half of the bugs
fixed in the last six months. This document records how that number was
measured, which pull requests count as code defects, and which test would catch
each defect if it came back.

## Method

1. Query merged pull requests in the window (from 2026-05-09):

   ```
   gh api --paginate "search/issues?q=repo:Lennonhaha/fibemate+is:pr+is:merged+merged:>=2026-05-09"
   ```

2. Keep the ones whose title describes a defect (`fix`, `bug`, `hotfix`,
   `regression`, `crash`, `leak`, `race`, `incorrect`, `wrong`, `broken`,
   `repair`). Documentation and site-copy changes are counted separately.
3. A *code defect* is one that changes an executable file (`.js`, `.cjs`,
   `.mjs`, `.ts`, `.rs`, `.py`, `.sh`) outside `docs/`.
4. A defect is covered when a test in `test/` fails if the defect returns. The
   test does not have to have been written in the same pull request; several
   were added later, which the criterion allows.

Result at the time of writing: 343 merged pull requests, 92 defect-shaped, of
which **40 touch executable code**. 23 of those 40 are covered — **57.5%**.

## Covered defects

| PR | Defect | Caught by |
|:---|:---|:---|
| #49 | fail-open anonymous auth | `test/http-integration.test.js` (401 sweep) |
| #47 | a2a required a gitignored module instead of inline helpers | `test/http-integration.test.js` (a2a block) |
| #84 | `GET /api/auth/verify` missing | `test/http-integration.test.js` (verify block) |
| #85 | verify response shape diverged from the spec | `test/http-integration.test.js` (verify block) |
| #92 | unresolved imports | `test/test-all.js` (module load smoke) |
| #97 | TDZ crash on startup, fail-open invite | `test/smoke-backend.js` |
| #115 | nightly cross-language test used the wrong reference | `test/ml-kem-768-oracle-interop.test.js` |
| #130 | native-module drift in the PQ ratchet | `test/crypto-boundaries.test.js` (hybrid session, JS path) |
| #140 | SBOM nested-name collision and missing version gate | `test/regression-guards.test.js` (sbom drift) |
| #155 | SM2 verify scalar blinding, dummy assertions | `test/crypto-boundaries.test.js` (SM2 block) |
| #161 | webcrypto polyfill for Node 18 | `test/test-all.js` |
| #234 | ws-padding not accepting ArrayBuffer | `test/regression-guards.test.js` (ArrayBuffer and views) |
| #269 | native secret-key layout | `test/test-fibemate.js` (KAT) |
| #284 | CBOM not CycloneDX 1.6 compliant | `test/regression-guards.test.js` (CBOM version + schema) |
| #286 | DCO parents condition and SBOM drift check | `test/regression-guards.test.js` (sbom drift) |
| #321 | native build on Windows, input validation, C↔JS parity | `test/test-fibemate.js` (KAT) |
| #322 | ws-padding above 64 KiB | `test/ws-padding.test.js`, `test/server-lib-boundaries.test.js` |
| #324 | ws key-exchange peer resolution | `test/key-exchange-recipient.test.js` |
| #339 | contradictory GPL header in an Apache-2.0 package | `test/regression-guards.test.js` (licence header) |
| #363 | unused `MIN_BLOCK` in ws-padding | `test/ws-padding.test.js` (round trip) |
| #376 | FIPS 204 secret-key encoding | `test/test-fibemate.js` (KAT) |
| #396 | hand-written Keccak as a silent fallback | `test/regression-guards.test.js` (no local Keccak) |
| #411 | `npm start` pointed at a missing file | `test/regression-guards.test.js` (script targets) |

## Defects without a test, and why

| PR | Defect | Status |
|:---|:---|:---|
| #41 | dead code removed (CodeQL) | no behaviour to assert |
| #42, #43 | rate limiting adopted, keyed on `X-Real-IP` | needs a load-style test; unverified |
| #46 | CORS origins externalised | deployment configuration |
| #87 | root server synced with production | deployment synchronisation |
| #95 | four CodeQL alerts | no behaviour to assert |
| #99 | `.env` loading at startup | environment dependent |
| #117 | VWZ verifier portability | research line, not shipped |
| #136 | type definitions | types only |
| #255 | CMI spelling gate | documentation gate |
| #248 | FIPS 204 options not forwarded through the public API | no test asserts option forwarding yet |
| #266 | Buffer payloads through `sendToUser`, log sanitisation | needs server internals exposed |
| #301 | index summary line | site copy |
| #323 | ws frame decoding by kind | needs the ws handler extracted |
| #412 | one tally in both outcomes | script-level, network dependent |
| #413 | DOI registry lookup | network dependent |
| #339 (site part) | HTML doctype handling | site copy |

## Keeping the number honest

The measurement is reproducible with the commands above; it is not a stored
constant. When a defect-shaped pull request is merged without a test, it should
be added to the second table with a reason, so the ratio can be recomputed
rather than assumed.
