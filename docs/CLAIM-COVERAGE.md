# Claim coverage

A claim is a sentence a reader can act on. Some of them can be falsified by a
machine, some cannot. This directory exists to make the difference visible instead
of letting a green build imply more than it checked.

## Three kinds of sentence

| Kind | Example | What keeps it honest |
|---|---|---|
| Contract | "SM2 passes 100 published vectors." | a script that fails when it stops being true, wired into a CI job |
| Backlog contract | "The release's `data/` is a symlink to the shared database." | nothing yet — visible here so it cannot be forgotten |
| Context | "The handshake is described in §3." | a human, occasionally |

Only contracts are gated. Backlog contracts are listed with the reason they are
not gated yet, and the list has a budget: it fails when it grows.

## Two numbers, never one ratio

```
[claim-coverage] contracts: 24/24 bound (must 24/24, 100%)
[claim-coverage] backlog (visible, not gated): 7 unbound must-bind statements
[claim-coverage] corpus context: 1,386 claim lines in 281 files; a contract is one assertion, not one line
```

- **contracts** is the gate metric. A `must` contract must be bound, or the job fails.
- **corpus** is the inventory of lines that carry a witness (`scripts/claims/inventory.cjs`).
  It is context, not coverage: one contract can cover a thousand lines, and a
  thousand bound lines do not make one contract. Reporting `24/2027` would be
  arithmetic on two different units.

The old "7.6% of claims are machine-bound" figure came from a one-off audit whose
denominator was never committed. A metric that nobody can recompute is a rumour
with a percent sign, so the inventory script is now the denominator.

## What counts as bound

A contract is bound when **both** hold:

1. the named script exists at the named path, and
2. the named CI job's `run:` block actually invokes it.

The second half matters: a script that exists but is never executed is the same
false green as a job that exists but never runs. This is the failure mode that let
`all-checks` pass while `node-test (macos)` was cancelled.

`node scripts/claims/coverage.cjs --self-test` proves the gate fails for an
unbound contract, for a script outside every CI `run:` block, and for a backlog
that outgrows its budget.

## Adding a contract

1. Add the check to an existing CI job (or a new one) — a script that runs.
2. Append an entry to `registry.json` under `contracts`, naming the workflow, the
   job key (not the job's display name) and the script path.
3. Run `node scripts/claims/coverage.cjs`. If it says the job does not run the
   script, the job key or the path is wrong — fix it, do not loosen the check.

Moving an entry from `backlog` to `contracts` is the only way the backlog shrinks.
Retiring one is allowed when the statement stops being true or stops being public.
