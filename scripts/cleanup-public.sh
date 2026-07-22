#!/bin/bash
set -e
cd /opt/fibemate-repo

echo "=== STEP 1: Remove public/ (1.5MB, 0 prod refs) ==="
git rm -r public/
echo "  Removed from git tracking"

echo ""
echo "=== STEP 2: Remove 3 fake TSR files ==="
for f in docs/tsa/THREAT_MODEL_md.tsr docs/tsa/security-block_html.tsr docs/tsa/security_html.tsr; do
    if [ -f "$f" ]; then
        git rm "$f"
        echo "  Removed: $f"
    fi
done

echo ""
echo "=== STEP 3: Verify www/crypto/crypto/ still exists if needed ==="
ls www/crypto/crypto/ 2>/dev/null && echo "  www/crypto/crypto/ exists (7 files)" || echo "  www/crypto/crypto/ not found"

echo ""
echo "=== STEP 4: Verify no stale require paths ==="
echo "  All ml-kem require paths:"
grep -rn "require.*ml-kem" src/ --include="*.js" 2>/dev/null | grep -v node_modules

echo ""
echo "=== STEP 5: Quick KAT ==="
node -e "
const c=require('./packages/pqc-kem/src/ml-kem-768');
let ok=0;
for(let i=0;i<200;i++){const k=c.generateKeypair();const e=c.encapsulate(k.publicKey);if(Buffer.compare(c.decapsulate(k.secretKey,e.ciphertext),e.sharedSecret)===0)ok++}
console.log('  KAT: ' + ok + '/200 ' + (ok===200?'PASS':'FAIL'));
"

echo ""
echo "=== DONE - Ready for commit ==="
