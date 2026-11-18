#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# Deploy one commit as an immutable release directory and switch `current` to it.
#
#   usage: bash scripts/deploy-release.sh --sha <commit> [--artifact-dir <dir>]
#                                         [--dry-run] [--no-restart] [--skip-npm]
#
# Why this exists: the API runs from /opt/fibemate/releases/<sha> (pm2 cwd) and
# nginx serves /opt/fibemate/current/www. The in-place tree (/opt/fibemate-full)
# still receives files from scripts/deploy-fibemate.sh, but nothing serves it - a
# deploy there prints OK while the live code does not change (2026-11-17).
#
# The order matters and is deliberate:
#   archive -> env link -> npm ci -> native artifact -> manifest -> tree gate ->
#   load test -> rename -> switch -> restart -> health
# Everything that can fail runs before the symlink moves, so a failure leaves the
# previous release serving. The switch itself is one rename(2).
#
# The repository is only read (git archive), so the chattr +i locks stay in place:
# this path never unlocks 4.5k files and therefore cannot leave them unlocked.
#
# Overridable: FIBEMATE_ROOT (default /opt/fibemate), REPO_DIR, ENV_SOURCE,
#              PM2_APP, PM2_CMD, HEALTH_JSON_URL, MLKEM_REQUIRE_NATIVE (default 1).
#
# Exit: 0 deployed and healthy, 1 failed (previous release still current), 2 usage.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/release-common.sh
. "$SCRIPT_DIR/lib/release-common.sh"

ROOT="${FIBEMATE_ROOT:-/opt/fibemate}"
RELEASES="$ROOT/releases"
CURRENT_LINK="$ROOT/current"
REPO_DIR="${REPO_DIR:-/opt/fibemate-repo}"
ENV_SOURCE="${ENV_SOURCE:-$ROOT/shared/.env}"
PM2_APP="${PM2_APP:-fibemate}"
PM2_CMD="${PM2_CMD:-pm2}"
HEALTH_JSON_URL="${HEALTH_JSON_URL:-http://127.0.0.1:3001/health}"
MLKEM_REQUIRE_NATIVE="${MLKEM_REQUIRE_NATIVE:-1}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

SHA=""
ARTIFACT_DIR=""
DRY_RUN=0
NO_RESTART=0
SKIP_NPM=0

usage() {
  printf 'usage: bash scripts/deploy-release.sh --sha <commit> [--artifact-dir <dir>]\n'
  printf '                                      [--dry-run] [--no-restart] [--skip-npm]\n'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --sha) SHA="${2:?--sha needs a commit}"; shift 2 ;;
    --artifact-dir) ARTIFACT_DIR="${2:?--artifact-dir needs a path}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-restart) NO_RESTART=1; shift ;;
    --skip-npm) SKIP_NPM=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[ -n "$SHA" ] || { usage >&2; exit 2; }

echo "=== FIBEMATE release deploy ==="
echo "root:    $ROOT"
echo "repo:    $REPO_DIR"
echo "target:  $SHA"

# Resolve the commit through the repository, never through the served tree: a short
# sha, a tag or a branch all have to name one object before anything is built.
FULL_SHA="$(git -C "$REPO_DIR" rev-parse --verify --quiet "$SHA^{commit}" || true)"
if [ -z "$FULL_SHA" ]; then
  die "$SHA is not a commit in $REPO_DIR; fetch it first (the repository is read-only here)"
fi
echo "resolved: $FULL_SHA"
TARGET="$RELEASES/$FULL_SHA"

CURRENT_BEFORE="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"
echo "current:  ${CURRENT_BEFORE:-<none>}"

if [ "$CURRENT_BEFORE" = "$TARGET" ] && [ -f "$TARGET/BUILD-MANIFEST.json" ]; then
  echo "already deployed; nothing to do"
  exit 0
fi

# A release directory is only trusted if it carries its manifest. A directory without
# one is an interrupted build; refuse instead of renaming it aside, because a failed
# rename would leave the release path missing rather than stale.
if [ -d "$TARGET" ] && [ ! -f "$TARGET/BUILD-MANIFEST.json" ]; then
  die "$TARGET exists without BUILD-MANIFEST.json (interrupted build); remove it and rerun"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would:"
  echo "  1. git archive $FULL_SHA -> $RELEASES/.$FULL_SHA.tmp"
  echo "  2. link .env from $ENV_SOURCE"
  [ "$SKIP_NPM" -eq 1 ] || echo "  3. npm ci --omit=dev in the release tree"
  if [ -n "$ARTIFACT_DIR" ]; then
    echo "  4. place mlkem.node from $ARTIFACT_DIR (offline, verified against its manifest)"
    echo "     the directory must contain mlkem.node, mlkem.node.sha256 and build-info.txt"
  else
    echo "  4. place mlkem.node by build key via scripts/fetch-native-artifact.sh (needs gh auth)"
  fi
  echo "  5. write BUILD-MANIFEST.json and verify every tracked file against $FULL_SHA"
  echo "  5b. check encoding of every tracked file in the new tree (fails the deploy)"
  echo "  6. require() the addon from the new tree and run a KEM roundtrip"
  echo "  7. rename into $TARGET, switch $CURRENT_LINK, restart $PM2_APP"
  echo "  8. wait for $HEALTH_JSON_URL to report mlkem.backend=native"
  echo "     on failure: switch back to ${CURRENT_BEFORE:-<none>} and restart"
  if [ -n "$ARTIFACT_DIR" ]; then
    missing=""
    for f in mlkem.node mlkem.node.sha256 build-info.txt; do
      [ -f "$ARTIFACT_DIR/$f" ] || missing="$missing $f"
    done
    if [ -z "$missing" ]; then
      echo "artifact dir: present (mlkem.node + sha256 + build-info)"
    else
      echo "artifact dir: INCOMPLETE, missing:$missing" >&2
      exit 1
    fi
  fi
  if [ -d "$TARGET" ]; then
    echo "target dir: already built; the existing tree will be verified and reused"
  fi
  exit 0
fi

[ "$(id -u)" -eq 0 ] || [ "${ALLOW_NON_ROOT:-0}" = "1" ] || die "run as root: pm2 runs as root and $ROOT is root-owned"
[ -d "$RELEASES" ] || die "$RELEASES does not exist"
mkdir -p "$RELEASES"

TMP="$RELEASES/.$FULL_SHA.tmp.$$"
CLEANED=0
cleanup() {
  if [ "$CLEANED" -eq 0 ] && [ -d "$TMP" ]; then
    rm -rf "$TMP"
  fi
}

restore_previous() {
  [ -n "$CURRENT_BEFORE" ] || {
    printf 'FAIL: no previous release to restore\n' >&2
    return 1
  }
  log "restoring $CURRENT_BEFORE"
  switch_current "$CURRENT_BEFORE" || printf 'FAIL: could not point current back at %s\n' "$CURRENT_BEFORE" >&2
  start_app "$CURRENT_BEFORE" || {
    printf 'FAIL: could not restart %s from %s\n' "$PM2_APP" "$CURRENT_BEFORE" >&2
    return 1
  }
  local seen
  seen="$(wait_for_health "${EXPECT_BACKEND:-native}" "$HEALTH_TIMEOUT")" || {
    printf 'FAIL: restored release does not report %s (saw %s)\n' "${EXPECT_BACKEND:-native}" "$seen" >&2
    return 1
  }
  log "restored; backend: $seen"
}

# Before the switch, an exit is harmless: the previous release is still current.
# After the switch, the failure paths below restore it explicitly.
on_error() {
  local rc=$?
  trap - ERR
  cleanup
  if [ "$(readlink "$CURRENT_LINK" 2>/dev/null || true)" = "$TARGET" ]; then
    printf 'FAIL: release %s is current and the deploy did not finish; rolling back\n' "$FULL_SHA" >&2
    restore_previous
  fi
  exit "$rc"
}
trap on_error ERR

# ---------------------------------------------------------------- build the tree
if [ -d "$TARGET" ]; then
  echo "[1/8] reusing the existing release tree"
  NEW_DIR="$TARGET"
else
  echo "[1/8] extracting $FULL_SHA from the repository"
  rm -rf "$TMP"
  mkdir -p "$TMP"
  git -C "$REPO_DIR" archive "$FULL_SHA" | tar -x -C "$TMP"
  NEW_DIR="$TMP"
fi

echo "[2/8] linking the environment file"
if [ -e "$ENV_SOURCE" ]; then
  [ -e "$NEW_DIR/.env" ] || ln -s "$ENV_SOURCE" "$NEW_DIR/.env"
  log ".env -> $(readlink "$NEW_DIR/.env" 2>/dev/null || echo "$ENV_SOURCE")"
else
  log "WARN: $ENV_SOURCE is absent; the API will start without it" >&2
fi

echo "[3/8] installing production dependencies"
if [ "$SKIP_NPM" -eq 1 ]; then
  log "skipped (--skip-npm)"
elif [ -d "$NEW_DIR/node_modules" ]; then
  log "node_modules already present; skipped"
else
  (cd "$NEW_DIR" && npm ci --omit=dev --no-audit --no-fund)
fi

echo "[4/8] placing the native ML-KEM addon"
NATIVE_REL="packages/pqc-kem/native/build/Release"
if [ "$MLKEM_REQUIRE_NATIVE" = "1" ]; then
  if [ ! -f "$NEW_DIR/$NATIVE_REL/mlkem.node" ]; then
    if [ -n "$ARTIFACT_DIR" ]; then
      bash "$SCRIPT_DIR/fetch-native-artifact.sh" --artifact-dir "$ARTIFACT_DIR" --dest "$NEW_DIR"
    else
      BUILD_KEY="$(node "$SCRIPT_DIR/native-artifact-key.cjs" --repo "$REPO_DIR" --commit "$FULL_SHA")"
      log "build key: $BUILD_KEY"
      bash "$SCRIPT_DIR/fetch-native-artifact.sh" --key "$BUILD_KEY" --dest "$NEW_DIR"
    fi
  else
    log "addon already present in the tree"
  fi
  MANIFEST="$NEW_DIR/$NATIVE_REL/mlkem.node.sha256"
  [ -f "$MANIFEST" ] || die "no mlkem.node.sha256 next to the addon; provenance is not verifiable"
  ACTUAL="$(sha256sum "$NEW_DIR/$NATIVE_REL/mlkem.node" | cut -d' ' -f1)"
  EXPECTED="$(head -1 "$MANIFEST" | awk '{print $1}')"
  [ "$ACTUAL" = "$EXPECTED" ] || die "addon sha256 $ACTUAL does not match its manifest $EXPECTED"
  log "addon verified: ${ACTUAL:0:12}"
  if [ -f "$NEW_DIR/$NATIVE_REL/build-info.txt" ]; then
    node -e '
const fs = require("fs");
const info = {};
for (const line of fs.readFileSync(process.argv[1], "utf8").trim().split("\n")) {
  const i = line.indexOf(": ");
  if (i > 0) info[line.slice(0, i)] = line.slice(i + 2);
}
const out = { sha256: process.argv[2], commit: info.commit || null, key: info.artifact_key || null,
              nativeTree: info.native_tree || null, march: info.march || null };
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1) + "\n");
console.log("provenance:", JSON.stringify(out));
' "$NEW_DIR/$NATIVE_REL/build-info.txt" "$ACTUAL" "$NEW_DIR/BUILD-NATIVE.json"
  else
    log "WARN: the addon carries no build-info.txt; only its sha256 is verifiable" >&2
  fi
else
  log "skipped (MLKEM_REQUIRE_NATIVE=0): the JS backend will be used"
fi

echo "[5/8] writing and verifying the build manifest"
node "$SCRIPT_DIR/write-build-manifest.cjs" --repo "$REPO_DIR" --commit "$FULL_SHA" --out "$NEW_DIR" --verify

echo "[6/8] verifying every tracked file against $FULL_SHA"
node "$SCRIPT_DIR/verify-tree-sha.cjs" --repo "$REPO_DIR" --commit "$FULL_SHA" \
  --tree src --tree packages --tree www --target "$NEW_DIR"

# Encoding is checked on the tree that is about to become current, not on the
# repository checkout. The old cron job scanned /opt/fibemate-repo every three
# hours: a checkout that stopped serving traffic (nginx root and pm2 cwd moved
# to /opt/fibemate/releases/<sha>), so it reported on files nobody downloads.
# The file list comes from the commit itself, which is the same source of truth
# as the build manifest; the scanner raises if the list is empty.
echo "[6b/8] checking encoding in the new tree"
ENC_LIST="$NEW_DIR/.encoding-filelist.$$"
git -C "$REPO_DIR" ls-tree -r -z --name-only "$FULL_SHA" | tr '\0' '\n' > "$ENC_LIST"
mapfile -t ENC_FILES < "$ENC_LIST"
rm -f "$ENC_LIST"
[ "${#ENC_FILES[@]}" -gt 0 ] || die "no tracked files for $FULL_SHA; refusing to deploy an unverified tree"
ENC_OUT="$(cd "$NEW_DIR" && node "$SCRIPT_DIR/check-encoding.cjs" "${ENC_FILES[@]}" 2>&1)" \
  || die "encoding check failed in the new tree: $ENC_OUT"
log "$ENC_OUT"

echo "[7/8] loading the addon from the new tree"
if [ "$MLKEM_REQUIRE_NATIVE" = "1" ]; then
  LOAD_OUT="$(node -e '
const pk = require(process.argv[1]);
if (!pk.usingNative) { console.error("usingNative=false"); process.exit(2); }
const k = pk.generateKeypair();
const e = pk.encapsulate(k.publicKey);
const d = pk.decapsulate(k.secretKey, e.ciphertext);
if (!Buffer.from(e.sharedSecret).equals(Buffer.from(d))) { console.error("roundtrip failed"); process.exit(3); }
console.log("usingNative=true, roundtrip PASS");
' "$NEW_DIR/packages/pqc-kem" 2>&1)" || die "the addon does not load in the new tree: $LOAD_OUT"
  log "$LOAD_OUT"
else
  log "skipped"
fi

# ---------------------------------------------------------------- make it current
if [ "$NEW_DIR" = "$TMP" ]; then
  mv "$TMP" "$TARGET"
  CLEANED=1
fi

echo "[8/8] switching current and restarting $PM2_APP"
switch_current "$TARGET"
log "current -> $TARGET"

if [ "$NO_RESTART" -eq 1 ]; then
  echo "WARNING: --no-restart leaves the API on the previous release while nginx serves" >&2
  echo "WARNING: the new www. Debugging only; run rollback-release.sh or restart pm2." >&2
  exit 0
fi

EXPECT_BACKEND="${MLKEM_EXPECT_BACKEND:-}"
if [ -z "$EXPECT_BACKEND" ]; then
  EXPECT_BACKEND="native"
  [ "$MLKEM_REQUIRE_NATIVE" = "1" ] || EXPECT_BACKEND="any"
fi
start_app "$TARGET"
if ! SEEN="$(wait_for_health "$EXPECT_BACKEND" "$HEALTH_TIMEOUT")"; then
  printf 'FAIL: %s reports %s after the restart, expected %s\n' "$HEALTH_JSON_URL" "$SEEN" "$EXPECT_BACKEND" >&2
  restore_previous
  exit 1
fi

echo
echo "DEPLOY OK: $FULL_SHA is current, mlkem.backend=$SEEN"
log "previous: ${CURRENT_BEFORE:-<none>}"
log "roll back with: bash scripts/rollback-release.sh --to ${CURRENT_BEFORE:-<sha>}"
