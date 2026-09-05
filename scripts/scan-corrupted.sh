#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# scan-corrupted.sh — full-repo encoding corruption scanner (bash)
#
# Fast bash scanner for U+FFFD replacement chars across tracked text files.
# PREFER scripts/check-encoding.cjs (Node.js) on any host with Node available —
# it also checks BOM / NUL / invalid-UTF-8 and is faster. This script is a
# lightweight fallback for CI/ubuntu where only grep is desired.
#
# Usage: bash scripts/scan-corrupted.sh
# Exit: 0 = clean, 1 = corruption found.

set -uo pipefail

echo "🔍 Full-repo encoding corruption scan (U+FFFD)..."

EXT_PATTERN='\.(js|mjs|cjs|jsx|ts|tsx|html|htm|md|json|css|scss|yaml|yml|toml|py|rs|sh|ps1|sql|vue|txt|tcl|xml)$'

# Collect matching tracked files once.
mapfile -t FILES < <(git ls-files | grep -E "$EXT_PATTERN")

TOTAL=0
AFFECTED=0
ISSUES=""

for file in "${FILES[@]}"; do
  [ -f "$file" ] || continue
  # Skip files that DELIBERATELY match U+FFFD as a "detect garbled text" regex
  # (e.g. scripts/health-check.js uses /锟斤拷|�{2,}|/ to flag broken webpages).
  if LC_ALL=C grep -qE 'hasGarbage|锟斤拷|乱码|garbled' "$file" 2>/dev/null; then
    continue
  fi
  # U+FFFD = EF BF BD in UTF-8
  if LC_ALL=C grep -q $'\xEF\xBF\xBD' "$file" 2>/dev/null; then
    COUNT=$(LC_ALL=C grep -o $'\xEF\xBF\xBD' "$file" 2>/dev/null | wc -l | tr -d ' ')
    ISSUES="${ISSUES}  ${file}: ${COUNT}x U+FFFD\n"
    TOTAL=$((TOTAL + COUNT))
    AFFECTED=$((AFFECTED + 1))
  fi
done

echo ""
if [ -n "$ISSUES" ]; then
  printf "%b" "$ISSUES"
  echo "📊 ${AFFECTED} file(s) affected, ${TOTAL} U+FFFD total"
  echo "❌ Encoding corruption found — run 'node scripts/check-encoding.cjs' for full details"
  exit 1
else
  echo "✅ No U+FFFD corruption in ${#FILES[@]} scanned file(s)"
  exit 0
fi
