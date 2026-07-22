# Experimental Branch: VWZ / LookingGlass

⚠️ **This branch contains experimental cryptographic components.**

## Contents

| Directory | Component | Status |
|-----------|-----------|--------|
| `research/vwz/` | VWZ signature scheme | Experimental, paper withdrawn |
| `research/lookingglass/` | LookingGlass v1 (DMTH) | Archived |
| `research/lgv2/` | LookingGlass v2 (wreath LWE) | Experimental |
| `rust/vwz-sign-wasm/` | VWZ WASM implementation | WASM artifact |
| `www/crypto/vwz/` | VWZ browser demo | Frontend demo |
| `www/crypto/lgv2/` | LG v2 WASM browser | Frontend demo |
| `www/vwz-challenge/` | VWZ cryptanalysis challenge | Public challenge |
| `src/vwz-research-api.js` | VWZ server API | Gated by flags.VWZ |

## Security Disclaimer

These components are **experimental** and **not recommended for production use**:

- VWZ scheme: paper withdrawn from ePrint; cryptographic assumptions unverified by third parties
- LookingGlass: reverse-engineering barrier only; does not strengthen LWE hardness
- No security claims are made for these components

## Reintegration

To reintegrate into `main`:
```bash
git checkout main
git merge experimental/vwz-lg --no-ff -m "merge: reintegrate VWZ/LG experimental components"
```

## Timeline

- **v1 (DMTH)**: 2026-06-22 ~ 2026-06-28 — Kronecker embedding, d≤3
- **v2 (wreath LWE)**: 2026-06-28 — group-equivariant nesting, d=5~8
- **Isolation**: 2026-07-22 — moved to experimental branch
