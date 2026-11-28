# Degradation ledger

<!-- SPDX-License-Identifier: GPL-3.0-only -->

> 任何“还没做到”的状态，必须有明确的恢复路径和验证判据。没有恢复路径的降级，标记为 indefinite，
> 并在 issue 里说明为什么无法定义恢复条件。
>
> Any "not there yet" state must carry an explicit recovery path and a verification criterion.
> A degradation with no recovery path is marked **indefinite**, with an issue explaining why the
> recovery condition cannot be defined.

Purpose: the project has several capabilities that are partially present, deferred, or proven only
in a narrower scope than the wording suggests. Each one is a *degradation*, not a TODO. Recording
them in one place means a reader can tell "we chose not to do this yet and here is how we would know
when we did" from "we have no idea".

Rules:

1. A row is added when a capability is announced as available but is narrower than the announcement.
2. `Recovery condition` is an observable event, not a date.
3. `Verification criterion` must be checkable by someone who was not involved — a command, a run, a
   dashboard field.
4. `indefinite` rows are re-read at every release; the issue must say why no condition can be defined.

State as of 2026-11-26 (`main` @ `bb7c788`; production @ `bb7c788`; `v3.3.16` draft @ `ec4546f`).

| Capability | Current status | Why degraded | Recovery condition | Verification criterion |
|---|---|---|---|---|
| Multi-device `readBy` / `isRead` | **single-device qualifier** | The epoch fix (#728) is deployed as of `bb7c788`, but no acceptance run with two real devices and real account UUIDs has been performed. Production has 1 active device per account. | Two real devices on real accounts exercise A→B→A | Recipient's unread badge count equals the sender's `isRead`/`readBy` view; a device registered after a message does **not** hold that message's `isRead` back |
| `v3.3.16` desktop release | **STALE DRAFT** | The draft was built from `ec4546f`, before #117 (§9.2), #727 (docs) and #728 (readBy epoch). `main` is `bb7c788`. | Rebuild the draft from the current `main`, with the #118 pre-promote gate in place | Draft `target_commitish` equals `origin/main` at build time; artifact hashes match the rebuilt run |
| Third-party security audit | **not started** | No external partner engaged. Five academic contacts have been written to and are in a silent waiting period; a reply is not an engagement. | An audit engagement is signed | Audit report merged into `main` or linked from `SECURITY.md` |
| T2 period-level measurement | **unquantified** | Wall-clock noise on the measurement hosts dominates the signal; no method currently separates measurement from noise. | Native (or hardware) instrumentation lands **and** a noise floor is characterised | **indefinite** — no criterion can be written until the measurement itself is defined; tracked without a due date, see the note below |
| T1 rejection-loop leakage | **cost model only** | The rejection loop has a cost argument but no measured leakage bound. | A measurement harness produces a bound on the loop | Published bound, reproducible by the harness on CI hardware |
| `polyMul` / `matVecMul` constant time | **known gap** | Both take secret operands (fML-DSA signing/keygen, ML-KEM keygen/encaps/decaps). V8's multiplication is value-dependent, and no constant-time field multiplication has been written. | An implementation change (engine, wasm, or algorithm) makes the path constant-time | TVLA on those two primitives falls under the live gate's fail threshold, and `scripts/tvla-live-gate.cjs`'s allowlist shrinks accordingly |
| SM4 TVLA | **timing screen only** | Only a timing screen exists; no bit-sliced implementation, so a bit-level leakage claim is not supported. | Bit-sliced implementation built (P2) | TVLA over the bit-sliced path, with a failing negative control |
| Branch coverage | **67.85 %, not gated** | The coverage floor is 80 % on statements/lines only; branch coverage is measured and reported but cannot fail CI. | A branch floor is added to `.github/workflows/coverage.yml` | CI fails when branch coverage drops below the configured floor |
| Native-addon KAT | **disabled step** | `native-build.yml` runs NIST KAT with `if: false`; only the pure-JS path is compared against vectors. | An ACVP-based C-addon KAT exists that can be compared | The step runs and asserts a non-zero vector count (`known-soft-gates.md` A1) |

Indefinite rows: **1** (T2 period-level measurement). Reason: the recovery condition is "the
measurement exists", which is circular — until a method is defined there is nothing to verify against.
It is recorded here rather than assigned a fake date.

## What this ledger is not

- It is not a bug list: rows are capabilities whose *scope* is narrower than the wording, not defects
  with a reproducer.
- It is not a promise list: a row disappears only when its verification criterion is met, not when
  work starts.
- It does not replace `ASSURANCE_CASE.md` §8.1, which states the same boundaries in claim language;
  this file states them as states with exits.
