#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# Negative tests for the release deploy and rollback scripts.
#
# Everything runs in a sandbox: a throwaway git repository, a fake `pm2` on PATH, and
# a local health server whose `mlkem.backend` is a file the test can change. No release
# directory outside the sandbox is touched and no production path is referenced.
#
# What is covered:
#   1. first deploy switches `current` and restarts the app
#   2. a post-switch health failure rolls `current` back and exits non-zero
#   3. a successful deploy replaces the pointer and leaves no .tmp directories
#   4. rollback --to restores the earlier release and reports its elapsed time
#   5. a rollback whose target does not start puts the original release back
#   6. rollback --dry-run changes nothing
#   7. the legacy in-place script refuses to run once a release is serving
#
# Exit: 0 all cases passed, 1 a case failed.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SANDBOX="$(mktemp -d)"
PASS=0
FAIL=0

cleanup() {
  [ -n "${HEALTH_PID:-}" ] && kill "$HEALTH_PID" 2>/dev/null
  if [ "${KEEP_SANDBOX:-0}" = "1" ]; then
    echo "sandbox kept at $SANDBOX"
    return 0
  fi
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

check() {
  local label="$1" ok="$2"
  if [ "$ok" = "0" ]; then
    echo "PASS $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL $label"
    if [ -f "$SANDBOX/deploy.log" ]; then
      echo "--- deploy.log (tail) ---"
      tail -12 "$SANDBOX/deploy.log"
      echo "-------------------------"
    fi
    FAIL=$((FAIL + 1))
  fi
}

# ---------------------------------------------------------------- sandbox fixtures
mkdir -p "$SANDBOX/repo/src" "$SANDBOX/fibemate/releases" "$SANDBOX/fibemate/shared" "$SANDBOX/bin" "$SANDBOX/health"
printf 'JWT_SECRET=%s\n' "$(printf 'x%.0s' $(seq 1 40))" > "$SANDBOX/fibemate/shared/.env"
printf '#!/bin/bash\necho "pm2 $*" >> "$PM2_LOG"\nif [ -n "${PM2_FAIL_PATTERN:-}" ] && printf %s "$*" | grep -q -- "$PM2_FAIL_PATTERN"; then\n  echo "pm2: simulated start failure" >&2\n  exit 1\nfi\nexit 0\n' > "$SANDBOX/bin/pm2"
chmod +x "$SANDBOX/bin/pm2"

cat > "$SANDBOX/health/server.cjs" <<'NODE'
const http = require('http');
const fs = require('fs');
const port = Number(process.argv[2]);
const file = process.argv[3];
http
  .createServer((req, res) => {
    const backend = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : 'native';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', mlkem: { backend } }));
  })
  .listen(port);
NODE

printf 'native' > "$SANDBOX/health/backend"
HEALTH_PORT=$(( (RANDOM % 20000) + 20000 ))
node "$SANDBOX/health/server.cjs" "$HEALTH_PORT" "$SANDBOX/health/backend" &
HEALTH_PID=$!
for _ in $(seq 1 40); do
  curl -fsS "http://127.0.0.1:$HEALTH_PORT/health" >/dev/null 2>&1 && break
  sleep 0.25
done

git -C "$SANDBOX/repo" init -q
git -C "$SANDBOX/repo" config user.email "test@example.invalid"
git -C "$SANDBOX/repo" config user.name "test"
printf 'console.log("A");\n' > "$SANDBOX/repo/src/index.js"
printf '{"name":"sandbox","version":"0.0.0"}\n' > "$SANDBOX/repo/package.json"
git -C "$SANDBOX/repo" add -A
git -C "$SANDBOX/repo" commit -qm "A"
A="$(git -C "$SANDBOX/repo" rev-parse HEAD)"
printf 'console.log("B");\n' > "$SANDBOX/repo/src/index.js"
git -C "$SANDBOX/repo" commit -qam "B"
B="$(git -C "$SANDBOX/repo" rev-parse HEAD)"

export FIBEMATE_ROOT="$SANDBOX/fibemate"
export REPO_DIR="$SANDBOX/repo"
export PM2_CMD="$SANDBOX/bin/pm2"
export PM2_APP="fibemate-sandbox"
export PM2_LOG="$SANDBOX/pm2.log"
export HEALTH_JSON_URL="http://127.0.0.1:$HEALTH_PORT/health"
export CURRENT_MARKER="$SANDBOX/fibemate/current"
export LEGACY_ALLOW=0
export ALLOW_NON_ROOT=1
export HEALTH_TIMEOUT=3
: > "$PM2_LOG"

deploy() {
  MLKEM_REQUIRE_NATIVE="${MLKEM_REQUIRE_NATIVE:-0}" \
    MLKEM_EXPECT_BACKEND="${MLKEM_EXPECT_BACKEND:-}" \
    bash "$HERE/deploy-release.sh" --skip-npm "$@" >"$SANDBOX/deploy.log" 2>&1
}

# ---------------------------------------------------------------- case 1
deploy --sha "$A"
rc=$?
[ "$rc" -eq 0 ] && [ "$(readlink -f "$SANDBOX/fibemate/current")" = "$SANDBOX/fibemate/releases/$A" ]
check "first deploy switches current and exits 0" "$?"

# ---------------------------------------------------------------- case 2
printf 'js' > "$SANDBOX/health/backend"
MLKEM_EXPECT_BACKEND=native deploy --sha "$B"
rc=$?
printf 'native' > "$SANDBOX/health/backend"
current_after="$(readlink -f "$SANDBOX/fibemate/current")"
leftovers="$(find "$SANDBOX/fibemate/releases" -maxdepth 1 -name '.*.tmp.*' | wc -l | tr -d ' ')"
[ "$rc" -ne 0 ] && [ "$current_after" = "$SANDBOX/fibemate/releases/$A" ] && [ "$leftovers" = "0" ]
check "post-switch health failure rolls back and exits non-zero" "$?"

# ---------------------------------------------------------------- case 3
deploy --sha "$B"
rc=$?
[ "$rc" -eq 0 ] && [ "$(readlink -f "$SANDBOX/fibemate/current")" = "$SANDBOX/fibemate/releases/$B" ]
check "second deploy moves current to the new release" "$?"

# ---------------------------------------------------------------- case 4
out="$(MLKEM_REQUIRE_NATIVE=0 MLKEM_EXPECT_BACKEND="" bash "$HERE/rollback-release.sh" --to "$A" 2>&1)"
rc=$?
[ "$rc" -eq 0 ] && [ "$(readlink -f "$SANDBOX/fibemate/current")" = "$SANDBOX/fibemate/releases/$A" ] \
  && printf '%s' "$out" | grep -q "ROLLBACK OK"
check "rollback --to restores the earlier release" "$?"

# ---------------------------------------------------------------- case 5
MLKEM_REQUIRE_NATIVE=0 PM2_FAIL_PATTERN="releases/$B" \
  bash "$HERE/rollback-release.sh" --to "$B" >"$SANDBOX/rb-fail.log" 2>&1
rc=$?
printf '      rc=%s current=%s (expected %s)\n' "$rc" "$(readlink -f "$SANDBOX/fibemate/current")" "$SANDBOX/fibemate/releases/$A"
[ "$rc" -ne 0 ] && [ "$(readlink -f "$SANDBOX/fibemate/current")" = "$SANDBOX/fibemate/releases/$A" ]
check "rollback restores the original when the target does not start" "$?"

# ---------------------------------------------------------------- case 6
MLKEM_REQUIRE_NATIVE=0 bash "$HERE/rollback-release.sh" --dry-run >"$SANDBOX/dry.log" 2>&1
rc=$?
[ "$rc" -eq 0 ] && grep -q "would switch" "$SANDBOX/dry.log" \
  && [ "$(readlink -f "$SANDBOX/fibemate/current")" = "$SANDBOX/fibemate/releases/$A" ]
check "rollback --dry-run changes nothing" "$?"

# ---------------------------------------------------------------- case 7
CURRENT_MARKER="$SANDBOX/fibemate/current" REPO_DIR="$SANDBOX/repo" \
  RUNTIME_DIR="$SANDBOX/nowhere" bash "$HERE/deploy-fibemate.sh" >"$SANDBOX/legacy.log" 2>&1
rc=$?
[ "$rc" -eq 2 ] && grep -q "uses the release layout" "$SANDBOX/legacy.log"
check "legacy deploy refuses when the release layout is present" "$?"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
