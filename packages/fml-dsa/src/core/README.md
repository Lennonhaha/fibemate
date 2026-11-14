# `fml-dsa/src/core` — pure-JS reference implementation

As of 2026-11-15 this directory **is** the production path: `src/index.js` is a thin adapter
over these modules. Read the status below before changing that, because the reasoning that
kept it out of production for a month was sound and is now satisfied rather than ignored.

## Status

- **Pure-JS**: written to make the ML-DSA arithmetic readable and auditable, not to be fast.
- **On the production path since 2026-11-15.** `src/index.js` used to import `./core/native.js`,
  which read `www/noble-pq-bundle/ml-dsa.js` with `fs` and `eval`'d it. A tarball installed
  outside this repository therefore threw `ENOENT` on first import. `native.js` is deleted;
  the adapter now imports `keygen`/`sign`/`verify`/`encode` from here directly, with no `fs`,
  no `eval`, no network.
- **Verified against the oracle: pk, sk *and signatures*.** `pk`/`sk` are byte-identical to
  `@noble/post-quantum` 0.7.1 on three fixed seeds and signatures verify in both directions
  (`test/interop-oracle.test.js`, 24 assertions, 0 warnings). Since 2026-11-15 the
  deterministic signature is byte-identical too (`test/sign-deterministic-parity.test.js`,
  33 assertions over ML-DSA-44/65/87). Getting there required six FIPS 204 corrections:
  key generation expands `H(ζ ‖ k ‖ ℓ, 128)` instead of `H(ζ, 96)`;
  secret-key encoding packs `η − s` and `2^(d−1) − t0` instead of the raw
  values; `power2Round` uses the correct mod± bound; `ρ''` includes the 32-byte `rnd`
  field; `κ` advances by `ℓ`; and `ExpandMask` hashes `ρ ‖ LE16(κ+r)`
  and computes `γ₁ − t`. The last three were invisible to verification, which is
  exactly why byte equality with an independent implementation is the gate.
- **Cost is not measured.** This is still the slower implementation. If a performance budget
  ever matters for ML-DSA, measure before assuming it is adequate.

## Reference-analysis summary (2026-10-28, code-level only)

`git grep` restricted to `*.js,*.cjs,*.mjs,*.ts`, excluding `core/` itself:

| module | external refs |
|---|---|
| `all`, `keygen`, `sign`, `verify`, `encode` | `src/index.js` (the entry), tests, benchmark |
| `ntt`, `params`, `modmul`, `polyvec`, `sampling`, `reduce` | `src/index.js` via `all`, tests |
| `shakestream` | its own test and every module above |
| `native.js` | **deleted 2026-11-15** (was the `fs` + `eval` wrapper) |

Zero *external* refs does not mean removable: those modules are imported by other files **inside** `core/`, so moving them to `legacy/` would require rewiring imports. That is why this note exists instead of a move.

## Rules for touching this directory

1. **Do not add dependencies here.** A reference implementation that needs a package manager is no longer a reference.
2. **Do not change the import structure** (paths, barrel files, what imports what) unless this README is updated in the same change — the table above is the record of what is and is not load-bearing.
3. **Do not delete** modules on the strength of "no external references" alone; check intra-directory imports first.
4. If a module is wired into the production path, it needs the same evidence standard as `packages/pqc-kem`: byte-identical key material against an independent implementation and bidirectional interop, not just a self-consistent round-trip.

## Why keep it at all

The pure-JS version is the readable statement of what the algorithm does, and since
2026-11-15 it is also the shipped one. That is a deliberate trade: an implementation whose
reasoning can be read line by line is worth more here than a faster one nobody re-derives.

The second-opinion argument still stands, and it now cuts both ways: two independent ML-DSA
implementations that agree byte-for-byte are stronger evidence than one implementation
checked against itself — and the day they disagree, the readable one is how you find out
which is wrong.

## What must pass before anything here is wired into production

The bar is stated once, here, so it cannot drift. A module in this directory may enter the
production path only after all four of the following hold.

**Status of these four gates: all four pass as of 2026-10-28** (`test/interop-oracle.test.js`,
ML-DSA-65, `@noble/post-quantum` 0.7.1, 24/24). The mutation check removes the `k ‖ ℓ`
separator from key generation and the suite goes red (6 failed rows); restoring it returns 24/24.

### 1. Fixed-seed byte equality

With `seed = SHAKE256("fibemate-interop-matrix/2026-10/seed-i", 64)` for at least three
seeds, the module's `pk` and `sk` must be **byte-identical** to an independent
implementation. Not "interoperable", not "the same size" — identical bytes, compared as hex
in the test output.

### 2. Bidirectional signature interop

Signatures produced by this module must verify under the independent implementation, and
signatures produced there must verify here, for the same key and the same message. One
direction is not interop; it is a coincidence that happens to be testable.

### 3. Rejection control

A signature with exactly one flipped byte — and a public key with one flipped byte — must
verify `false`. It must not throw, and it must not verify. An exception in this control is
a `FAIL`, not a skip: FIPS 204 defines verification as a decision, and "crashed" is not one
of the two outcomes.

### 4. Retirement, if it cannot be fixed

If any of the above fails and cannot be fixed within one change, the module is **retired**
(`git rm`), not kept with a `known mismatch` note. The retirement follows the
`ml-kem-768-td` precedent: the deleted file's old TSR is frozen and stays valid for the
file as it was, and a **new** timestamp is issued against the merged retirement commit,
recording that the file is now deleted. No silent edit of a timestamped file.

Evidence for any of the four is the same as everywhere else in this repository: the run
manifest records the implementations and versions compared, every cell prints `PASS` or
`FAIL` with a verbatim error on failure, and no `warn()` and no literal-`true` assertion
appears in the harness. A conformance claim that cannot fail is not a claim.
