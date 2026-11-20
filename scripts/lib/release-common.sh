# shellcheck shell=bash
# SPDX-License-Identifier: GPL-3.0-only
#
# Shared helpers for scripts/deploy-release.sh and scripts/rollback-release.sh.
#
# Sourced on purpose: the callers set CURRENT_LINK, PM2_APP, PM2_CMD and
# HEALTH_JSON_URL, and these functions read them from the caller's environment.
# Nothing here writes outside the paths the caller passes in.

log() { printf '      %s\n' "$*"; }

# Unattended runs must fail, they must not wait. A prompt in a runner is
# indistinguishable from a hang: nothing is printed, the job burns its timeout, and the
# report says "timed out" instead of naming the command that wanted input.
#
# A terminal on stdin is the only signal that someone can answer, so that is the only
# case where prompts stay open. Everything else closes every interactive entry point:
# git stops asking for a credential, ssh stops asking for a password or a host key, and
# npm stops asking to install. Values the caller already set are kept when they already
# say what we need; a caller who pinned GIT_SSH_COMMAND had a reason.
harden_noninteractive() {
  if [ -t 0 ]; then
    log "stdin is a terminal: credential prompts stay available"
    return 0
  fi
  export GIT_TERMINAL_PROMPT=0
  export GIT_ASKPASS="${GIT_ASKPASS:-/bin/false}"
  export SSH_ASKPASS=/bin/false
  export SSH_ASKPASS_REQUIRE=never
  case "${GIT_SSH_COMMAND:-}" in
    *BatchMode*) : ;;
    '') export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=15' ;;
    *) export GIT_SSH_COMMAND="$GIT_SSH_COMMAND -o BatchMode=yes -o ConnectTimeout=15" ;;
  esac
  # GIT_TERMINAL_PROMPT=0 stops git from asking, but it does not stop a credential
  # HELPER from answering - and a helper can open a window and wait for a human. The
  # Windows git installer ships exactly such a helper, so "prompts disabled" was not
  # enough: on this laptop the first version of this function still hung on a 401.
  # An empty credential.helper resets the list, so no helper is consulted at all.
  # A deploy that genuinely needs a credential passes it in the environment or the URL;
  # FIBEMATE_ALLOW_CREDENTIAL_HELPERS=1 keeps the helpers for a host that needs them.
  if [ "${FIBEMATE_ALLOW_CREDENTIAL_HELPERS:-0}" != "1" ]; then
    if [ -z "${GIT_CONFIG_COUNT:-}" ]; then
      export GIT_CONFIG_COUNT=1
      export GIT_CONFIG_KEY_0=credential.helper
      export GIT_CONFIG_VALUE_0=
    else
      local_n="$GIT_CONFIG_COUNT"
      export "GIT_CONFIG_KEY_$local_n=credential.helper"
      export "GIT_CONFIG_VALUE_$local_n="
      export GIT_CONFIG_COUNT=$((local_n + 1))
    fi
  fi
  export npm_config_yes=true
  export DEBIAN_FRONTEND=noninteractive
  log "stdin is not a terminal: git prompts off and credential helpers cleared, ssh BatchMode=yes, npm --yes - a prompt now fails instead of waiting"
}

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
#
# The exit status of `pm2 start` is returned, not `pm2 save`'s: a start that fails
# must reach the caller, or a rollback would report success for a process that is
# not running.
start_app() {
  local dir="$1" static_root
  # #603: the process must be told which tree the web server serves. Without this the
  # /health `served` block reports "not-configured" and the comparison that exists to
  # make a skew visible has nothing to compare. $CURRENT_LINK is the symlink nginx
  # follows, not $dir, so a --no-restart deploy still shows up as a skew instead of
  # being washed away by pointing at the process's own tree.
  static_root="${FIBEMATE_STATIC_ROOT:-${CURRENT_LINK:-$dir}/www}"
  "$PM2_CMD" delete "$PM2_APP" >/dev/null 2>&1 || true
  FIBEMATE_STATIC_ROOT="$static_root" \
    "$PM2_CMD" start "$dir/src/index.js" --name "$PM2_APP" --cwd "$dir" >/dev/null || return 1
  "$PM2_CMD" save >/dev/null 2>&1 || printf 'WARN: pm2 save failed; the started process is not persisted\n' >&2
  return 0
}

# The nginx header is the only version a plain HTTP client sees. deploy-fibemate.sh
# stamped it from the checkout; the release path left it to a human, so a release could
# be current while the header still named the previous commit (2026-11-20). Writes from
# the release's own package.json and the SHA being deployed, so it cannot go stale.
stamp_version_header() {
  local dir="$1" sha="$2" snippet="${NGINX_SNIPPET:-/etc/nginx/snippets/x-app-version.conf}" version
  if [ "${SKIP_NGINX_STAMP:-0}" = "1" ]; then
    log "version stamp skipped (SKIP_NGINX_STAMP=1)"
    return 0
  fi
  if ! command -v nginx >/dev/null 2>&1; then
    log "nginx not found; version stamp skipped"
    return 0
  fi
  # Read the file through argv, not through a JS string literal: a Windows path in a
  # quoted literal loses its backslashes before node ever sees it.
  version="$(node -e 'try { process.stdout.write(String(require(process.argv[1]).version || "")); } catch (e) { }' "$dir/package.json" 2>/dev/null || true)"
  if [ -z "$version" ]; then
    printf 'FAIL: cannot read version from %s/package.json\n' "$dir" >&2
    return 1
  fi
  mkdir -p "$(dirname "$snippet")" || return 1
  [ -f "$snippet" ] && cp "$snippet" "$snippet.bak"
  printf '%s\n' "add_header X-App-Version \"v$version (${sha:0:8})\" always;" > "$snippet" || return 1
  if nginx -t >/dev/null 2>&1; then
    nginx -s reload
    log "X-App-Version: v$version (${sha:0:8})"
  else
    printf 'FAIL: nginx -t rejected the stamped config; restoring the previous snippet\n' >&2
    if [ -f "$snippet.bak" ]; then mv -f "$snippet.bak" "$snippet"; else rm -f "$snippet"; fi
    nginx -t >&2 || true
    return 1
  fi
}

# One machine-readable line about the two commits /health reports.
# Prints: "aligned <short>" | "skew build=<b> served=<s> matches=<m>" | "unreachable".
health_alignment() {
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
  let j;
  try { j = JSON.parse(d); } catch { process.stdout.write("unparseable"); return; }
  const b = (j.build && j.build.commit) || "none";
  const s = (j.served && j.served.commit) || "none";
  const m = (j.served && typeof j.served.matches_process === "boolean") ? String(j.served.matches_process) : "null";
  if (b === s && m === "true") process.stdout.write("aligned " + b);
  else process.stdout.write("skew build=" + b + " served=" + s + " matches=" + m);
});'
}

# Poll until /health says the served tree is the release just deployed. Waiting for the
# backend alone made "the deploy printed OK" and "the site reports this commit" two
# different statements, which is the shape of every false green this project has had.
# $1 = expected short sha, $2 = seconds
wait_for_alignment() {
  local want="$1" secs="${2:-60}" i=0 seen='unreachable'
  while [ "$i" -lt "$secs" ]; do
    seen="$(health_alignment)"
    if [ "$seen" = "aligned $want" ]; then
      printf '%s' "$seen"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  printf '%s' "$seen"
  return 1
}
