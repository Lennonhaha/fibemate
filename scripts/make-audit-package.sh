#!/bin/bash
# scripts/make-audit-package.sh — Generate fibemate-audit-v3.3-preview-lg095.tar.gz
# SPDX-License-Identifier: GPL-3.0-only
#
# Produces a self-contained audit package with:
#   - Source snapshot (HEAD)
#   - All TSR evidence (lg-001 ~ lg-095)
#   - Test reports + QA docs + risk rectification
#   - Governance & compliance docs
#   - Cross-validation records
#   - inventory.sha256 manifest
#
# Usage: bash scripts/make-audit-package.sh [output_dir]

set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUTDIR="${1:-$REPO/dist}"
ARCHIVE="fibemate-audit-v3.3-preview-lg095.tar.gz"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
COMMIT="$(git -C "$REPO" rev-parse --short HEAD)"

echo "=== FIBEMATE Audit Package Builder ==="
echo "  Commit: $COMMIT"
echo "  Output: $OUTDIR/$ARCHIVE"

WORK="$(mktemp -d)"
trap "rm -rf $WORK" EXIT
PKG="$WORK/fibemate-audit-v3.3-preview"
mkdir -p "$PKG"

# ─── 1. Source snapshot ──────────────────────────────────────
echo "[1/9] Source snapshot..."
mkdir -p "$PKG/source"
# Critical source files
for f in \
    packages/pqc-kem/src/ml-kem-768.js \
    packages/pqc-kem/src/hybrid.js \
    packages/pqc-kem/index.js \
    packages/pqc-kem/package.json \
    scripts/kat500.js \
    scripts/prep-release.js \
    scripts/build-wasm-release.py \
    scripts/build-demo.js \
    Dockerfile.bench \
    index.js; do
    [ -f "$REPO/$f" ] && cp --parents "$f" "$PKG/source/"
done
# Bundled with tree structure
cp --parents packages/pqc-kem/src/ml-kem-768.js "$PKG/"

# ─── 2. All TSR evidence ─────────────────────────────────────
echo "[2/9] TSR evidence..."
mkdir -p "$PKG/evidence/tsr"
cp -r "$REPO/docs/tsa" "$PKG/evidence/tsa/" 2>/dev/null || true
if [ -d "$REPO/evidence/tsr" ]; then
    cp -r "$REPO/evidence/tsr/"* "$PKG/evidence/tsr/" 2>/dev/null || true
fi
cp "$REPO/docs/TSR-MANIFEST.md" "$PKG/evidence/" 2>/dev/null || true
cp "$REPO/docs/timestamp-manifest.json" "$PKG/evidence/" 2>/dev/null || true

# ─── 3. QA & test documentation (NEW) ────────────────────────
echo "[3/9] QA documentation..."
mkdir -p "$PKG/docs"
for f in \
    docs/testing.md \
    docs/quality-assurance.md \
    docs/security-limitations.md \
    docs/risk-rectification.md \
    docs/pqc-readiness.md \
    docs/audit-package-2026-07-22.md \
    docs/v3.3-audit-gap-analysis-2026-07-22.md \
    docs/api-stability.md \
    docs/platform-matrix.md \
    docs/VULNERABILITIES.md \
    docs/API.md \
    docs/architecture.md \
    docs/deployment.md; do
    [ -f "$REPO/$f" ] && cp "$REPO/$f" "$PKG/$f"
done

# ─── 4. Pre-commit & smoke test config ───────────────────────
echo "[4/9] Pre-commit & smoke test..."
mkdir -p "$PKG/test"
[ -f "$REPO/.pre-commit-config.yaml" ] && cp "$REPO/.pre-commit-config.yaml" "$PKG/"
[ -f "$REPO/test/smoke-crypto.js" ] && cp "$REPO/test/smoke-crypto.js" "$PKG/test/"

# ─── 5. Governance ───────────────────────────────────────────
echo "[5/9] Governance..."
for f in \
    GOVERNANCE.md \
    CODE_OF_CONDUCT.md \
    RELEASE.md \
    README.md \
    README.en.md \
    LICENSE \
    CITATION.cff \
    FUNDING.yml; do
    [ -f "$REPO/$f" ] && cp "$REPO/$f" "$PKG/$f"
done

# ─── 6. Cross-validation records ─────────────────────────────
echo "[6/9] Cross-validation records..."
mkdir -p "$PKG/evidence/cross-validation"

# Extract noble/liboqs notes from MEMORY.md
if [ -f "$REPO/MEMORY.md" ]; then
    grep -A5 "noble.*cross\|liboqs.*cross\|交叉验证\|cross-valid" "$REPO/MEMORY.md" | head -80 > "$PKG/evidence/cross-validation/from-memory.md" || true
fi

# KAT evidence
if [ -f "$REPO/www/kat_10000_result.json" ]; then
    cp "$REPO/www/kat_10000_result.json" "$PKG/evidence/cross-validation/"
fi

# ─── 7. CI + build config ────────────────────────────────────
echo "[7/9] CI & build..."
mkdir -p "$PKG/config"
for f in package.json package-lock.json .gitignore; do
    [ -f "$REPO/$f" ] && cp "$REPO/$f" "$PKG/$f"
done
# CI files
for f in ci.yml nightly.yml; do
    src="$REPO/.github/workflows/$f"
    if [ -f "$src" ]; then
        mkdir -p "$PKG/.github/workflows"
        cp "$src" "$PKG/.github/workflows/$f"
    fi
done

# ─── 8. Demo verification ────────────────────────────────────
echo "[8/9] Demo verification..."
mkdir -p "$PKG/evidence/demo"
cp "$REPO/docs/tsa/2026-07-22/lg-095-demo-verify.md" "$PKG/evidence/demo/" 2>/dev/null || true
cp "$REPO/www/demo/index.html" "$PKG/evidence/demo/" 2>/dev/null || true
cp "$REPO/www/demo/ml-kem-768.js" "$PKG/evidence/demo/" 2>/dev/null || true

# ─── 9. Inventory ────────────────────────────────────────────
echo "[9/9] Generating inventory.sha256..."
mkdir -p "$OUTDIR"
cd "$WORK"
find fibemate-audit-v3.3-preview -type f | sort | while read -r f; do
    sha256sum "$f" 2>/dev/null || true
done > "$PKG/inventory.sha256"

echo "# Generated: $TIMESTAMP" >> "$PKG/inventory.sha256"
echo "# Repository: https://github.com/Lennonhaha/fibemate" >> "$PKG/inventory.sha256"
echo "# Commit: $COMMIT" >> "$PKG/inventory.sha256"

# Package
tar -czf "$OUTDIR/$ARCHIVE" fibemate-audit-v3.3-preview
PACKAGE_SIZE="$(wc -c < "$OUTDIR/$ARCHIVE")"

echo ""
echo "=== Done ==="
echo "  Package:  $OUTDIR/$ARCHIVE"
echo "  Size:     $PACKAGE_SIZE bytes"
echo "  Files:    $(tar -tzf "$OUTDIR/$ARCHIVE" | wc -l)"
echo "  Inventory: embedded as inventory.sha256"
ls -lh "$OUTDIR/$ARCHIVE"
