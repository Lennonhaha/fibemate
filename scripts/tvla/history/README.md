# scripts/tvla/history

Frozen artifacts kept for the record. Nothing here is read by CI.

## `gradient-results.txt` (2026-07-23)

The SM2 stress-gradient run. It is the clearest example of why this directory
stopped being a gate input:

- the file records `verify: [0.56, 3.75, 12.19] ... LEAK (wNAF timing)` —
  a real `|t| = 12.19` breach, in the file, in the repository;
- the old scanner matched only the literal `|t| = <number>` form, so it never
  saw those numbers. The one value it *did* extract was `|t|=4.5` from the
  sentence "crosses `|t|=4.5` at N≥1749" — i.e. **the threshold constant from
  prose**, counted as a passing sample;
- result: `max|t| = 4.50`, exactly on the line, PASS, exit 0, every night.

The nightly gate now runs the live timing test instead
(`scripts/tvla-live-gate.cjs` → `scripts/tvla-summary.js --include=…`).
