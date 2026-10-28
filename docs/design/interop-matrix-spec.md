# Interoperability matrix — ML-KEM-768, three implementations

**Status:** design only. No code, no branch, no PR. Written 2026-10-28 during the
repository freeze; it is meant to be handed to whoever implements it, so that the first
day of that work produces evidence instead of questions.

**Scope:** `packages/pqc-kem` (pure JS), `@noble/post-quantum` (independent JS oracle),
and a WASM build (third end). ML-KEM-768 only. Nothing here is a security claim: this is
a conformance/interop measurement.

---

## 1. Why this document exists

Four separate results this month were **green for the wrong reason**. The matrix is
designed against exactly those failure shapes:

| incident | shape |
|---|---|
| `test/test-cross-lang.js:102,122` | `check('JS-encap → WASM-decap 匹配', true)` — the assertion is the literal `true`; a mismatch goes to `warn(...)` two lines below, so the test cannot fail |
| `test/test-cross-lang-seeded.js` §6 | two `WARN('expected binary mismatch')` lines, zero assertions; "compatibility" was validated by a comment |
| `test/run-compat-fixtures.mjs` | reads `f.sk` while the fixture carries `seed/pk/ct/K`; `Buffer.from(undefined)` throws *outside* the `try`, so the runner died instead of reporting, and the fixture was cited as evidence anyway |
| `src/crypto/ml-kem-768-td.js` (retired #367) | self-consistent round-trips everywhere; against an independent oracle, byte-identical key material: none. Fixed only when an oracle existed |

Common cause: **a pass that never depended on the property being true.** Every rule below
exists to make that structurally impossible.

---

## 2. Ends under test

> **Decision, 2026-10-28 (recorded the same day the spec was written): this matrix ships with
> two ends, P and N.** The WASM end is moved to backlog. Reason: at the time of writing there
> is no reproducible source for it in the repository (§2.1), and *a matrix that includes an
> unidentifiable binary is not evidence, it is a screenshot.* The 9-cell design is kept below
> because it is the shape to restore once a pinned-crate build exists; the first shipped run is
> the 4-cell P/N matrix (2 judged cells + 2 baselines).

| id | implementation | identity | provenance requirement |
|---|---|---|---|
| **P** | `packages/pqc-kem/src/ml-kem-768.js` | `fibemate-pqc-kem@0.1.0`, repo commit `HEAD` at run time | file sha256 recorded |
| **N** | `@noble/post-quantum` | **pin an exact version**; the tree currently resolves **0.7.1**, while the October audit used **0.4.1** in a scratch dir | version + `ml-kem.js` sha256 recorded |
| **W** | WASM (Rust `pqc_kyber`) | `src/crypto/pq-wasm-pkg/fibemate_pq_wasm_bg.wasm` + `fibemate_pq_wasm.js` glue | **blocking gap — see §2.1** |

Ends are addressed through a thin adapter each, exposing exactly four operations:
`keygenSeeded(seed64)`, `keygenRandom()`, `encap(pk, m32?)`, `decap(sk, ct)`. An adapter
that cannot do `keygenSeeded` reports `unsupported`, it does **not** silently generate a
random key and call it seeded.

### 2.1 The WASM end has no source in the tree (must be resolved before this matrix means anything)

Measured 2026-10-28:

- `git ls-files '*.wasm'` → only `www/crypto/lgv2/lgv2_3_bg.wasm` (an LWE artifact, unrelated);
- `src/crypto/pq-wasm-pkg/` **does not exist**; the only reference to it is `test/test-cross-lang.js`;
- `.gitignore:105` ignores `*.wasm`, so a WASM artifact is never committed anyway;
- no `Cargo.toml` and no Rust source for `pqc_kyber` anywhere in the repository;
- `docs/audit-log/wasm-verification-results_2026-08-12.md` records `wasm-pack 0.14.0`, Rust 1.95.0,
  `wasm-pack build --target nodejs --release`.

So today "WASM end" means *an artifact someone builds from a crate that is not in this
repository*. Three acceptable resolutions, in order of preference:

1. **Build in CI from a pinned crate**: record `pqc_kyber` crate name + exact version +
   crates.io checksum, `wasm-pack` version, and the sha256 of both outputs in the run
   manifest. The artifact stays uncommitted; the *recipe and digest* are the evidence.
2. **Commit the artifact with `git add -f`** (overrides the ignore) and treat it as an
   input blob with a recorded digest — only acceptable if the build recipe is also recorded,
   otherwise a reviewer cannot tell what produced it.
3. **Drop to two ends** (P ↔ N) and say so in the title. This is honest and still valuable,
   but it changes the claim: two implementations agreeing is weaker than three, and the
   retired `td` module is the proof that two ends can disagree for a year while both
   "pass" their own tests.

**Do not** run the matrix with a WASM adapter whose provenance is unknown: a matrix that
includes an unidentifiable binary is not evidence, it is a screenshot.

**Resolution taken:** option 3, scope reduced to P + N, WASM reopened only when a CI job can
build it from a pinned crate (name + exact version + crates.io checksum + `wasm-pack` version
recorded in the run manifest). Until then the third end does not appear in any table, not even
as a `SKIP` row — a permanently skipped row reads as "not yet measured", which after a few
months reads as "fine".

---

## 3. Seeds

Generated as `SHAKE256(label, n)` so every seed is **recomputable** from a string rather
than trusted from a table:

```python
seed_i = SHAKE256("fibemate-interop-matrix/2026-10/seed-i", 64)   # i = 1,2,3
m_i    = SHAKE256("fibemate-interop-matrix/2026-10/msg-i",  32)   # i = 1,2,3
```

| id | 64-byte seed (hex) |
|---|---|
| `S1` | `1aedfca8cad29c3a5da0b70576db3fe04422830abba03aee6790fbf3d1f80858fb0bcd96afa45d36d6e86d2ff4d246a73e186a80caf3274c79d0ebbc333d47d8` |
| `S2` | `9b45f5cdddf5e96709bf2206177329f8d19b81e9e3a28e50ddfee4b7fc1258e3d9df027791aa0b727d6b6e4c04b5675723e8941426cdf6c05ece88a5b29d283e` |
| `S3` | `65afd75f02707887e33a73eed9f21c8ddd88560ce56bf0f77c46e295b49d3a444f6de5a8ac9f45cb10f6ba0a56c5d88b228581ca48caa698570bb6cc45f44328` |

Mapping, FIPS 203 §7.1 / Algorithm 16:

- `d = seed[0:32]` — key-generation seed
- `z = seed[32:64]` — implicit-rejection seed
- `m_i = m_i` (above) — encapsulation randomness, **independent of the keygen seed**

Using `d` as `m` would couple keygen and encapsulation; a bug that reuses one buffer then
looks like a pass in the byte comparison. Hence the separate label.

Recomputability is checked in the harness: recompute `SHAKE256(label, 64)` and compare to
the table before running anything; a mismatch aborts the run (a stale table is a silent
lie).

---

## 4. The matrix

Three ends, so **9 cells** (design shape; the shipped first run is 4 cells — see §2 decision):

```
cell (A,B):  keygen by A  →  encap by B  →  decap by A      (primary)
                                        →  decap by B      (auxiliary column)
```

`A` is the key owner (it generates `(pk, sk)`), `B` is the sender (it encapsulates against
`A`'s `pk`).

| | B = P | B = N | B = W |
|---|---|---|---|
| **A = P** | baseline (P,P) | (P,N) | (P,W) |
| **A = N** | (N,P) | baseline (N,N) | (N,W) |
| **A = W** | (W,P) | (W,N) | baseline (W,W) |

**Baselines are not passes.** The three diagonal cells are *harness sanity checks*: if a
same-end round trip fails, the matrix is **INVALID** (report it as invalid, never as
"8/9 passing"). A self-consistent round trip is the thing every broken implementation this
month already had.

### 4.1 Two modes, because not every end can be derandomized

- **Mode D (derandomized)** — caller supplies `d`, `z`, `m`. Enables the strong claim:
  `pk`, `sk` and `ct` must be **byte-identical across ends**.
  - P: `generateKeypairDerand(d,z)`, `encapsulateDerand(pk,m)`
  - N: `ml_kem768.keygen(seed64)` — noble's `keygen(seed)` takes `d‖z`; encapsulation
    determinism must be checked against the version actually pinned (§2), and recorded
    either way.
  - W: depends on the crate; `pqc_kyber` exposes randomized encapsulation only, so W is
    **Mode R in practice** unless the RNG is injectable.
- **Mode R (randomized)** — the implementation draws its own randomness. Only interop can
  be claimed (`A.decap(B.ct) == B.ss`), **never** byte equality. Every Mode R row must be
  labelled, because a reader who sees `ss: MATCH` will otherwise assume the bytes matched.

A cell that mixes modes is recorded as `mode: D/R` and judged only on the properties the
weaker mode supports. This is the one place where an asymmetry is allowed — and it must be
printed, not implied.

### 4.2 Controls (non-negotiable)

Each cell runs three controls alongside the main measurement:

1. **Negative control (implicit rejection).** Flip one byte of `ct` and decapsulate. FIPS 203
   §7.3 requires a *deterministic pseudo-random* shared secret, not an exception and not the
   original secret. Record the resulting `ss` digest; it must be stable across ends for the
   same `(sk, ct')`. An implementation that throws here is `FAIL`.
2. **Wrong-key control.** `A.decap` with a key from a different seed must not return the
   sender's `ss`. (Catches "returns the last shared secret" and stub decapsulation.)
3. **Uniqueness control.** The three seeds must produce three different `pk` digests, and
   the six cross-cells must not all collapse to one `ss`. Identical outputs everywhere mean
   the harness is comparing a constant to itself.

---

## 5. What counts as a pass

| claim | required evidence | fails if |
|---|---|---|
| P ≡ N key material | `pk` and `sk` hex **identical** for S1, S2, S3 | any byte differs, in any seed |
| P ≡ N ciphertext | `ct` and `ss` identical in Mode D with the same `m` | differs, or mode silently downgraded |
| W ↔ P interop | `P.decap(W.ct) == W.ss` **and** `W.decap(P.ct) == P.ss` | one direction only |
| W conformance | if W is FIPS 203 with a fixed layout, `pk` and `sk` are byte-identical to P | a differing `pk` is a **FAIL** with a defect id, not a note |
| baselines | 3/3 diagonal cells pass | matrix is **INVALID**, not "mostly passing" |

Absolute rules:

- **No "expected failure".** A known-broken direction is written as `FAIL` plus a defect
  reference and the verbatim error. `WARN("expected mismatch")` is what hid the seeded
  defect for a month; it is banned from the harness output, and `warn()` must not exist in
  the runner's vocabulary at all.
- **A thrown exception is a FAIL, not a skip.** Unsupported operations are declared in
  advance by the adapter (`unsupported`), so an exception at run time is a defect.
- **Every failure carries the raw text**: error class, message, stack frame, exit code. No
  paraphrase, no "internal format mismatch" as a summary — that phrase is exactly what was
  printed while the truth was "these two produce different key material".
- **Numbers are recomputed, never typed.** Digests are printed by the runner and pasted by
  the runner into the report; a human retyping a digest is how a report and its evidence
  diverge.

---

## 6. Output format

### 6.1 Directory

```
docs/tsa/2026-11-interop-matrix/          # date of the run, not of this spec
  RUN-MANIFEST.json
  matrix.md
  matrix.json
  logs/<cell>-<seed>.log                  # verbatim stdout+stderr per cell
  lg-1xx-matrix.md.tsq/.tsr
  lg-1xx-matrix.json.tsq/.tsr
  SHA256SUMS
  README.md
```

### 6.2 `matrix.json` — one object per cell × seed

```json
{
  "run": {
    "started_at": "2026-11-xxT..Z",
    "node": "v22.22.3", "os": "Windows_NT 10.0.26300 (x64)",
    "repos": { "fibemate": "<40-hex>", "fibemate-tools": "<40-hex>" },
    "ends": {
      "P": { "path": "packages/pqc-kem/src/ml-kem-768.js", "version": "0.1.0", "sha256": "…" },
      "N": { "package": "@noble/post-quantum", "version": "0.7.1", "file": "ml-kem.js", "sha256": "…" },
      "W": { "crate": "pqc_kyber", "crate_version": "…", "wasm_pack": "0.14.0", "wasm_sha256": "…", "glue_sha256": "…" }
    },
    "seeds": { "method": "SHAKE256(label, n)", "labels": ["…"], "verified_against_table": true }
  },
  "rows": [
    {
      "cell": "P→N", "keygen": "P", "encap": "N", "decap_primary": "P", "decap_aux": "N",
      "seed_id": "S1", "mode": "D",
      "pk_sha256": "…", "sk_sha256": "…", "ct_sha256": "…", "ss_sha256": "…",
      "result": "PASS",
      "checks": {
        "ss_matches_sender": true,
        "ss_matches_aux": true,
        "pk_equals_P_reference": true,
        "negative_control_stable": true,
        "wrong_key_differs": true
      },
      "error": null
    }
  ],
  "summary": { "cells": 9, "baselines": 3, "judged": 6, "pass": 5, "fail": 1, "invalid": false }
}
```

`error` is `null` on pass, and otherwise `{ "stage": "decap", "class": "Error", "message": "<verbatim>", "log": "logs/<cell>-S1.log" }`.

### 6.3 `matrix.md` — the table a human reads

```
| cell | mode | seed | pk | ct | ss | result | note |
|---|---|---|---|---|---|---|---|
| P→P (baseline) | D | S1 | — | — | MATCH | PASS | harness check |
| P→N | D | S1 | =P | =P | MATCH | PASS | |
| N→W | R | S1 | ≠P | — | MISMATCH | FAIL | decap rejected ct: "…" |
```

`pk` column uses `=P` / `≠P` (byte equality against the P reference for that seed), not a
digest — a table of digests invites the reader to trust instead of check; the digests live
in the JSON.

---

## 7. Evidence chain

Same discipline as the October package, which is the reason it can be re-verified:

- **Numbering:** next free `lg-` after `lg-115` (`lg-109`–`lg-115` are taken; do **not**
  reuse the gaps — a re-used number is indistinguishable from a re-issued token).
- **Order:** write files → compute digests → stamp → then commit. Never stamp a draft.
- **Bytes:** `.gitattributes` already carries `docs/tsa/** -text`; verify with
  `git cat-file -p :<path>` against the working file, not `git status`.
- **Ignore trap:** `*.tsq`/`*.tsr` are in `.gitignore` → `git add -f`, then confirm with
  `git show --stat HEAD` that the binaries are actually in the commit.
- **Superseded tokens are deleted**, and the manifest says why (the `lg-112` rule).
- **Sigstore:** if a runner artifact is published (not just committed), sign it
  (`cosign sign-blob`) and record the bundle digest; a signature over a digest the report
  does not print is decoration.

---

## 8. Out of scope

Performance, side-channel behaviour, ML-KEM-512/1024, network transports, and any claim
about deployed users. This matrix answers one question: *do these three produce and
consume the same ML-KEM-768 key material?*

---

## 9. Definition of done (for the implementing day)

1. Three adapters behind one interface; each declares `supported` / `unsupported` per operation up front.
2. Seed table verified by recomputation before the first run; abort on mismatch.
3. W provenance recorded (crate + version + recipe + digests) **or** the scope reduced to two ends and the title changed.
4. 9 cells × 3 seeds = 27 rows in `matrix.json`; baselines flagged, never counted as passes.
5. Three controls run per cell; the negative-control `ss` digest is stable across ends.
6. `warn(` does not appear in the runner source (`git grep -n "warn(" -- <runner>` → 0 hits).
7. Every failing row carries a verbatim error and a log path.
8. `matrix.md` numbers are emitted by the runner, not retyped.
9. Tokens stamped after the files are final; digests re-verified from the committed blob.
10. One PR; CI green; the report states the count of judged vs baseline cells explicitly.

---

## 10. What would make this matrix lie

| trap | symptom | guard |
|---|---|---|
| comparing a value to itself | every cell "MATCH", all `ss` digests equal | uniqueness control (§4.2.3) |
| caching `ct` between cells | second cell passes without running | per-cell fresh process, log timestamps |
| oracle drift | noble upgraded between audit and run | pin exact version, record file sha256 |
| mode confusion | `ss MATCH` read as `bytes identical` | `mode` column required on every row |
| unidentifiable WASM | "WASM says OK" with no recipe | provenance gate (§2.1) |
| skip-on-exception | red test becomes "not applicable" | declared `unsupported` only; runtime exception = FAIL |
| retyped digests | report and evidence diverge silently | runner emits the report |
| baseline counted as pass | "9/9 green" with two broken ends | baselines excluded from the judged count |

---

## Appendix A — the gate for `fml-dsa/src/core` (to be written into that README when the freeze lifts)

The same bar, stated once so it cannot drift: a module in `packages/fml-dsa/src/core/` may
only be wired into the production path after

1. **fixed-seed byte equality** — with `seed = SHAKE256("fibemate-interop-matrix/2026-10/seed-i", 64)`
   (or the FML-DSA equivalent), the module's `pk` and `sk` are byte-identical to an
   independent implementation for at least 3 seeds;
2. **bidirectional signature interop** — signatures produced by the module verify under the
   independent implementation, and vice versa, for the same key;
3. **a rejection control** — a signature with one flipped byte must verify `false`, not throw;
4. **retirement口径** — if any of the above fails and cannot be fixed in one change, the
   module is retired (deleted) rather than kept with a "known mismatch" note, and the
   evidence for the retirement is timestamped, exactly as `ml-kem-768-td` was.

Rationale: a module that is not on the production path costs nothing while it sits there,
but the moment it is cited as a second implementation it must actually be one. Two
implementations that only check themselves agree by construction.

## 11. 2026-10-28 实测更新：WASM 端降为 backlog（决策已改，以本节为准）

上文的"W 端（WASM）"设计保留为历史，但**第一版矩阵不含 W**。原因不是"源码找不到"，而是**找到了、重建了、测出它不是 ML-KEM-768**。

### 11.1 实测结论

本地 Rust 源码（`fibemate-pq-wasm` 0.1.0，`pqc_kyber 0.7.1`）用 `wasm-pack 0.14.0` / `rustc 1.97.1` / `wasm32-unknown-unknown` 重建成功：96,571 B，`sha256 e3ff651f…`。用它与 `packages/pqc-kem`（与 noble 逐字节一致）对拍：

```
ss_ML-KEM (FIPS 203)               c6af5a48f469d7db…
ss_WASM   (pqc_kyber 0.7.1)        0a7ff10f82ae44f2…
SHAKE256(ss_ML-KEM ‖ SHA3-256(ct)) 0a7ff10f82ae44f2…   ← 相等
```

两个方向都成立。**`pqc_kyber` 0.7.1 是 Kyber 轮次三：`ss = SHAKE256(K̄ ‖ H(ct))`；FIPS 203 把最后一层 KDF 去掉，`ss = K̄`。** 密钥与密文尺寸相同、密文格式兼容，所以不会报警，只会静默给出不同密钥。

### 11.2 决策

1. 第一版矩阵 = **P（packages/pqc-kem）+ N（@noble/post-quantum）两端**，标题写明"JS 双端 ML-KEM 互操作矩阵"。
2. **不加 KDF 适配层**。矩阵标题若写 ML-KEM，测的就必须是 ML-KEM；"Kyber-768 加一层能还原 ss 的变换"属于用适配掩盖算法不同名，是假绿的另一种写法。
3. W 端恢复条件不变（CI 能从 pinned crate 构建并记录 digest），但**换 crate 是前置条件**：`libcrux-ml-kem` 或 `ml-kem`，不是继续用 `pqc_kyber`。
4. 命名债务单独追踪（issue #377）：仓库内所有"ML-KEM-768 WASM"说法要么改为"Kyber-768"，要么随 crate 切换重编。
5. "WASM 不可用"时**不允许打印 SKIP 行**：永久 SKIP 在几个月后会被读成"没问题"。

### 11.3 对 §7 输出格式的修订

`matrix.json` 中的 `ends` 字段第一版只含 `P` 与 `N`；`W` 不出现在结果里（不是 `status: "unsupported"`，是**没有这一列**）。理由同上：一行 `unsupported` 会被后来的人当成"待办"，而这一版的正确说法是"这一版不宣称任何 WASM 结论"。
