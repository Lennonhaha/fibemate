# evidence/

Raw output behind the headline numbers, so a claim can be checked instead of believed.

Each entry is a **claim → command → machine-readable result → raw log** quadruple. The
JSON file carries the date, the commit it was produced from, the environment it ran on
and the parsed numbers; the log next to it is the untouched stdout/stderr. If a number
appears on the site or in the README without an entry here, it is either dated to the
measurement that produced it or it should not be quoted.

| Claim | Result | Raw log | Measured |
|---|---|---|---|
| FPGA L8+L9 cross-validation: 43 of 43 cases | [`fpga-l8l9-43/2026-11-14.json`](fpga-l8l9-43/2026-11-14.json) | [`…/2026-11-14.log`](fpga-l8l9-43/2026-11-14-run.txt) | 2026-11-14 |
| TLA+ Path C-2: 7 invariants + L_Reach, 133,891 generated / 26,115 distinct, 0 violations | [`tla-c2/2026-11-14.json`](tla-c2/2026-11-14.json) | [`…/2026-11-14-tlc.log`](tla-c2/2026-11-14-tlc.txt) | 2026-11-14 |

## What is not here, and why

`p95=78.5ms` and `900/900` E2E sessions come from the July 2026 hybrid-KEX measurement
round. Reproducing them needs the E2E harness and a live reg-server, which is not
something a checkout can run — so instead of a fabricated JSON, every live mention
carries `（2026-07 实测）`. Dated claims age honestly; undated ones rot into fiction.

The TVLA and RFC 3161 material under `tvla/` and `tsr/` predates this convention and is
kept as it was published.

## Regenerating

```bash
node scripts/fpga-l8l9-43-test.js
java -cp tla2tools.jar tlc2.TLC -metadir "$(mktemp -d)" -config C2.cfg C2.tla   # in docs/tla/
```

The TLA+ run must print `Checking N branches of temporal properties` — a run that only
checks invariants does not exercise `L_Reach` and is not equivalent evidence.
