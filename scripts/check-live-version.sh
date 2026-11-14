#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# check-live-version.sh — does the live site serve the commit this checkout is on?
#
# History: this script used to grep the homepage for a hard-coded 'v3.3.0' while
# printing "v3.3.2 found", so it failed on a healthy deploy and proved nothing when
# it passed. The X-App-Version check only asked whether the header existed, never
# whether it was telling the truth.
#
# Now: the header is written at deploy time by scripts/deploy-fibemate.sh from the
# commit being deployed, and this script compares it against HEAD. Any difference is
# a failed deploy, not a warning.
#
# usage: bash scripts/check-live-version.sh
# env:   BASE_URL (default https://fibemate.net/), REPO_DIR, CURL_OPTS
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BASE_URL="${BASE_URL:-https://fibemate.net/}"
CURL_OPTS="${CURL_OPTS:-}"

cd "$REPO_DIR"

if [ ! -f package.json ]; then
  echo "FAIL: package.json not found in $REPO_DIR" >&2
  exit 1
fi

SHA="$(git rev-parse --short=8 HEAD)"
VERSION="$(node -p "require('./package.json').version")"
EXPECTED="v${VERSION} (${SHA})"

echo "=== Live version check ==="
echo "repo:     $REPO_DIR"
echo "expected: $EXPECTED"
echo "target:   $BASE_URL"

BODY="$(mktemp)"
HEADERS="$(mktemp)"
trap 'rm -f "$BODY" "$HEADERS"' EXIT

HTTP_CODE="$(curl -sS $CURL_OPTS -o "$BODY" -w '%{http_code}' "$BASE_URL" || echo 000)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: $BASE_URL returned HTTP $HTTP_CODE" >&2
  exit 1
fi
echo "✅ homepage: HTTP 200"

# The stamp is the deploy's own claim about which commit is being served.
curl -sSI $CURL_OPTS "$BASE_URL" > "$HEADERS" || true
ACTUAL="$(grep -i '^x-app-version:' "$HEADERS" | head -1 | cut -d: -f2- | sed 's/^ *//; s/ *$//' || true)"

if [ -z "$ACTUAL" ]; then
  echo "FAIL: X-App-Version header is missing — the site cannot say which commit it serves." >&2
  echo "      Expected: $EXPECTED" >&2
  exit 1
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "FAIL: live commit does not match this checkout." >&2
  echo "      live:     $ACTUAL" >&2
  echo "      expected: $EXPECTED" >&2
  echo "      Either the deploy did not run, or it deployed a different commit." >&2
  exit 1
fi
echo "✅ X-App-Version: $ACTUAL"

# The header and the page must agree; a stamped header over a stale body is worse
# than no header, because it looks authoritative.
if grep -q "v${VERSION}" "$BODY"; then
  echo "✅ homepage states v${VERSION}"
else
  echo "FAIL: homepage does not mention v${VERSION} while the header claims it." >&2
  exit 1
fi

VIZ_COUNT="$(grep -c 'proof-link' "$BODY" || true)"
echo "ℹ️  viz card links found: $VIZ_COUNT"

echo "=== PASS: live site serves $SHA ==="
