# ML-KEM-768 cross-implementation interoperability

**One command, one report, the same SHA-256 on every machine.**

This is the entry point for reproducing FIBEMATE's ML-KEM-768 cross-implementation checks and
verifying the result yourself, instead of trusting a claim.

> **Status (2026-10-16).** The `noble` legs and the vector-file legs run in CI on every pull request
> via the `interop` job (`.github/workflows/interop.yml`, 1,000 rounds) — its job id `interop` is the
> status-check context. `nightly-phase2.yml` → `liboqs-cross` builds liboqs `0.12.0` from source
> (commit-pinned) and runs 10,000 rounds; it is still **advisory** and never blocks a change. The
> Docker image (`docker/interop/Dockerfile`) exists, but its **build is still not wired into CI**;
> treat the Docker commands below as untested until that lands.

## What it checks

| leg id | what it does | what it catches |
|---|---|---|
| `keygen-deterministic` | fixed `(d,z)` ⇒ our `ek` must be byte-identical to the reference `ek` | draft-era KeyGen drift (e.g. `k` not fed into `G(d‖k)`) |
| `decaps-ours-encaps-noble` | our keygen → `@noble/post-quantum` encaps → our decaps | wire-format drift in `ek`/`ct`/`K` |
| `decaps-noble-encaps-ours` | noble keygen → our encaps → noble decaps | same, other direction |
| `liboqs-encaps-ours-decaps` | as row 2, partner = liboqs through `scripts/oqs_gen` | C-implementation interop |
| `liboqs-keygen-ours-encaps-liboqs-decaps` | as row 3, partner = liboqs | same, other direction |
| `kat-fields` | vector file: field presence, length, hex validity | truncated or corrupt vector file |
| `kat-vector-k` | `k == SHA3-512(m ‖ SHA3-256(ek))[0:32]`, without running KEM code | wrong vectors, via an independent formula |
| `kat-dk-canonical` | `dk` follows the FIPS 203 §7.1 layout | non-canonical secret keys |
| `kat-decaps` | our `decapsulate(dk, ct) == k` | end-to-end vector check |

Shared secrets are compared as **raw final `K` only** (FIPS 203 §7.3). The draft-era
`SHA3-256(K̄ ‖ H(ct))` variant is deliberately *not* compared: it was removed in the final standard
(measured 2026-10-16 against `@noble/post-quantum@0.7.1`: raw 200/200, hashed 0/200).

## What it does not check

- No side-channel / TVLA claim — see the TVLA reports and `docs/testing.md`.
- No ML-DSA (`fml-dsa`) coverage — separate implementation, separate line.
- No other parameter sets (ML-KEM-512 / ML-KEM-1024).
- `liboqs` legs are advisory, need a local liboqs build, and are *skipped* (not failed) when absent.

## Quick start (Docker)

Requires Docker. The base image is pinned by digest and is `linux/amd64`; on other architectures
add `--platform=linux/amd64` to build and run.

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
docker build -f docker/interop/Dockerfile -t fibemate/pqc-interop:local .

docker run --rm \
  -e FIBEMATE_REPO_COMMIT="$(git rev-parse HEAD)" \
  -e FIBEMATE_IMAGE_DIGEST="$(docker image inspect --format '{{.Id}}' fibemate/pqc-interop:local)" \
  -v "$PWD/interop-out:/report" \
  fibemate/pqc-interop:local run --rounds 1000 --out /report

cat interop-out/report.sha256     # <sha256>  report.json
```

Expected: `verdict=PASS`, exit code `0`, report at `interop-out/report.json`. The same inputs give
the same `report.json` SHA-256 — compare that digest with a second machine.

Compose variant (the `interop` profile in `docker/docker-compose.yml`):

```bash
docker compose --profile interop run --rm interop
```

## Quick start (no Docker)

Node >= 22 plus the lockfile dependencies (`npm ci`) are enough for the `noble` legs:

```bash
node scripts/interop/run.mjs run --rounds 1000 --partners noble --kat none --out out
# include the vector-file legs (they run offline, no KEM partner needed):
node scripts/interop/run.mjs run --rounds 100 --partners noble --kat all --out out
```

liboqs legs: install liboqs 0.12.0, build the helper, then ask for the partner:

```bash
gcc -O2 -o scripts/oqs_gen scripts/oqs_gen.c -l oqs -lcrypto
node scripts/interop/run.mjs run --rounds 1000 --partners noble,liboqs --out out
# non-default locations: OQS_GEN=/path/to/oqs_gen OQS_LIB_DIR=/path/to/lib
```

## CLI

```text
Usage: node scripts/interop/run.mjs run [options]

Options:
  --rounds <n>          rounds for the randomised legs (default 1000)
  --liboqs-rounds auto|<n>
                        rounds for the liboqs legs; "auto" = min(--rounds, 100)
                        because each liboqs operation is a process spawn (default auto)
  --partners <list>     noble,liboqs (default: both)
  --seed <hex>          32-byte master seed for deterministic legs
                        (default 0000000000000000...)
  --kat all|consistency|none
                        vector-file legs: all (fields + k formula + dk layout + decaps),
                        consistency (fields + k formula, no KEM code), none (default all)
  --kat-max <n>         cap the number of vector blocks (default all)
  --out <dir>           write report.json / meta.json / report.sha256 (default out)
  --print-report        also print report.json to stdout
  --quiet               suppress per-leg progress lines
  -h, --help            show this help
```

## Report format

`report.json` is canonical — no timestamps, no host, no durations — so its SHA-256 is stable
across runs and machines. Schema `fibemate.interop-report/1`:

```json
{
  "schema": "fibemate.interop-report/1",
  "verdict": "PASS",
  "command": { "rounds": 1000, "liboqs_rounds": "auto", "partners": ["liboqs", "noble"], "kat": "all", "kat_max": 0 },
  "pins": {
    "node": "v22.x", "platform": "linux/x64", "ours_sha256": "…", "noble": "0.7.1",
    "liboqs": null, "oqs_gen_c_sha256": "…", "liboqs_commit": "f4b96220…",
    "repo_commit": "…", "repo_dirty": false, "master_seed": "…"
  },
  "legs": [ { "id": "kat-decaps", "partner": "noble", "status": "pass", "pass": 100, "fail": 0 } ]
}
```

- `meta.json` — everything volatile: `generated_at`, `duration_ms`, `host`, `cwd`, `node`,
  `image_digest`, `report_sha256`.
- `report.sha256` — `<sha256>  report.json`.
- Exit codes: `0` PASS · `1` FAIL · `2` PARTIAL.
- Leg statuses: `pass` / `fail` / `error` / `skipped` (requested but unavailable) / `disabled`
  (not requested). Only `fail` and `error` make the verdict FAIL; a `skipped` leg yields PARTIAL;
  `disabled` legs are neutral. Nothing is silently skipped: a disabled leg is reported as such.

### Pinning a report to a commit

Inside the image there is no `.git`, so `repo_commit` and `repo_dirty` come out `null` unless you
pass `-e FIBEMATE_REPO_COMMIT=$(git rev-parse HEAD)` (and optionally
`-e FIBEMATE_IMAGE_DIGEST=…`). Known gap: the Dockerfile does not bake the commit yet, so that
environment variable is the current way to bind a report to a commit.

## Where the vectors come from

- In-repo: `packages/pqc-kem/test/kat/mlkem-768-KAT.rsp` is produced by
  `packages/pqc-kem/scripts/generate-nist-kat.js` with an injected RNG, and every block is checked
  four ways *before* the file is written — our own `decapsulate`, a noble cross-check, the
  independent `k = SHA3-512(m ‖ SHA3-256(ek))[0:32]` formula, and the canonical `dk` layout.
  Any check failing exits non-zero and writes nothing.
- The gate `scripts/ci-mlkem-kat.cjs` re-checks the committed file vector by vector (500
  assertions) on every change.
- **In this repository:** the official NIST ACVP vectors. `packages/pqc-kem/test/vectors/` holds the
  ML-KEM keyGen (75) and encapDecap (165) case files, rebuilt from two pinned blob SHAs in
  `usnistgov/ACVP-Server` by `packages/pqc-kem/test/acvp-vectors.mjs`; each file records its upstream
  path, blob sha, byte length, sha256 and retrieval date. The two test files run offline against those
  vectors and are wired into `ci.yml` (`mlkem-kat`) and `kat-regression.yml`, 240 cases in total.
- **Still not in this repository:** the NIST `PQC Intermediate Values` files. Older revisions of
  `docs/fips203-mlkem768.md` claimed those tests had been run; the files live outside the repository
  and cannot be reproduced here. ACVP coverage is not a substitute: intermediate values would pin the
  internal steps, while ACVP only pins the outputs.

## CI wiring

| where | what runs | gate |
|---|---|---|
| pull requests | `interop` → `scripts/interop/run.mjs run --rounds 1000 --partners noble --kat all` (report uploaded as the `interop-report` artifact) | required (job id `interop`) |
| pull requests | `mlkem-kat` (roundtrip gate + 240 ACVP cases), `node-test`, `gm-crossval`, `build-native`, CodeQL, … | required |
| `nightly-phase2.yml` → `liboqs-cross` | liboqs `0.12.0` (commit-pinned) + `oqs_gen`, then `--rounds 10000 --liboqs-rounds 10000 --partners noble,liboqs` (artifact `interop-report-nightly`) | advisory (`continue-on-error: true`) |
| not wired yet | `docker/interop/Dockerfile` build (base image pinned by digest) | none |

## Troubleshooting

- `liboqs=unavailable (oqs_gen not found …)` — build the helper as shown above; every other leg
  still runs. Use `--partners noble` to pin the dependency-free path.
- `implementation is not reading globalThis.crypto.getRandomValues` — the deterministic leg installs
  an RNG shim and **fails if the shim is never consumed**, so a broken injection cannot look green.
- `verdict=PARTIAL`, exit `2` — a partner you asked for was unavailable.
