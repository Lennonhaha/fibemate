#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# FIBEMATE production deploy - sandwich flow ending in a black-box delivery gate.
#
#   usage: bash scripts/deploy-fibemate.sh            # dry run: print the plan only
#          bash scripts/deploy-fibemate.sh --apply    # actually deploy
#
# Steps: check clean -> unlock -> fetch/reset -> relock -> restart -> verify delivery
#
# The last step is not optional and is not cosmetic: scripts/check-live.cjs probes the
# public site and exits non-zero when the deployed bytes disagree with the repo. A
# deploy that "succeeded" but serves an old manifest, a stale mirror or a 404 is a
# failed deploy, and this script reports it as such instead of printing a green tick.
#
# Overridable: REPO_DIR, BASE_URL, PM2_APP, HEALTH_URL, SKIP_RESTART=1, LOCK_RECORD.
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
  echo "[dry-run] would unlock, fetch origin/main, reset --hard, relock, restart, verify"
  exit 0
fi

# [2/6] Record the real immutable set, then clear it. Directory-only is not enough:
# git has to unlink the old inode, so a file-level +i fails with "Operation not permitted".
# The set is measured, never assumed: production carries ~4.5k locked files spread over
# api/, dist/, src/, www/, docs/ and the repo root.
echo "[2/6] recording and clearing immutable flags..."
lsattr -R . 2>/dev/null | grep -- '----i' | sed 's/^[^ ]* //' | sed 's/^\.\///' | sort > "$LOCK_RECORD"
LOCK_COUNT="$(wc -l < "$LOCK_RECORD")"
echo "      immutable entries before deploy: $LOCK_COUNT"
while IFS= read -r f; do
  [ -n "$f" ] && chattr -i "$f" 2>/dev/null || true
done < "$LOCK_RECORD"

# [3/6] Fetch the reviewed commit.
echo "[3/6] fetching origin/main..."
git fetch origin main
git reset --hard origin/main
NEW_HEAD="$(git rev-parse HEAD)"
echo "      HEAD after deploy:  $NEW_HEAD"

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
