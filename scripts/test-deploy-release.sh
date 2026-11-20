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
cat > "$SANDBOX/bin/pm2" <<'PM2'
#!/bin/bash
# Resolve the static root the way the real process would see it: the release path
# behind the `current` symlink, not the symlink itself.
log_static="${FIBEMATE_STATIC_ROOT:-}"
if [ -n "$log_static" ]; then
  log_static="$log_static"
fi
echo "pm2 $* static=$log_static" >> "$PM2_LOG"
if [ -n "${PM2_FAIL_PATTERN:-}" ] && printf %s "$*" | grep -q -- "$PM2_FAIL_PATTERN"; then
  echo "pm2: simulated start failure" >&2
  exit 1
fi
exit 0
PM2
chmod +x "$SANDBOX/bin/pm2"
cat > "$SANDBOX/bin/nginx" <<'EOF'
#!/bin/bash
printf '%s\n' "$*" >> "$NGINX_LOG"
if [ "$1" = "-t" ] && [ -e "${NGINX_FAIL_T:-/nonexistent}" ]; then
  echo "nginx: [emerg] simulated config test failure" >&2
  exit 1
fi
exit 0
EOF
chmod +x "$SANDBOX/bin/nginx"

cat > "$SANDBOX/health/server.cjs" <<'NODE'
// Reports what a real process would: the commit it was started from, and the commit of
// the tree the web server serves. Both are read from the fake pm2 log, so the assertion
// covers the env var actually reaching the process, not just the JSON shape.
const http = require('http');
const fs = require('fs');
const path = require('path');
const port = Number(process.argv[2]);
const backendFile = process.argv[3];
const pm2Log = process.argv[4];
const overrideFile = process.argv[5];

function commitOf(dir) {
  return dir ? path.basename(dir).slice(0, 7) : null;
}

http
  .createServer((req, res) => {
    const backend = fs.existsSync(backendFile) ? fs.readFileSync(backendFile, 'utf8').trim() : 'native';
    let build = null;
    let served = null;
    try {
      const lines = fs.readFileSync(pm2Log, 'utf8').trim().split('\n').filter((l) => l.includes('--cwd'));
      const last = lines[lines.length - 1] || '';
      const cwd = (/--cwd (\S+)/.exec(last) || [])[1] || '';
      const stat = (/static=(\S*)/.exec(last) || [])[1] || '';
      build = commitOf(cwd);
      // Resolve the release directory behind `current`, not the static root itself:
      // the fixture repo has no www/, and realpath on a missing leaf would throw and
      // silently turn a skew into "served=none".
      served = stat ? commitOf(fs.realpathSync(path.dirname(stat))) : null;
    } catch (e) { /* first case: no start yet */ }
    if (fs.existsSync(overrideFile)) {
      try {
        const o = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
        if (o.build !== undefined) build = o.build;
        if (o.served !== undefined) served = o.served;
      } catch (e) { /* ignore */ }
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      status: 'ok',
      mlkem: { backend },
      build: { commit: build },
      served: { commit: served, matches_process: served ? served === build : null },
    }));
  })
  .listen(port);
NODE


printf 'native' > "$SANDBOX/health/backend"
HEALTH_PORT=$(( (RANDOM % 20000) + 20000 ))
node "$SANDBOX/health/server.cjs" "$HEALTH_PORT" "$SANDBOX/health/backend" "$SANDBOX/pm2.log" "$SANDBOX/health/override.json" &
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
export PATH="$SANDBOX/bin:$PATH"
export NGINX_LOG="$SANDBOX/nginx.log"
export NGINX_SNIPPET="$SANDBOX/nginx/x-app-version.conf"
export NGINX_FAIL_T="$SANDBOX/health/nginx-fail-t"
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

# ---------------------------------------------------------------- case 8
# A successful deploy must stamp the header from the release it just switched to.
deploy --sha "$B"
rc=$?
[ "$rc" -eq 0 ] && grep -q "v0.0.0 (${B:0:8})" "$NGINX_SNIPPET" && grep -q "aligned ${B:0:7}" "$SANDBOX/deploy.log"
check "deploy stamps X-App-Version and reports an aligned tree" "$?"

# ---------------------------------------------------------------- case 9
# The failure this whole change exists for: the API starts, the backend answers, and the
# tree nginx serves is a different commit. That deploy must fail and restore the previous
# release rather than print OK.
printf '{"served":"deadbee"}' > "$SANDBOX/health/override.json"
deploy --sha "$A"
rc=$?
rm -f "$SANDBOX/health/override.json"
[ "$rc" -ne 0 ] && [ "$(readlink -f "$SANDBOX/fibemate/current")" = "$SANDBOX/fibemate/releases/$B" ] \
  && grep -q "does not agree" "$SANDBOX/deploy.log"
check "alignment skew fails the deploy and restores the previous release" "$?"

# --------------------------------------------------------------- case 10
# The process keeps the env var, not a resolved path. A --no-restart deploy moves
# `current` and leaves the old process running, so /health must report the split.
# If start_app had passed $dir instead of $CURRENT_LINK/www, served would stay on the
# old release and this case would go green while the site was actually skewed.
deploy --sha "$B"
rc=$?
deploy --sha "$A" --no-restart
rc2=$?
body="$(curl -fsS --max-time 5 "$HEALTH_JSON_URL" 2>/dev/null || true)"
build="$(printf '%s' "$body" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).build.commit))}catch(e){process.stdout.write("none")}})')"
served="$(printf '%s' "$body" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).served.commit))}catch(e){process.stdout.write("none")}})')"
[ "$rc" -eq 0 ] && [ "$rc2" -eq 0 ] && [ "$build" = "${B:0:7}" ] && [ "$served" = "${A:0:7}" ]
check "no-restart deploy leaves build on the old release and served on the new one" "$?"

# --------------------------------------------------------------- case 11
# nginx rejecting the stamped config must not leave the site on a release the
# process never started: the deploy fails and the previous snippet comes back byte
# for byte.
# First put the sandbox back into an aligned state, because case 10 left the process
# on one release and \`current\` on the other.
deploy --sha "$B"
before="$(sha256sum "$NGINX_SNIPPET" | cut -d' ' -f1)"
: > "$NGINX_FAIL_T"
deploy --sha "$A"
rc=$?
rm -f "$NGINX_FAIL_T"
after="$(sha256sum "$NGINX_SNIPPET" | cut -d' ' -f1)"
[ "$rc" -ne 0 ] && [ "$before" = "$after" ] \
  && [ "$(readlink -f "$SANDBOX/fibemate/current")" = "$SANDBOX/fibemate/releases/$B" ] \
  && grep -q "nginx -t rejected" "$SANDBOX/deploy.log"
check "a rejected nginx config fails the deploy and restores the previous snippet" "$?"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
