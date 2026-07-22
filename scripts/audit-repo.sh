#!/bin/bash
# scripts/audit-repo.sh — full GitHub repo audit
set -e

echo "=== AUDIT: fibemate GitHub repo ==="
echo ""

# 1. Total file count
echo "--- FILE COUNT ---"
git ls-files | wc -l

# 2. Duplicate basenames (same filename, different paths)
echo ""
echo "--- DUPLICATE BASENAMES ---"
git ls-files | xargs -I{} basename {} | sort | uniq -d | wc -l
echo "Listing top duplicates (>1 path):"
git ls-files | xargs -I{} basename {} | sort | uniq -d | while read fn; do
    count=$(git ls-files | grep -c "/${fn}$" || true)
    if [ "$count" -gt 1 ]; then
        echo "  $fn ($count copies):"
        git ls-files | grep "/${fn}$" | sed 's/^/    /'
    fi
done

# 3. Suspicious patterns
echo ""
echo "--- SUSPICIOUS FILES ---"
echo "*.bak files:"
git ls-files | grep '\.bak' || echo "  NONE"
echo "*.tmp files:"
git ls-files | grep '\.tmp' || echo "  NONE"
echo "*.pyc files:"
git ls-files | grep '\.pyc' || echo "  NONE"
echo "node_modules in git:"
git ls-files | grep 'node_modules/' || echo "  NONE"
echo "*.gz in git:"
git ls-files | grep '\.gz$' || echo "  NONE"
echo "*.tar.gz in git:"
git ls-files | grep '\.tar\.gz$' || echo "  NONE"
echo "*.zip in git:"
git ls-files | grep '\.zip$' || echo "  NONE"
echo "Semaphore files (.gitkeep):"
git ls-files | grep '\.gitkeep' || echo "  NONE"
echo "test output files (*.json in tests/):"
git ls-files | grep 'tests/.*\.json$' || echo "  NONE (if in .gitignore, good)"

# 4. Stale references — check for broken symlinks
echo ""
echo "--- BROKEN SYMLINKS ---"
git ls-files -s | grep '^120000' | awk '{print $4}' | while read link; do
    if [ -e "$link" ]; then
        : # OK
    else
        echo "  BROKEN: $link"
    fi
done
echo "  (checked)"

# 5. Files with duplicate content (exact match, different path)
echo ""
echo "--- FILES WITH DUPLICATE CONTENT ---"
git ls-files | while read f; do
    if [ -f "$f" ]; then
        md5sum "$f"
    fi
done | sort | uniq -w32 -d | awk '{print $2}' | while read f; do
    md5=$(md5sum "$f" | cut -d' ' -f1)
    echo "  MD5=$md5:"
    git ls-files | while read g; do
        [ -f "$g" ] && [ "$f" != "$g" ] && md5sum "$g" | grep -q "^$md5 " && echo "    $g"
    done
done
echo "  (checked)"

# 6. Large files (>1MB)
echo ""
echo "--- LARGE FILES (>1MB) ---"
git ls-files | while read f; do
    [ -f "$f" ] && [ $(stat -c%s "$f" 2>/dev/null || echo 0) -gt 1048576 ] && echo "  $f ($(du -h "$f" | cut -f1))"
done
echo "  (checked)"

# 7. Core crypto integrity
echo ""
echo "--- CORE CRYPTO FILES ---"
for f in packages/pqc-kem/src/ml-kem-768.js packages/pqc-kem/index.js scripts/verify-tsr.sh; do
    [ -f "$f" ] && echo "  OK: $f ($(wc -l < "$f") lines)" || echo "  MISSING: $f"
done

# 8. npm audit check
echo ""
echo "--- npm AUDIT ---"
cd packages/pqc-kem && npm audit --json 2>/dev/null | node -e "
try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('  vulnerabilities:',d.metadata?.vulnerabilities||{});
const exitCode=(d.metadata?.vulnerabilities?.critical||0)>0?1:0;
if(exitCode) console.log('  CRITICAL found!');
else console.log('  Clean');
}catch(e){console.log('  Skipped (no audit data):',e.message)}" || echo "  npm audit failed"
cd "$OLDPWD"

echo ""
echo "=== AUDIT COMPLETE ==="
