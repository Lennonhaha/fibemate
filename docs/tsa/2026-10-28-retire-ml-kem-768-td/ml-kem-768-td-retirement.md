# ML-KEM-768 time-domain module: retirement record

SPDX-License-Identifier: Apache-2.0

This record pins the state of `src/crypto/ml-kem-768-td.js` **after** its retirement. It does not
replace any earlier evidence; it documents the change that made the earlier evidence
historical.

| field | value |
|---|---|
| retired file | `src/crypto/ml-kem-768-td.js` |
| current state | **deleted** (present in working tree: false) |
| retirement merge commit | `4064ba85c9919851269abe0102af26691f5e5428` |
| commit subject | refactor(crypto): retire the ML-KEM-768 time-domain module (#367) |
| commit author | 刘天赫 <research@fibemate.net> |
| commit date | Wed Oct 28 16:42:07 2026 +0800 |
| pull request | Lennonhaha/fibemate#367 |
| decision record | `docs/rfc/ML-KEM-768-seed-derivation-20261028.md` (option B) |

## Why it was retired

The module implemented ML-KEM-768 with a different key-generation seed derivation than
FIPS 203: it computed `sha3_512(d)` at lines 275 and 486, whereas the standard specifies
`(rho, sigma) = G(d || k)` and every other implementation in this tree passes `k`.

Measured on 2026-10-28 against `@noble/post-quantum` 0.4.1 as an independent oracle:

- `packages/pqc-kem`: public key and secret key byte-identical to the oracle, and
  decapsulates oracle ciphertexts;
- `src/crypto/ml-kem-768-td.js`: no shared key material with the oracle, and interop failed
  in all three directions (packages→td, td→packages, oracle→td), although the module was
  internally consistent.

Retirement was chosen over repair because the missing `k` cannot by itself explain
interoperability failure, so the module would still have required a full audit.

## Relationship to earlier evidence

The earlier timestamp for this file — `docs/tsa/2026-06-08/ml-kem-768-td.js.tsq` /
`.tsr` and the corresponding entries in `docs/INTEGRITY-MANIFEST.md` and
`docs/TSR-MANIFEST.md` — remains valid **for the file as it existed then**. It is frozen
and must not be rewritten, regenerated or deleted. The two records answer different
questions:

- the 2026-06-08 TSR answers "did this exact file exist at that time";
- this record answers "is this file still part of the tree, and why not".

## Integrity note

`SHA256SUMS` in this directory lists every file tracked at commit `${mergeCommit}`, with
one exception: it cannot list itself. Its own digest is recorded in the manifest entry and in
the TSR that covers it. Lines are `<sha256>  <path>` relative to the repository root, sorted
the way `git ls-files` emits them.

## What replaced it

`packages/pqc-kem/src/ml-kem-768.js`, which is byte-identical to the independent oracle
and is now the only ML-KEM-768 implementation used by `src/tls-hybrid-extension.js`.
Regression gate: `test/ml-kem-768-oracle-interop.test.js` (runs in `npm test`) fails if the
retired file reappears.
