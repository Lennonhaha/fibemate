#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# FIBEMATE production deploy - sandwich flow ending in a black-box delivery gate.
#
#   usage: bash scripts/deploy-fibemate.sh            # dry run: print the plan only
#          bash scripts/deploy-fibemate.sh --apply    # actually deploy
#
# Steps: check clean -> unlock -> fetch/reset -> stamp -> sync the API tree ->
#        relock -> restart -> verify delivery
#
# The last step is not optional and is not cosmetic: scripts/check-live.cjs probes the
# public site and exits non-zero when the deployed bytes disagree with the repo. A
# deploy that "succeeded" but serves an old manifest, a stale mirror or a 404 is a
# failed deploy, and this script reports it as such instead of printing a green tick.
#
# Overridable: REPO_DIR, BASE_URL, PM2_APP, HEALTH_URL, SKIP_RESTART=1, LOCK_RECORD,
#             PACKAGES_SYNC=1 (copy packages/ without --delete),
#             REQUIRE_PACKAGES_MATCH=1 (fail instead of warn on packages/ drift),
#             MLKEM_REQUIRE_NATIVE=1 (fail when the native addon is not deployed).
#
# The immutable (+i) flags are NOT assumed to cover a fixed list of directories: they
# are read from the checkout before the deploy and restored verbatim afterwards. Getting
# this wrong is not cosmetic - `git reset --hard` dies halfway with "Operation not
# permitted" and leaves the serving tree in a half-deployed state.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/fibemate-repo}"
BASE_URL="${BASE_URL:-https://fibemate.net}"
LOCK_RECORD="${LOCK_RECORD:-/tmp/fibemate-lock-set.txt}"
PM2_APP="${PM2_APP:-fibemate}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/mlkem/test}"
# The site and the API are served from two different trees. nginx reads
# $REPO_DIR/www; pm2 runs $RUNTIME_DIR/src/index.js. Resetting the checkout
# alone leaves the API on the previous release - that is how a deploy reported
# "OK" while /api/auth/verify still answered with the old rate limit and the
# old code (issue #500).
RUNTIME_DIR="${RUNTIME_DIR:-/opt/fibemate-full}"
SYNC_TREES="${SYNC_TREES:-src}"

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help)
      sed -n '3,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      echo "usage: bash scripts/deploy-fibemate.sh [--apply]" >&2
      exit 2
      ;;
  esac
done

echo "=== FIBEMATE deploy ==="
echo "repo:    $REPO_DIR"
echo "site:    $BASE_URL"
echo "locks:   measured from the checkout -> $LOCK_RECORD"
if [ "$APPLY" -eq 0 ]; then
  echo "mode:    DRY RUN (nothing will be changed; add --apply to deploy)"
fi

# Where the script itself lives, resolved before any `cd`: bash reads a script
# lazily, so when git reset replaces this file mid-run the process keeps executing
# the OLD inode. That is how a deploy of a new deploy script ran the previous
# logic and printed green (2026-11-15, #505): the sync step simply never existed
# for that run. The sha of this file is captured here and compared after the
# reset; a change triggers one re-exec so the new code actually runs.
SELF_PATH="$0"
case "$SELF_PATH" in
  /*) ;;
  *) SELF_PATH="$(cd "$(dirname "$SELF_PATH")" && pwd)/$(basename "$SELF_PATH")" ;;
esac
SELF_SHA_BEFORE=""
if [ -f "$SELF_PATH" ]; then
  SELF_SHA_BEFORE="$(sha256sum "$SELF_PATH" | cut -d' ' -f1)"
fi

# [1/6] The server must not carry local edits: production runs committed code only.
echo "[1/6] checking the working tree is clean..."
cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "FAIL: working tree has local changes; commit or discard them first" >&2
  git status --porcelain >&2
  exit 1
fi
OLD_HEAD="$(git rev-parse HEAD)"
echo "      HEAD before deploy: $OLD_HEAD"

if [ "$APPLY" -eq 0 ]; then
  echo "[dry-run] would unlock, fetch origin/main, reset --hard, stamp the version,"
  echo "[dry-run] rsync $SYNC_TREES -> $RUNTIME_DIR/$SYNC_TREES, relock, restart, verify"
  exit 0
fi

# [2/6] Record the real immutable set, then clear it. Directory-only is not enough:
# git has to unlink the old inode, so a file-level +i fails with "Operation not permitted".
# The set is measured, never assumed: production carries ~4.5k locked files spread over
# api/, dist/, src/, www/, docs/ and the repo root.
echo "[2/6] recording and clearing immutable flags..."
if [ "${SKIP_UNLOCK:-0}" = "1" ]; then
  # Re-exec path: the previous invocation already cleared the flags, so measuring
  # now would record an empty set and"restore" nothing, silently leaving the
  # whole tree writable. Reuse the record the first run made.
  LOCK_COUNT="$(wc -l < "$LOCK_RECORD")"
  echo "      lock set already recorded by the previous run: $LOCK_COUNT entries"
else
  lsattr -R . 2>/dev/null | grep -- '----i' | sed 's/^[^ ]* //' | sed 's/^\.\///' | sort > "$LOCK_RECORD"
  LOCK_COUNT="$(wc -l < "$LOCK_RECORD")"
  echo "      immutable entries before deploy: $LOCK_COUNT"
  while IFS= read -r f; do
    [ -n "$f" ] && chattr -i "$f" 2>/dev/null || true
  done < "$LOCK_RECORD"
fi

# [3/6] Fetch the reviewed commit.
echo "[3/6] fetching origin/main..."
git fetch origin main
git reset --hard origin/main
NEW_HEAD="$(git rev-parse HEAD)"
echo "      HEAD after deploy:  $NEW_HEAD"

# [3a/6] Did this commit change the deploy script itself? Bash is already running
# the old bytes, so continuing would silently skip whatever the new version adds.
# Re-exec once, keeping the argument list and the lock record. The guard env var
# makes a second change impossible to loop on.
SELF_SHA_AFTER=""
if [ -f "$SELF_PATH" ]; then
  SELF_SHA_AFTER="$(sha256sum "$SELF_PATH" | cut -d' ' -f1)"
fi
if [ -n "$SELF_SHA_BEFORE" ] && [ -n "$SELF_SHA_AFTER" ] && [ "$SELF_SHA_BEFORE" != "$SELF_SHA_AFTER" ]; then
  if [ "${DEPLOY_REEXEC:-0}" = "1" ]; then
    echo "      deploy script changed again during the re-exec; continuing with the loaded copy" >&2
  else
    echo "[3a/6] the deploy script changed in this commit (${SELF_SHA_BEFORE:0:12} -> ${SELF_SHA_AFTER:0:12})"
    echo "      re-executing so the new logic runs, instead of finishing on the old code"
    export DEPLOY_REEXEC=1
    export SKIP_UNLOCK=1
    exec bash "$SELF_PATH" "$@"
  fi
fi

# [3b/6] Stamp the version the site will report. The header used to be a literal
# in the nginx config ("v3.3.2 (48fc029a)") and stayed there for months, so every
# deploy served a version that no longer existed. It is now written from the commit
# that was just checked out, validated with `nginx -t`, and rolled back on failure.
NGINX_SNIPPET="${NGINX_SNIPPET:-/etc/nginx/snippets/x-app-version.conf}"
if [ "${SKIP_NGINX_STAMP:-0}" = "1" ]; then
  echo "[3b/6] version stamp skipped (SKIP_NGINX_STAMP=1)"
elif ! command -v nginx >/dev/null 2>&1; then
  echo "[3b/6] nginx not found on this host; skipping version stamp"
else
  APP_VERSION="$(node -p "require('$REPO_DIR/package.json').version")"
  SHORT_SHA="$(git rev-parse --short=8 HEAD)"
  echo "[3b/6] stamping X-App-Version: v$APP_VERSION ($SHORT_SHA)"
  mkdir -p "$(dirname "$NGINX_SNIPPET")"
  if [ -f "$NGINX_SNIPPET" ]; then cp "$NGINX_SNIPPET" "$NGINX_SNIPPET.bak"; fi
  printf '%s\n' "add_header X-App-Version \"v$APP_VERSION ($SHORT_SHA)\" always;" > "$NGINX_SNIPPET"
  if nginx -t >/dev/null 2>&1; then
    nginx -s reload
    echo "      nginx reloaded with the new stamp"
  else
    echo "FAIL: 'nginx -t' rejected the stamped config; restoring the previous snippet." >&2
    if [ -f "$NGINX_SNIPPET.bak" ]; then mv "$NGINX_SNIPPET.bak" "$NGINX_SNIPPET"; else rm -f "$NGINX_SNIPPET"; fi
    nginx -t >&2 || true
    exit 1
  fi
fi

# [3c/6] Sync the API tree, then prove it matches the commit that was just checked out.
#
# This step exists because "the deploy printed OK" and "the API runs the new code"
# were allowed to be different statements. The reset above only moves the checkout;
# pm2 keeps running whatever is in $RUNTIME_DIR. Everything below is measured: the
# trees are compared file by file against the git tree, and the run fails if a single
# tracked file differs or if pm2 is serving a path outside $RUNTIME_DIR.
echo "[3c/6] syncing the API tree into $RUNTIME_DIR/$SYNC_TREES..."
if [ ! -d "$RUNTIME_DIR/$SYNC_TREES" ]; then
  echo "FAIL: $RUNTIME_DIR/$SYNC_TREES does not exist; refusing to guess where the API runs" >&2
  exit 1
fi

# Where does pm2 actually run from? If this disagrees with RUNTIME_DIR, the sync
# would update a tree nobody loads and the deploy would be green for no reason.
PM2_EXEC="$(pm2 jlist 2>/dev/null | node -e '
  let s = "";
  process.stdin.on("data", (d) => { s += d; });
  process.stdin.on("end", () => {
    try {
      const app = JSON.parse(s).find((p) => p.name === process.argv[1]);
      process.stdout.write((app && app.pm2_env && app.pm2_env.pm_exec_path) || "");
    } catch (e) { process.stdout.write(""); }
  });
' "$PM2_APP" || true)"
if [ -z "$PM2_EXEC" ]; then
  echo "FAIL: pm2 has no process named '$PM2_APP'; cannot verify where the API runs" >&2
  exit 1
fi
case "$PM2_EXEC" in
  "$RUNTIME_DIR"/*) echo "      pm2 exec: $PM2_EXEC" ;;
  *)
    echo "FAIL: pm2 runs $PM2_EXEC, which is outside $RUNTIME_DIR" >&2
    echo "      syncing that tree would leave the loaded code untouched; aborting" >&2
    exit 1
    ;;
esac

BACKUP_DIR="$RUNTIME_DIR/.deploy-backup/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
for tree in $SYNC_TREES; do
  tar -czf "$BACKUP_DIR/$tree.tar.gz" -C "$RUNTIME_DIR" "$tree"
done
echo "      runtime backup: $BACKUP_DIR"

for tree in $SYNC_TREES; do
  # --delete makes the tree identical instead of merely up to date: a module that
  # no longer exists in the repo must not keep loading in production. Backup files
  # and patch leftovers are excluded from the delete so they survive on purpose.
  rsync -a --delete \
    --exclude '*.bak' --exclude '*.bak.*' --exclude '*.orig' --exclude '*.rej' \
    "$REPO_DIR/$tree/" "$RUNTIME_DIR/$tree/"
  echo "      synced $tree"
done

# The gate. Every tracked file in every synced tree must be byte-identical to the
# checkout, and no unexpected file may exist on the runtime side.
MISMATCH=0
CHECKED=0
for tree in $SYNC_TREES; do
  while IFS= read -r f; do
    rel="${f#"$tree"/}"
    CHECKED=$((CHECKED + 1))
    if [ ! -f "$RUNTIME_DIR/$tree/$rel" ]; then
      echo "      MISMATCH $tree/$rel (missing in the runtime tree)" >&2
      MISMATCH=$((MISMATCH + 1))
      continue
    fi
    repo_sha="$(sha256sum "$REPO_DIR/$f" | cut -d' ' -f1)"
    run_sha="$(sha256sum "$RUNTIME_DIR/$tree/$rel" | cut -d' ' -f1)"
    if [ "$repo_sha" != "$run_sha" ]; then
      echo "      MISMATCH $tree/$rel (repo ${repo_sha:0:12} != runtime ${run_sha:0:12})" >&2
      MISMATCH=$((MISMATCH + 1))
    fi
  done < <(git -C "$REPO_DIR" ls-tree -r --name-only HEAD "$tree")
done
if [ "$MISMATCH" -ne 0 ]; then
  echo "FAIL: $MISMATCH of $CHECKED files still differ after the sync; the API would serve old code." >&2
  echo "      runtime backup kept at $BACKUP_DIR" >&2
  exit 1
fi
echo "      runtime tree matches $NEW_HEAD: $CHECKED files, sha256 identical"

# [3d/6] Native ML-KEM addon: prove it is there, and that it is the build we think.
#
# The addon is a binary that no `git checkout` produces. Until the deploy builds it
# itself, this step can only measure: present/absent, sha against a build manifest,
# and mtime against the newest native source commit. A missing addon is a WARN by
# default, because today's deploy does not build one - making that a hard failure
# would block every deploy until CI builds it (#520 follow-up).
echo "[3d/6] checking the native ML-KEM addon..."
NATIVE_REL="packages/pqc-kem/native/build/Release/mlkem.node"
NATIVE_NODE="$RUNTIME_DIR/$NATIVE_REL"
NATIVE_MANIFEST="$NATIVE_NODE.sha256"
NEWEST_NATIVE_TS="$(git -C "$REPO_DIR" log -1 --format=%ct -- 'packages/pqc-kem/native/*.c' 'packages/pqc-kem/native/*.h' 2>/dev/null || echo 0)"
NEWEST_NATIVE_TS="${NEWEST_NATIVE_TS:-0}"
if [ -f "$NATIVE_NODE" ]; then
  NATIVE_SHA="$(sha256sum "$NATIVE_NODE" | cut -d' ' -f1)"
  NATIVE_MTIME="$(stat -c %Y "$NATIVE_NODE")"
  echo "      addon present: ${NATIVE_SHA:0:12} ($(stat -c %s "$NATIVE_NODE") B, built $(date -u -d @\"$NATIVE_MTIME\" +%Y-%m-%dT%H:%M:%SZ))"
  if [ -f "$NATIVE_MANIFEST" ]; then
    EXPECTED_NATIVE_SHA="$(head -1 "$NATIVE_MANIFEST" | awk '{print $1}')"
    if [ "$EXPECTED_NATIVE_SHA" = "$NATIVE_SHA" ]; then
      echo "      build manifest matches"
    else
      echo "FAIL: $NATIVE_REL does not match its build manifest" >&2
      echo "      manifest: ${EXPECTED_NATIVE_SHA:0:12}  deployed: ${NATIVE_SHA:0:12}" >&2
      exit 1
    fi
  else
    echo "      WARN: no build manifest at $NATIVE_MANIFEST; the addon cannot be traced to a build" >&2
  fi
  if [ "$NEWEST_NATIVE_TS" -gt 0 ] && [ "$NATIVE_MTIME" -lt "$NEWEST_NATIVE_TS" ]; then
    echo "      WARN: addon mtime is older than the newest native source commit ($(date -u -d @\"$NEWEST_NATIVE_TS\" +%Y-%m-%dT%H:%M:%SZ))" >&2
    echo "      WARN: rebuild it before trusting native parity" >&2
  fi
else
  echo "      WARN: $NATIVE_REL is missing; the API will run the pure-JS backend" >&2
  if [ "${MLKEM_REQUIRE_NATIVE:-0}" = "1" ]; then
    echo "FAIL: MLKEM_REQUIRE_NATIVE=1 but the addon is not deployed" >&2
    exit 1
  fi
fi

# [3e/6] packages/ is deliberately not in SYNC_TREES: `rsync --delete` over it would
# remove the runtime-only node_modules the API actually loads (#507). Report the drift
# instead of hiding it, and make it blocking only when asked.
echo "[3e/6] comparing packages/ against $NEW_HEAD..."
if [ "${PACKAGES_SYNC:-0}" = "1" ]; then
  rsync -a --exclude 'node_modules/' --exclude 'build/' \
    "$REPO_DIR/packages/" "$RUNTIME_DIR/packages/"
  echo "      copied packages/ without --delete (runtime node_modules preserved)"
fi
PK_SAME=0
PK_DIFF=0
PK_MISSING=0
while IFS= read -r f; do
  rel="${f#packages/}"
  if [ ! -f "$RUNTIME_DIR/packages/$rel" ]; then
    PK_MISSING=$((PK_MISSING + 1))
    continue
  fi
  if [ "$(sha256sum "$REPO_DIR/$f" | cut -d' ' -f1)" = "$(sha256sum "$RUNTIME_DIR/packages/$rel" | cut -d' ' -f1)" ]; then
    PK_SAME=$((PK_SAME + 1))
  else
    PK_DIFF=$((PK_DIFF + 1))
  fi
done < <(git -C "$REPO_DIR" ls-tree -r --name-only HEAD packages | grep -v '/native/build/' | grep -v '/node_modules/' || true)
echo "      tracked files: same=$PK_SAME differ=$PK_DIFF missing=$PK_MISSING"
if [ "$PK_DIFF" -ne 0 ] || [ "$PK_MISSING" -ne 0 ]; then
  echo "      WARN: runtime packages/ does not match the checkout (see #507); run with PACKAGES_SYNC=1 to copy" >&2
  if [ "${REQUIRE_PACKAGES_MATCH:-0}" = "1" ]; then
    echo "FAIL: REQUIRE_PACKAGES_MATCH=1 and $PK_DIFF files differ, $PK_MISSING are missing" >&2
    exit 1
  fi
fi

# [4/6] Restore exactly the flags that were there before. Anything else either
# widens the locked surface (surprise for the next deploy) or narrows it.
echo "[4/6] restoring immutable flags..."
RESTORED=0
while IFS= read -r f; do
  [ -n "$f" ] && chattr +i "$f" 2>/dev/null && RESTORED=$((RESTORED + 1))
done < "$LOCK_RECORD"
echo "      immutable entries restored: $RESTORED (expected $LOCK_COUNT)"
lsattr -R . 2>/dev/null | grep -- '----i' | sed 's/^[^ ]* //' | sed 's/^\.\///' | sort > "$LOCK_RECORD.after"
if diff -q "$LOCK_RECORD" "$LOCK_RECORD.after" >/dev/null; then
  echo "      lock set identical to before deploy"
else
  echo "FAIL: lock set changed; the next deploy may fail." >&2
  diff "$LOCK_RECORD" "$LOCK_RECORD.after" | head -20 >&2
  exit 1
fi

# [5/6] Restart the API and check it answers locally.
if [ "${SKIP_RESTART:-0}" = "1" ]; then
  echo "[5/6] restart skipped (SKIP_RESTART=1)"
else
  echo "[5/6] restarting $PM2_APP and checking $HEALTH_URL..."
  pm2 restart "$PM2_APP" --update-env >/dev/null
  sleep 3
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || echo 000)"
  if [ "$CODE" = "200" ]; then
    echo "      health: 200"
  else
    echo "FAIL: $HEALTH_URL returned $CODE" >&2
    exit 1
  fi
  # Restarting does not change files, but it is the last moment where a stale tree
  # could still be loaded (pm2 may have been pointed elsewhere by hand). Re-check the
  # hash of the entry point after the restart rather than trusting the earlier pass.
  LIVE_ENTRY_SHA="$(sha256sum "$RUNTIME_DIR/src/index.js" | cut -d' ' -f1)"
  REPO_ENTRY_SHA="$(sha256sum "$REPO_DIR/src/index.js" | cut -d' ' -f1)"
  if [ "$LIVE_ENTRY_SHA" != "$REPO_ENTRY_SHA" ]; then
    echo "FAIL: $RUNTIME_DIR/src/index.js changed between the sync and the restart" >&2
    exit 1
  fi
  echo "      loaded entry point matches the repo: ${LIVE_ENTRY_SHA:0:12}"
fi

# [6/6] Black-box delivery gate. This is the step that turns "I ran the script" into
# "the site actually serves what the repo says it should".
echo "[6/6] verifying delivery against $BASE_URL..."
if ! node "$REPO_DIR/scripts/check-live.cjs" --repo "$REPO_DIR" --base "$BASE_URL"; then
  echo "" >&2
  echo "FAIL: deploy finished but the live site does not match the repo." >&2
  echo "      Deployed commit $NEW_HEAD is NOT verified. Treat this deploy as failed." >&2
  exit 1
fi

echo ""
echo "DEPLOY OK: $OLD_HEAD -> $NEW_HEAD, delivery verified"
