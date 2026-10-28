# `fml-dsa/src/core` — Phase-1 pure-JS reference implementation

This directory is a **reference implementation**, not part of the production path.

## Status

- **Phase-1 pure-JS**: written to make the ML-DSA arithmetic readable and auditable, not to be fast or shipped.
- **Not on the production path.** The published API enters at `packages/fml-dsa/src/index.js`, which imports `./core/native.js`; `native.js` is a Phase-1 wrapper that loads `www/noble-pq-bundle/ml-dsa.js` and exposes `ml_dsa44/65/87`. Nothing in the public API reaches the other modules here.
- **Kept for reference.** Retained deliberately pending an architecture decision (either wire a pure-JS path in with its own test evidence, or retire the directory). No decision has been made, so nothing here has been deleted.

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

## What must pass before anything here is wired into production

The bar is stated once, here, so it cannot drift. A module in this directory may enter the
production path only after all four of the following hold.

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
