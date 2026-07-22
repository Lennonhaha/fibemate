#!/bin/bash
# Audit Part 5: Code integrity + doc completeness
set -e
cd /opt/fibemate-repo
ISSUES=0

echo "═══════════════════════════════════════"
echo "  AUDIT PART 5 — INTEGRITY & COMPLETENESS"
echo "═══════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════
# 1. Can all JS files parse?
# ═══════════════════════════════════════════
echo "=== 1. JS PARSE CHECK ==="
for f in src/index.js src/pqc-hybrid-server.js src/tls-hybrid-extension.js \
         packages/pqc-kem/src/ml-kem-768.js \
         www/demo/ml-kem-768.js www/crypto/ml-kem-768.js \
         scripts/prep-release.js scripts/kat-10000.js scripts/kat-quick.js \
         test/smoke-crypto.js reg-server/index.js reg-server/hybrid-kem-client.js \
         scripts/bench-proper.js scripts/profile-mlkem.js; do
    if [ -f "$f" ]; then
        out=$(node --check "$f" 2>&1)
        if [ $? -eq 0 ]; then
            echo "  ✅ $f"
        else
            echo "  ❌ PARSE FAIL $f: $out"
            ISSUES=$((ISSUES+1))
        fi
    fi
done
echo ""

# ═══════════════════════════════════════════
# 2. Check for broken require() paths
# ═══════════════════════════════════════════
echo "=== 2. REQUIRE PATH CHECK ==="
for f in src/index.js src/pqc-hybrid-server.js src/tls-hybrid-extension.js \
         reg-server/index.js reg-server/hybrid-kem-client.js; do
    [ ! -f "$f" ] && continue
    requires=$(node -e "
        const fs=require('fs');
        const txt=fs.readFileSync('$f','utf8');
        const re=/require\(['\"]([^'\"]+)['\"]\)/g;
        let m, total=0, missing=0;
        while((m=re.exec(txt))!==null){
            total++;
            const p=m[1];
            if(p.startsWith('.')){
                const dir=require('path').dirname('$f');
                const resolved=require('path').resolve(dir,p);
                if(!fs.existsSync(resolved) && !fs.existsSync(resolved+'.js')){
                    console.log('  ❌ BROKEN:',p,'in','$f');
                    missing++;
                }
            }
        }
        console.log('  ✅ $f: '+total+' requires, '+missing+' broken');
    " 2>/dev/null)
    echo "$requires"
done
echo ""

# ═══════════════════════════════════════════
# 3. Remaining crypto copies that differ
# ═══════════════════════════════════════════
echo "=== 3. REMAINING CRYPTO DIVERGENCE ==="
# ml-kem-768-wrapper.js
echo "  ml-kem-768-wrapper.js:"
md5_1=$(md5sum www/crypto/crypto/ml-kem-768-wrapper.js 2>/dev/null | awk '{print $1}')
md5_2=$(md5sum public/crypto/crypto/ml-kem-768-wrapper.js 2>/dev/null | awk '{print $1}')
if [ -n "$md5_1" ] && [ -n "$md5_2" ] && [ "$md5_1" != "$md5_2" ]; then
    echo "    ❌ DIVERGE: www vs (deleted) public"
elif [ -n "$md5_1" ]; then
    echo "    ✅ single copy (www only)"
else
    echo "    ⚠️  not found"
fi

# pq-integration.js
echo "  pq-integration.js:"
m1=$(md5sum www/crypto/crypto/pq-integration.js 2>/dev/null | awk '{print $1}')
m2=$(md5sum www/crypto/pq-integration.js 2>/dev/null | awk '{print $1}')
if [ -n "$m1" ] && [ -n "$m2" ]; then
    if [ "$m1" = "$m2" ]; then echo "    ✅ identical"
    else echo "    ❌ DIVERGE: www/crypto/ vs www/crypto/crypto/"; fi
elif [ -n "$m1" ]; then echo "    ⚠️  only crypto/crypto/"
elif [ -n "$m2" ]; then echo "    ⚠️  only crypto/"
fi

# constant-time.js
echo "  constant-time.js:"
m1=$(md5sum www/crypto/crypto/constant-time.js 2>/dev/null | awk '{print $1}')
m2=$(md5sum www/crypto/constant-time.js 2>/dev/null | awk '{print $1}')
m3=$(md5sum src/lib/constant-time.js 2>/dev/null | awk '{print $1}')
if [ -n "$m1" ] && [ -n "$m2" ]; then
    if [ "$m1" = "$m2" ]; then echo "    ✅ www/crypto == www/crypto/crypto"
    else echo "    ❌ DIFFERENT: www/crypto vs www/crypto/crypto"; fi
fi
if [ -n "$m3" ]; then
    if [ "$m1" = "$m3" ]; then echo "    ✅ src/lib matches"
    else echo "    ⚠️  src/lib differs (expected if specialized)"; fi
fi
echo ""

# ═══════════════════════════════════════════
# 4. Check stale JS references in www/index.html
# ═══════════════════════════════════════════
echo "=== 4. www/index.html SCRIPT REFS ==="
grep -n 'src=' www/index.html | grep -v 'http://\|https://\|cdn\|google\|#\|<!--' | head -20
echo ""

# ═══════════════════════════════════════════
# 5. Check docs for broken internal links
# ═══════════════════════════════════════════
echo "=== 5. DOC INTERNAL LINKS ==="
for doc in docs/testing.md docs/security-limitations.md docs/quality-assurance.md \
           docs/risk-rectification.md docs/api-stability.md README.md; do
    [ ! -f "$doc" ] && continue
    links=$(grep -oP '\]\(\./([^)]+\.md)\)' "$doc" | grep -oP '(?<=\(\./)[^)]+' || true)
    broken=0
    for link in $links; do
        target="docs/$link"
        [ ! -f "$target" ] && { echo "  ❌ BROKEN: $doc → $link"; broken=$((broken+1)); }
    done
    [ $broken -eq 0 ] && echo "  ✅ $doc"
done
echo ""

# ═══════════════════════════════════════════
# 6. Verify all scripts have shebang or node directive
# ═══════════════════════════════════════════
echo "=== 6. SCRIPT ENTRY POINTS ==="
for f in scripts/*.js scripts/*.py scripts/*.sh; do
    [ ! -f "$f" ] && continue
    ext="${f##*.}"
    head=$(head -1 "$f")
    case "$ext" in
        sh)
            if echo "$head" | grep -q '^#!/'; then echo "  ✅ $f";
            else echo "  ⚠️  $f (no shebang)"; fi ;;
        js)
            if echo "$head" | grep -q "'use strict'\|//\|/*"; then echo "  ✅ $f";
            else echo "  ⚠️  $f (unusual header)"; fi ;;
        py)
            if echo "$head" | grep -q '^#!/\|^#\|^"""'; then echo "  ✅ $f";
            else echo "  ⚠️  $f (unusual header)"; fi ;;
    esac
done
echo ""

# ═══════════════════════════════════════════
# 7. Check for files gitignored but should be tracked
# ═══════════════════════════════════════════
echo "=== 7. TSA DIRECTORIES — WHAT'S MISSING ==="
git ls-files www/docs/tsa/ | sed 's|/[^/]*$||' | sort -u
echo ""
echo "  Check 2026-07-21:"
if [ -d www/docs/tsa/2026-07-21 ]; then
    ls www/docs/tsa/2026-07-21/
else
    echo "    Directory missing"
fi
echo ""

# ═══════════════════════════════════════════
# 8. LIVE SERVER — check actual deployed files match repo
# ═══════════════════════════════════════════
echo "=== 8. LIVE vs REPO DIFF ==="
LIVE="/opt/fibemate-full/www"
for f in crypto/ml-kem-768.js demo/ml-kem-768.js demo/index.html; do
    repo_hash=$(md5sum "www/$f" | awk '{print $1}')
    live_hash=$(md5sum "$LIVE/$f" 2>/dev/null | awk '{print $1}')
    if [ -z "$live_hash" ]; then
        echo "  ❌ MISSING live: $f"
    elif [ "$repo_hash" = "$live_hash" ]; then
        echo "  ✅ $f — identical"
    else
        echo "  ❌ DIFFER: $f"
        diff <(wc -l < "www/$f") <(wc -l < "$LIVE/$f" 2>/dev/null || echo 0) | head -1
    fi
done
echo ""

# ═══════════════════════════════════════════
# 9. Actually run the smoke test
# ═══════════════════════════════════════════
echo "=== 9. SMOKE TEST ==="
node test/smoke-crypto.js 2>&1 | head -20
echo ""

# ═══════════════════════════════════════════
# 10. Final summary
# ═══════════════════════════════════════════
echo "═══════════════════════════════════════"
echo "  TOTAL ISSUES: $ISSUES"
echo "═══════════════════════════════════════"
