#!/bin/bash
# Audit 5 — parts 1-5 (parse + require + crypto + html + docs)
set -e
cd /opt/fibemate-repo

echo "=== 1. JS PARSE CHECK ==="
for f in \
  src/index.js \
  src/pqc-hybrid-server.js \
  src/tls-hybrid-extension.js \
  packages/pqc-kem/src/ml-kem-768.js \
  reg-server/index.js \
  reg-server/hybrid-kem-client.js \
  test/smoke-crypto.js \
  scripts/prep-release.js \
  scripts/kat-10000.js \
  scripts/bench-proper.js \
  scripts/profile-mlkem.js \
  www/crypto/constant-time.js \
  www/crypto/security-levels.js; do
  printf "  %-55s " "$f"
  node --check "$f" 2>&1 && echo "PASS" || echo "FAIL"
done
echo ""

echo "=== 2. REQUIRE PATH CHECK ==="
for f in src/index.js src/pqc-hybrid-server.js reg-server/index.js reg-server/hybrid-kem-client.js; do
    [ ! -f "$f" ] && continue
    dir=$(dirname "$f")
    echo "  $f:"
    node -e "
        const fs=require('fs');
        const path=require('path');
        const txt=fs.readFileSync('$f','utf8');
        const re=/require\(['\"]([^'\"]+)['\"]\)/g;
        let m;
        while((m=re.exec(txt))!==null){
            const p=m[1];
            if(p.startsWith('.')){
                const resolved=path.resolve('$dir',p);
                const ok=fs.existsSync(resolved)||fs.existsSync(resolved+'.js');
                console.log(ok?'    PASS '+p:'    BROKEN '+p);
            }
        }
    " 2>/dev/null
done
echo ""

echo "=== 3. CRYPTO COPY DIVERGENCE ==="
echo "  www/crypto/crypto/ (7 files):"
ls -1 www/crypto/crypto/ 2>/dev/null

# Compare duplicates between www/crypto/ and www/crypto/crypto/
for fn in $(ls www/crypto/ 2>/dev/null); do
    if [ -f "www/crypto/$fn" ] && [ -f "www/crypto/crypto/$fn" ]; then
        m1=$(md5sum "www/crypto/$fn" | awk '{print $1}')
        m2=$(md5sum "www/crypto/crypto/$fn" | awk '{print $1}')
        if [ "$m1" = "$m2" ]; then
            echo "  DUP $fn: identical (safe to delete one)"
        else
            l1=$(wc -l < "www/crypto/$fn")
            l2=$(wc -l < "www/crypto/crypto/$fn")
            echo "  DUP $fn: DIFF! ${l1}L vs ${l2}L"
        fi
    fi
done
echo ""

echo "=== 4. www/index.html SCRIPT REFS ==="
echo "  Current live ml-kem references:"
grep -n 'ml-kem\|require\|src=' www/index.html 2>/dev/null | grep -v 'http://\|https://\|#\|<!--' || echo "  (none found — dynamic load?)"
echo ""

echo "=== 5. DOC INTERNAL LINKS ==="
for doc in docs/testing.md docs/security-limitations.md docs/quality-assurance.md \
           docs/risk-rectification.md docs/api-stability.md README.md; do
    [ ! -f "$doc" ] && continue
    links=$(grep -oP '\]\(\./([^)]*\.md)\)' "$doc" | grep -oP '(?<=\(\./)[^)]+' || true)
    broken=0
    for link in $links; do
        [ -f "docs/$link" ] || { echo "  BROKEN $doc -> $link"; broken=$((broken+1)); }
    done
    [ "$broken" -eq 0 ] && echo "  OK $doc"
done
echo ""

echo "=== DONE ==="
