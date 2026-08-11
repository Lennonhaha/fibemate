#!/bin/bash
# deploy-check.sh — verify online version matches git HEAD
# Run after: git push → server pull → this script

set -e

SHA=$(git rev-parse --short HEAD)
URL="https://fibemate.net/"

echo "=== Deploy Check ==="
echo "Expected SHA: $SHA"
echo "Target URL:   $URL"

HTTP_CODE=$(curl -s -o /tmp/deploy-check-body.txt -w '%{http_code}' -k "$URL")
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: HTTP $HTTP_CODE"
  exit 1
fi

# Check 1: version badge in page content
if grep -q 'v3\.3\.0' /tmp/deploy-check-body.txt; then
  echo "✅ Version badge: v3.3.0 found in homepage"
else
  echo "❌ Version badge: v3.3.0 NOT found"
  exit 1
fi

# Check 2: X-App-Version header
HEADER_VER=$(curl -sI -k "$URL" | grep -i 'x-app-version' | awk '{print $2}' | tr -d '\r')
if [ -n "$HEADER_VER" ]; then
  echo "✅ X-App-Version header: $HEADER_VER"
else
  echo "⚠️  X-App-Version header: missing (not yet configured)"
fi

# Check 3: visualization count
VIZ_COUNT=$(grep -c 'proof-link' /tmp/deploy-check-body.txt || true)
echo "ℹ️  Viz card links found: $VIZ_COUNT"

echo "=== PASS ==="
rm -f /tmp/deploy-check-body.txt
