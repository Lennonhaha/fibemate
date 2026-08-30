# LookingGlass v1 (DMTH) — Archived

**Status**: 📦 Archived — superseded by LookingGlass v2 (equivariant LWE + wreath recursion)

**What**: DMTH (Dynamic Multi-layer Tensor Homomorphism) — linear Kronecker nesting, d=2~3 layers

**Why archived**:
- d>3 layers collapse to a single global matrix (linear nesting is mergeable)
- v2 solves this with group-equivariant layer constraints (Schur's lemma)
- v1 code preserved for research lineage and reproducibility

**Files**:
- `index.js` — module entry point
- `core/infinite-mirror.js` — layer nesting engine
- `core/mirror-layer.js` — single mirror layer
- `core/tensor-ops.js` — tensor arithmetic over Z_q
- `trapdoor/trapdoor-generator.js` — DMTH trapdoor generation
- `lookingglass-browser.js` — browser bundle (14.5KB)

**TSR trail**: lg-dmth-01 ~ lg-dmth-06 (2026-06-26)

**See also**:
- v2: `../lgv2/`
- DMTH explanation: `/docs/dmth-explanation.html`
- PQC readiness: `/docs/pqc-readiness.html` §7

> This is a frozen research snapshot. Do not use in production.
