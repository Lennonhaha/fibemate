# `fml-dsa/src/core` — Phase-1 pure-JS reference implementation

This directory is a **reference implementation**, not part of the production path.

## Status

- **Phase-1 pure-JS**: written to make the ML-DSA arithmetic readable and auditable, not to be fast or shipped.
- **Not on the production path.** The published API enters at `packages/fml-dsa/src/index.js`, which imports `./core/native.js`; `native.js` is a Phase-1 wrapper that loads `www/noble-pq-bundle/ml-dsa.js` and exposes `ml_dsa44/65/87`. Nothing in the public API reaches the other modules here.
- **Verified reference implementation (2026-10-28).** `pk` and `sk` are byte-identical to `@noble/post-quantum` 0.7.1 on three fixed seeds, and signatures verify in both directions; see `test/interop-oracle.test.js` (24 assertions, 0 warnings). Getting there required two FIPS 204 corrections: key generation now expands `H(\u03b6 \u2016 k \u2016 \u2113, 128)` instead of `H(\u03b6, 96)`, and the secret-key encoding now packs `\u03b7 \u2212 s` and `2^(d\u22121) \u2212 t0` instead of the raw values.
- **Still not on the production path.** Byte equality with the oracle is evidence that the algorithm is right, not a reason to ship the slower implementation.

## Reference-analysis summary (2026-10-28, code-level only)

`git grep` restricted to `*.js,*.cjs,*.mjs,*.ts`, excluding `core/` itself:

| module | external refs |
|---|---|
| `native.js` | imported by `src/index.js` (the only entry) |
| `all`, `encode`, `sign` | benchmark + cross-noble test only |
| `ntt`, `params`, `modmul` | tests only |
| `shakestream` | its own test only |
| `keygen`, `polyvec`, `precomputed`, `reduce`, `sampling`, `verify` | none |

Zero *external* refs does not mean removable: those modules are imported by other files **inside** `core/`, so moving them to `legacy/` would require rewiring imports. That is why this note exists instead of a move.

## Rules for touching this directory

1. **Do not add dependencies here.** A reference implementation that needs a package manager is no longer a reference.
2. **Do not change the import structure** (paths, barrel files, what imports what) unless this README is updated in the same change — the table above is the record of what is and is not load-bearing.
3. **Do not delete** modules on the strength of "no external references" alone; check intra-directory imports first.
4. If a module is wired into the production path, it needs the same evidence standard as `packages/pqc-kem`: byte-identical key material against an independent implementation and bidirectional interop, not just a self-consistent round-trip.

## Why keep it at all

The pure-JS version is the readable statement of what the algorithm does; `native.js` is the shipped one. When the two disagree, the readable one is how you find out which is wrong — but only if it still compiles and the disagreement is checked by a test, not by eye.

As of 2026-10-28 it is also the second opinion: two independent ML-DSA implementations that agree byte-for-byte are stronger evidence than one implementation checked against itself.

## What must pass before anything here is wired into production

The bar is stated once, here, so it cannot drift. A module in this directory may enter the
production path only after all four of the following hold.

**Status of these four gates: all four pass as of 2026-10-28** (`test/interop-oracle.test.js`,
ML-DSA-65, `@noble/post-quantum` 0.7.1, 24/24). The mutation check removes the `k \u2016 \u2113`
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
