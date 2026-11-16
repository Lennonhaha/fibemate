# #507 — Moving production to an immutable, built release

**Status:** draft for review. Nothing here has been executed. No production change is proposed by this
document; it proposes an order of operations and the evidence that would let each step be reversed.

**Context:** #507 (packages/ drift), #520 (native backend silently dead for ~75 days),
`docs/audit-log/2026-11-16-deployment-drift-postmortem.md`.

---

## 1. The measured situation (2026-11-16, repo `331e1a1`)

| measurement | value |
|---|---|
| tracked files under `packages/` on the runtime host | 133 |
| byte-identical to the checkout | 67 |
| different | 51 |
| missing | 15 |
| runtime-only files (not in any commit) | 11 |
| `package-lock.json` sha256 (repo vs runtime) | `84ec2be8…` vs `0b270bfc…` |
| `@noble/hashes` at runtime root | 2.4.0 |
| `@noble/hashes` inside `packages/pqc-kem/node_modules` | 2.2.0 |
| `@noble/post-quantum` inside `packages/pqc-kem/node_modules` | 0.6.1 |
| `chattr +i` entries on the checkout | 4,535 |
| pm2 apps | `fibemate` (cwd `/opt/fibemate-full`), `reg-server` (cwd `/opt/fibemate-full/reg-server`) |
| pm2 uid | 0 (root) |

Per package:

| package | same | differ | missing |
|---|---|---|---|
| `pqc-kem` | 12 | 35 | 4 |
| `fml-dsa` | 24 | 14 | 11 |
| `algorithm-registry` | 4 | 1 | 0 |
| `key-lifecycle` | 4 | 1 | 0 |
| `sm2-ref`, `sm2-multisig`, `sm3-ref`, `sm4-ref` | 5–8 each | 0 | 0 |

Two versions of the same dependency family are loaded in one process, and which one wins depends on
Node's resolution order from the requiring file. The 11 runtime-only files include a `.bak` of the KEM
implementation and an `ntt_*` experimental series; they are loaded by nothing, but they are also not
evidence of anything.

**The important line is not the drift count. It is that `packages/` is not in `SYNC_TREES`.** The deploy
syncs and hash-verifies `src/` (18 files) and *reports* `packages/` as drift. Everything in `packages/`
reached production by hand, at some point, and nothing has verified it since.

## 2. Why patching the deploy script further is the wrong move

The current script already grew three corrective steps in two days:

- `[3c]` sync `src/` and assert sha256 per file — because "deploy OK" and "API runs the new code" were
  allowed to be different statements (#500)
- `[3d]` assert the native addon against a build manifest — because a binary that no checkout produces
  was never verified (#520)
- `[3e]` report `packages/` drift — because `rsync --delete` there deletes the runtime-only
  `node_modules` the API actually loads

Each is a good check. Each also exists because the deploy **mutates a long-lived tree in place**. A tree
that is modified in place will always accumulate state that is not in git, and every such state needs its
own ad-hoc detector. The detectors are the symptom.

## 3. Goals and non-goals

**Goals**

1. The bytes that run are byte-identical to a commit, verifiable by sha256, without a human copying
   anything.
2. `packages/` is covered by the same guarantee as `src/` and `www/`.
3. The native addon is produced by the build, not by a person with `scp`.
4. Rolling back is one atomic operation that does not depend on git.
5. Drift becomes impossible rather than reported.

**Non-goals (this round)**

- Changing the runtime dependency graph (the dual `@noble` generation is #507-adjacent but a separate
  decision; a clean `npm ci` at one root is where it gets resolved, but not in this doc).
- Containerising. It is option C below and it is a bigger change than the drift problem requires.
- Fixing pm2 running as root. That is #529-adjacent and needs its own decision, because it changes file
  ownership on `data/`, `.env` and the addon.

## 4. Options

### A. Release directories + symlink swap (recommended)

Each deploy materialises a **new** directory from a commit, verifies it, then flips a symlink.

```
/opt/fibemate/
  releases/
    331e1a1/            <- src/ www/ packages/ node_modules/ build manifest
    ad24d39/
  current -> releases/ad24d39
  shared/
    .env                <- mode 600, not in any commit
    data/               <- sqlite etc.
  logs/
```

Build, per release, on the host:

```
git -C /opt/fibemate-mirror archive <sha> | tar -x -C releases/<sha>
cd releases/<sha>
npm ci --omit=dev            # cache poisoning is a known failure mode, see #526
npm run build:native         # node-gyp rebuild -> packages/pqc-kem/native/build/Release/mlkem.node
sha256sum ... > BUILD-MANIFEST   # every tracked file + the addon
```

Cutover:

```
ln -sfn releases/<sha> current.tmp && mv -T current.tmp current   # atomic
pm2 restart fibemate --update-env                                 # cwd = /opt/fibemate/current
```

- **Rollback:** `ln -sfn releases/<previous> current` + restart. No git operation, no lock set, no
  rebuild.
- **nginx:** point `root` at `/opt/fibemate/current/www` so the site and the API come from the **same**
  tree. Today nginx serves `/opt/fibemate-repo/www` while pm2 runs `/opt/fibemate-full`, which is the
  structural reason a deploy can update one and not the other.
- **`chattr +i`:** no longer needed for the serving tree — a release directory is written once. Keep it
  only if it is protecting `shared/`, and even then prefer ownership over immutability.
- **Cost:** a second copy of the tree (repo ~? MB) + `node_modules` (~320 packages) per release, minus
  deduplication. Retain 3–5.

### B. Keep the mutable tree, add `packages/` to `SYNC_TREES` and a real `npm ci`

Cheapest next step: set `PACKAGES_SYNC=1` by default, add `packages/` to the sha256 gate, run
`npm ci --omit=dev` when the lock changed, rebuild the addon when native sources changed.

- **Pro:** one afternoon; no layout change; keeps today's mental model.
- **Con:** does not remove the class of failure, it removes one instance. `node_modules` still has files
  that are not in git, so `npm ci` will keep being skipped "because it takes time and the tree works",
  which is exactly how we got here. Also `npm ci` deletes `node_modules`, which is the one thing that
  cannot be done in place without a working fallback if it fails halfway.

### C. Container image per commit

Correct long-term, most work: build image in CI, tag by sha, deploy by `docker compose up -d`.

- **Pro:** strongest guarantee; environment is pinned; rollback is a tag.
- **Con:** requires registry, image build minutes, a migration of `data/` and `.env` into volumes,
  and a decision on the root-owned pm2 processes. Too large to be the response to drift, and it
  subsumes option A's layout anyway — do A first, C becomes mechanical.

**Recommendation: A now, B as the intermediate step if A slips.** B is strictly less safe than A and
adds a temporary manual step (`PACKAGES_SYNC=1`), but it is a real improvement over today and it can run
in parallel with writing A.

## 5. Phases

| phase | action | exit criterion | reversible by |
|---|---|---|---|
| P0 (done) | measure drift, add `[3d]`/`[3e]`/`[3f]` reports | reports exist and are read on every deploy | — |
| P1 | CI builds the addon and publishes `mlkem.node` + `mlkem.node.sha256` | artifact sha matches manifest; `usingNative === true` in the build job (PR #525, draft) | n/a (CI only) |
| P2 | build one release directory on the host, **without** switching to it | `BUILD-MANIFEST` verifies; `node -e require(...)` loads from the release dir; `/health` from a temporary port reports `native` | delete the directory |
| P3 | cut over: symlink + pm2 restart + nginx root | `/health` `mlkem.backend=native`, `x-app-version` = new sha, `check-live` 4/4, 30 min of 5xx = 0 | symlink back + restart |
| P4 | remove the mutable tree from the deploy path; retire `chattr` on the serving tree | a deploy that never touches `/opt/fibemate-full/src` | keep the old tree for 7 days |

P2 is the important one: it proves the build **before** anything serving traffic depends on it. The
current script has no such step, which is why "the deploy succeeded" and "the addon exists" could both be
true and unrelated.

## 6. Failure modes this design must survive

| failure | today | under A |
|---|---|---|
| stale npm cache serves an old version (#526) | `npm ci` failed with ETARGET and the tree was left as-is | build fails, symlink never flips, previous release keeps serving |
| native toolchain missing on host | addon silently absent, JS fallback runs for 75 days | P2 fails loudly; nothing switches |
| registry unreachable mid-build | unknown | same |
| half-written `node_modules` | in-place, hard to detect | contained in a directory that is not `current` |
| operator edits a file in `current` | possible, undetected | possible, but overwritten by the next release; `BUILD-MANIFEST` makes it detectable by re-hashing |
| disk fills with releases | n/a | retention of 3–5, oldest pruned after a successful cutover |
| `.env` and `data/` move | n/a | `shared/` + `FIBEMATE_ENV_FILE` (already supported as of #528) |
| pm2 resolves the symlink at start | n/a | restart re-resolves; `pm2 jlist` cwd must be checked post-restart as part of P3 |

## 7. Open questions

1. **Build on the host or consume the CI artifact?** CI already produces a verified addon (P1). Building
   the whole tree on the host still needs `npm ci` there, so the artifact only removes the native step.
   Proposal: P2 builds on the host and *also* compares the addon sha against the CI artifact; if they
   differ, the host toolchain is the suspect.
2. **Where does the git checkout live?** A bare mirror (`/opt/fibemate-mirror`) used for `archive` is
   cleanest — it has no working tree to accumulate state, and no need for `chattr`.
3. **pm2 as root.** Moving to a service user changes ownership of `shared/data`, `shared/.env`, and the
   addon's ability to be `dlopen`ed. Sequence it after A, not with it.
4. **Retention policy** — 3 or 5 releases, and is a release directory allowed to be pruned automatically?
5. **The 11 runtime-only files**: delete with the cutover, or investigate first? `fml-dsa/src/core/native.js`
   is referenced by nothing in `HEAD` but may have been referenced by an older commit.

## 8. Acceptance criteria (for closing #507)

- [ ] a deploy of commit X produces a serving tree whose every tracked file hashes to X, including
      `packages/`, verified by a script that has been shown to fail on a single flipped byte
- [ ] the native addon in that tree was produced by the build, and its sha256 matches the manifest the
      build wrote
- [ ] `ln -sfn` + restart returns the previous release to service in under 60 s, demonstrated once
- [ ] no file under `current/` differs from its commit after one week of operation
- [ ] `chattr` is no longer part of the deploy path, or is reduced to `shared/`

## 9. Estimate

P1 is already drafted. P2 ~half a day (build script + manifest + a dry run against a temp port). P3 ~1
hour with a rollback rehearsal. P4 is cleanup plus a week of observation. The expensive part is not
writing it, it is the first cutover where the old and new trees disagree — which is the point.
