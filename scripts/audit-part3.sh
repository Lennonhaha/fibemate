#!/bin/bash
# Audit part 3: live server + demo copy deep dive

echo "=== AUDIT PART 3 ==="

# 1. Check what's LIVE on the server
echo "--- LIVE SERVER FILES (/opt/fibemate-full/www) ---"
for f in /opt/fibemate-full/www/crypto/ml-kem-768.js /opt/fibemate-full/www/crypto/crypto/ml-kem-768.js /opt/fibemate-full/www/demo/ml-kem-768.js; do
    if [ -f "$f" ]; then
        lines=$(wc -l < "$f")
        md5=$(md5sum "$f" | awk '{print $1}')
        echo "  $lines L  $md5  $f"
    else
        echo "  MISSING  $f"
    fi
done
echo ""

# 2. Compare live vs git copies
echo "--- LIVE vs GIT ml-kem-768 ---"
primary="packages/pqc-kem/src/ml-kem-768.js"
primary_md5=$(md5sum "$primary" | awk '{print $1}')
for live in /opt/fibemate-full/www/crypto/ml-kem-768.js /opt/fibemate-full/www/crypto/crypto/ml-kem-768.js /opt/fibemate-full/www/demo/ml-kem-768.js; do
    if [ -f "$live" ]; then
        live_md5=$(md5sum "$live" | awk '{print $1}')
        if [ "$live_md5" = "$primary_md5" ]; then
            echo "  MATCH:  $live"
        else
            echo "  STALE:  $live (live=$(wc -l < $live)L, git=$(wc -l < $primary)L)"
        fi
    fi
done
echo ""

# 3. Demo copy: structural diff (polyfill wrapper aside, same crypto?)
echo "--- DEMO COPY: CRYPTO BODY CHECK ---"
# The demo wraps in IIFE + Buffer polyfill. Check if the core functions match.
# Compare the actual crypto functions (everything after Buffer polyfill)
echo "Demo has Buffer.from?    $(grep -c 'Buffer.from' www/demo/ml-kem-768.js)"
echo "Primary has Buffer.from? $(grep -c 'Buffer.from' packages/pqc-kem/src/ml-kem-768.js)"
echo "Demo has modMulBarrett?  $(grep -c 'modMulBarrett' www/demo/ml-kem-768.js)"
echo "Primary has modMulBarrett? $(grep -c 'modMulBarrett' packages/pqc-kem/src/ml-kem-768.js)"
echo "Demo has sampleNTT?      $(grep -c 'sampleNTT' www/demo/ml-kem-768.js)"
echo "Primary has sampleNTT?   $(grep -c 'sampleNTT' packages/pqc-kem/src/ml-kem-768.js)"
# Check ZETAS table (must be identical)
zeta_demo=$(grep -c 'ZETAS' www/demo/ml-kem-768.js)
zeta_main=$(grep -c 'ZETAS' packages/pqc-kem/src/ml-kem-768.js)
echo "Demo ZETAS refs: $zeta_demo, Primary: $zeta_main"
echo ""

# 4. Check if any HTML file imports from stale copies
echo "--- HTML IMPORT AUDIT ---"
for html in www/index.html www/demo/index.html www/test_mlkem.html www/kat-purejs-10000.html www/kat_quick.html; do
    if [ -f "$html" ]; then
        imports=$(grep -oP 'src="[^"]*ml-kem[^"]*"' "$html" 2>/dev/null || echo "  (no direct script src import)")
        echo "  $html:"
        echo "    $imports"
    fi
done
echo ""

# 5. Check for require() paths in Node.js files
echo "--- NODE.JS REQUIRE AUDIT ---"
grep -rn "require.*ml-kem" --include="*.js" --include="*.mjs" src/ scripts/ packages/ 2>/dev/null | grep -v node_modules | head -20
echo ""

# 6. public/ directory history
echo "--- PUBLIC/ DIRECTORY HISTORY ---"
git log --oneline --diff-filter=A -- public/ 2>/dev/null | head -5
echo "Last commit touching public/ crypto:"
git log --oneline -3 -- public/crypto/ 2>/dev/null
echo ""

# 7. Check for stale .bak/.tmp in tracked files
echo "--- STALE FILES IN GIT ---"
echo ".bak files:"
git ls-files | grep '\.bak' || echo "  NONE"
echo ".tmp files:"
git ls-files | grep '\.tmp' || echo "  NONE"
echo ".pyc files:"
git ls-files | grep '\.pyc' || echo "  NONE"

# 8. .gitignore effectiveness — any node_modules snuck in?
echo ""
echo "--- NODE_MODULES LEAK CHECK ---"
if git ls-files | grep -q 'node_modules/'; then
    echo "  ❌ node_modules FILES IN GIT:"
    git ls-files | grep 'node_modules/' | head -10
else
    echo "  ✅ No node_modules in git"
fi

echo ""
echo "=== AUDIT PART 3 COMPLETE ==="
