#!/bin/bash
cd /opt/fibemate-repo

echo "=== HEAD ==="
git log --oneline -1
echo ""

echo "=== KEY FILES ==="
for f in \
    .pre-commit-config.yaml \
    test/smoke-crypto.js \
    docs/testing.md \
    docs/security-limitations.md \
    docs/quality-assurance.md \
    docs/risk-rectification.md \
    docs/api-stability.md \
    docs/launch-announcement-2026-08-31.md \
    docs/platform-matrix.md \
    docs/audit-package-2026-07-22.md \
    Dockerfile.bench \
    scripts/prep-release.js \
    scripts/build-wasm-release.py \
    scripts/make-audit-package.sh \
    scripts/update-readme.py \
    fuzz/fuzz_encapsulate.cjs \
    fuzz/README.md \
    SECURITY-VULNERABILITIES.md; do
    if [ -f "$f" ]; then echo "  ✅ $f"; else echo "  ❌ MISSING $f"; fi
done

echo ""
echo "=== PUBLIC/ DIR ==="
[ -d public ] && echo "  ❌ STILL EXISTS" || echo "  ✅ REMOVED"

echo ""
echo "=== BRANCH COUNT ==="
count=$(git branch | wc -l)
echo "  $count (should be 1)"

echo ""
echo "=== REMOTE BRANCHES ==="
git branch -r | while read rb; do
    name=$(echo "$rb" | xargs)
    case "$name" in
        "origin/main") echo "  ✅ $name" ;;
        "origin/HEAD"*) ;;
        *) echo "  ❌ STALE: $name" ;;
    esac
done

echo ""
echo "=== KAT ==="
node -e '
const c=require("./packages/pqc-kem/src/ml-kem-768");
let ok=0;
for(let i=0;i<200;i++){
  const k=c.generateKeypair();
  const e=c.encapsulate(k.publicKey);
  const d=c.decapsulate(k.secretKey,e.ciphertext);
  if(Buffer.compare(d,e.sharedSecret)===0) ok++;
}
console.log("  "+ok+"/200 "+(ok===200?"PASS":"FAIL"));
'

echo ""
echo "=== TSR COUNT ==="
tsr_count=$(git ls-files www/docs/tsa/ | grep '\.tsr$' | wc -l)
echo "  $tsr_count TSR files"

echo ""
echo "=== DONE ==="
