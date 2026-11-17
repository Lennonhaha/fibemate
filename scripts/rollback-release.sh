#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# Put a previous release back and restart the API, in one command.
#
#   usage: bash scripts/rollback-release.sh [--to <sha>] [--dry-run]
#
# Default target is the most recent release directory that is not the current one.
# --to accepts a full or abbreviated sha (it must match exactly one release).
#
# The switch is one rename(2). If the restored release does not come up healthy, or
# does not start at all, the script switches back to the release it started from, so
# a rollback cannot leave the site on a third, unintended tree.
#
# Overridable: FIBEMATE_ROOT, PM2_APP, PM2_CMD, HEALTH_JSON_URL,
#              MLKEM_REQUIRE_NATIVE (default 1).
#
# Exit: 0 restored and healthy, 1 failed (original release still current), 2 usage.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/release-common.sh
. "$SCRIPT_DIR/lib/release-common.sh"

ROOT="${FIBEMATE_ROOT:-/opt/fibemate}"
RELEASES="$ROOT/releases"
CURRENT_LINK="$ROOT/current"
PM2_APP="${PM2_APP:-fibemate}"
PM2_CMD="${PM2_CMD:-pm2}"
HEALTH_JSON_URL="${HEALTH_JSON_URL:-http://127.0.0.1:3001/health}"
MLKEM_REQUIRE_NATIVE="${MLKEM_REQUIRE_NATIVE:-1}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

TO=""
DRY_RUN=0

usage() {
  printf 'usage: bash scripts/rollback-release.sh [--to <sha>] [--dry-run]\n'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --to) TO="${2:?--to needs a commit}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

echo "=== FIBEMATE release rollback ==="

ORIGINAL="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"
[ -n "$ORIGINAL" ] || die "$CURRENT_LINK is not a symlink to a release"
echo "current:  $ORIGINAL"

resolve_target() {
  if [ -n "$TO" ]; then
    local matches n
    matches="$(find "$RELEASES" -maxdepth 1 -mindepth 1 -type d -name "$TO*" ! -name '.*' | sort)"
    n="$(printf '%s' "$matches" | grep -c . || true)"
    [ "$n" -ge 1 ] || die "no release directory matches $TO"
    [ "$n" -eq 1 ] || die "$TO matches $n releases; pass a longer sha"
    printf '%s' "$matches"
    return 0
  fi
  # Previous = newest release that is not current and carries a manifest.
  local d
  for d in $(find "$RELEASES" -maxdepth 1 -mindepth 1 -type d ! -name '.*' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-); do
    [ "$d" = "$ORIGINAL" ] && continue
    if [ -f "$d/BUILD-MANIFEST.json" ]; then
      printf '%s' "$d"
      return 0
    fi
  done
  die "no earlier release with a BUILD-MANIFEST.json under $RELEASES"
}

TARGET="$(resolve_target)"
echo "target:   $TARGET"
[ -f "$TARGET/BUILD-MANIFEST.json" ] || die "$TARGET has no BUILD-MANIFEST.json"
[ -f "$TARGET/src/index.js" ] || die "$TARGET has no src/index.js"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would switch $CURRENT_LINK -> $TARGET, restart $PM2_APP,"
  echo "[dry-run] wait for $HEALTH_JSON_URL to report mlkem.backend=native,"
  echo "[dry-run] and switch back to $ORIGINAL if that does not happen"
  exit 0
fi

EXPECT_BACKEND="${MLKEM_EXPECT_BACKEND:-}"
if [ -z "$EXPECT_BACKEND" ]; then
  EXPECT_BACKEND="native"
  [ "$MLKEM_REQUIRE_NATIVE" = "1" ] || EXPECT_BACKEND="any"
fi

START_TS="$(date +%s)"

# Any failure after this point has already moved the pointer, so every path has to put
# ORIGINAL back before exiting: a rollback must not strand the site on a release that
# is not running.
restore_original() {
  local reason="$1"
  printf 'FAIL: %s\n' "$reason" >&2
  printf 'FAIL: switching back to %s\n' "$ORIGINAL" >&2
  switch_current "$ORIGINAL" || printf 'FAIL: could not point current back at %s\n' "$ORIGINAL" >&2
  start_app "$ORIGINAL" || printf 'FAIL: could not restart %s from %s\n' "$PM2_APP" "$ORIGINAL" >&2
  wait_for_health "$EXPECT_BACKEND" "$HEALTH_TIMEOUT" >/dev/null \
    || printf 'FAIL: the original release does not report %s either\n' "$EXPECT_BACKEND" >&2
  exit 1
}

switch_current "$TARGET" || restore_original "could not switch current to $TARGET"
log "current -> $TARGET"
start_app "$TARGET" || restore_original "could not start $PM2_APP from $TARGET"

if ! SEEN="$(wait_for_health "$EXPECT_BACKEND" "$HEALTH_TIMEOUT")"; then
  restore_original "$HEALTH_JSON_URL reports $SEEN, expected $EXPECT_BACKEND"
fi

ELAPSED=$(( $(date +%s) - START_TS ))
echo
echo "ROLLBACK OK: $(basename "$TARGET") is current, mlkem.backend=$SEEN, ${ELAPSED}s"
log "forward again with: bash scripts/deploy-release.sh --sha $(basename "$TARGET")"
