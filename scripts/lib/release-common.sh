# shellcheck shell=bash
# SPDX-License-Identifier: GPL-3.0-only
#
# Shared helpers for scripts/deploy-release.sh and scripts/rollback-release.sh.
#
# Sourced on purpose: the callers set CURRENT_LINK, PM2_APP, PM2_CMD and
# HEALTH_JSON_URL, and these functions read them from the caller's environment.
# Nothing here writes outside the paths the caller passes in.

log() { printf '      %s\n' "$*"; }

die() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

# The API reports the backend it actually loaded, so this is an observation of the
# running process rather than a reading of the files on disk. A release that ships
# mlkem.node but boots the JS fallback looks identical on disk and different here.
health_backend() {
  local body
  body="$(curl -fsS --max-time 5 "$HEALTH_JSON_URL" 2>/dev/null || true)"
  if [ -z "$body" ]; then
    printf 'unreachable'
    return 0
  fi
  printf '%s' "$body" | node -e '
let d = "";
process.stdin.on("data", (c) => { d += c; });
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d);
    process.stdout.write((j.mlkem && j.mlkem.backend) || "no-backend-field");
  } catch {
    process.stdout.write("unparseable");
  }
});'
}

# Poll until the process reports the expected backend. Prints the last observation
# either way, so a failure message says what was actually served.
# $1 = expected backend ("any" accepts any answer that is not an error)
# $2 = seconds to wait
wait_for_health() {
  local want="$1" secs="${2:-60}" i=0 seen='unreachable'
  while [ "$i" -lt "$secs" ]; do
    seen="$(health_backend)"
    if [ "$want" = "any" ]; then
      case "$seen" in
        unreachable | no-backend-field | unparseable) ;;
        *) printf '%s' "$seen"; return 0 ;;
      esac
    else
      if [ "$seen" = "$want" ]; then
        printf '%s' "$seen"
        return 0
      fi
    fi
    sleep 1
    i=$((i + 1))
  done
  printf '%s' "$seen"
  return 1
}

# Replace a directory symlink in one rename(2). `ln -sfn` is not atomic for
# directories: it unlinks and recreates, leaving a window where the path is absent.
switch_current() {
  local target="$1" link="${CURRENT_LINK:?CURRENT_LINK is not set}" tmp
  tmp="$link.new.$$"
  ln -s "$target" "$tmp" || return 1
  mv -Tf "$tmp" "$link" || {
    rm -f "$tmp"
    return 1
  }
}

# pm2 cannot retarget a running app at a new script path, so the app is recreated.
# That is also why the release directory must be final (renamed into place) before
# this runs: pm2 records the absolute path.
start_app() {
  local dir="$1"
  "$PM2_CMD" delete "$PM2_APP" >/dev/null 2>&1 || true
  "$PM2_CMD" start "$dir/src/index.js" --name "$PM2_APP" --cwd "$dir" >/dev/null
  "$PM2_CMD" save >/dev/null 2>&1 || true
}
