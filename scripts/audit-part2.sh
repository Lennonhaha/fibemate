#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# Audit part 2: security deep-dive

echo "=== AUDIT PART 2 ==="

# 1. Check live server nginx root and which ml-kem-768 is served
echo "--- LIVE NGINX ROOT ---"
grep -r "root\|alias" /etc/nginx/sites-enabled/ 2>/dev/null | grep -v "^#" | head -10
echo ""

# 2. Which ml-kem-768.js does the live site touch?
echo "--- LIVE SITE FILES ---"
webroot=$(grep -oP 'root\s+\K\S+' /etc/nginx/sites-enabled/* 2>/dev/null | head -1)
if [ -n "$webroot" ]; then
    echo "Webroot: $webroot"
    # Check if it's a symlink or direct path
    if [ -d "$webroot" ]; then
        echo "  $(ls -la $webroot/ml-kem-768.js 2>/dev/null || echo 'NOT directly accessible')"
        echo "  $(ls -la $webroot/crypto/ml-kem-768.js 2>/dev/null || echo '')"
    fi
fi
echo ""

# 3. Check public/ vs www/ — are they synced?
echo "--- PUBLIC/ vs WWW/ ---"
if [ -d public ] && [ -d www ]; then
    pub_count=$(find public -type f | wc -l)
    www_count=$(find www -type f | wc -l)
    echo "public/: $pub_count files"
    echo "www/:    $www_count files"
    # Check if public is a symlink to www
    if [ -L public ]; then
        echo "  public/ is a symlink -> $(readlink public)"
    else
        echo "  public/ is a real directory (duplicates www/)"
    fi
fi
echo ""

# 4. What nginx actually serves
echo "--- NGINX CONFIG ---"
grep -A5 "location.*/" /etc/nginx/sites-enabled/* 2>/dev/null | head -30
echo ""

# 5. Check if any old copy has known-vulnerable crypto
echo "--- VULNERABILITY SCAN: OLD CRYPTO COPIES ---"
for f in www/crypto/crypto/ml-kem-768.js www/crypto/ml-kem-768.js public/crypto/crypto/ml-kem-768.js; do
    echo "  $f:"
    # Check for time-domain (pre-FIPS), missing NTT, etc
    if grep -q "time-domain\|pure JavaScript Implementation\|all in time" "$f" 2>/dev/null; then
        echo "    ⚠️ TIME-DOMAIN variant (pre-NTT, slower, not FIPS-aligned)"
    fi
    if grep -q "DFT\|标准DFT" "$f" 2>/dev/null; then
        echo "    ⚠️ DFT-NTT variant (non-standard NTT, Chinese comments)"
    fi
    # Check for broken modMul
    if grep -q "Cannot mix BigInt" "$f" 2>/dev/null; then
        echo "    ❌ BROKEN (BigInt mismatch)"
    fi
    # Check actual correctness markers
    if grep -q "KAT 10000/10000\|cross-validated.*noble" "$f" 2>/dev/null; then
        echo "    ✅ Verified copy"
    else
        echo "    ⚠️ No verification marker found"
    fi
    echo ""
done

# 6. Check timestamps — any TSR with empty content?
echo "--- TSR SPOOF CHECK ---"
# Those 3 with same MD5 (00a1d61b...) — are they empty/corrupt?
echo "Same-MD5 TSRs (00a1d61b...):"
for f in docs/tsa/THREAT_MODEL_md.tsr docs/tsa/security-block_html.tsr docs/tsa/security_html.tsr; do
    if [ -f "$f" ]; then
        size=$(stat -c%s "$f")
        echo "  $size bytes  $f"
        # Check if valid TSR (should start with ASN.1 SEQUENCE 0x30)
        first_byte=$(xxd -l1 -p "$f")
        if [ "$first_byte" != "30" ]; then
            echo "    ❌ NOT a valid TSR (first byte=$first_byte, expected 30)"
        fi
    fi
done
echo ""

# 7. Check for any secrets in tracked files
echo "--- SECRETS SCAN ---"
# API keys, tokens, passwords in tracked files (exclude .git/)
for pat in 'ghp_[a-zA-Z0-9]{36}' 'gho_[a-zA-Z0-9]{36}' 'github_pat_' 'Bearer [a-zA-Z0-9_-]{20,}' 'password\s*=\s*["'"'"'][^"'"'"']{4,}'; do
    hits=$(git grep -n -P "$pat" 2>/dev/null | grep -v '.git/' | head -5)
    if [ -n "$hits" ]; then
        echo "  ⚠️ Pattern match: $pat"
        echo "$hits" | sed 's/^/    /'
    fi
done
# Also check for PAT in git history
if git log --all -p | grep -q 'ghp_\|gho_'; then
    echo "  ❌ CRITICAL: PAT found in git history! Must rotate immediately."
else
    echo "  ✅ No PAT in git history"
fi
echo ""

# 8. Check if .gitignore is properly excluding junk
echo "--- .GITIGNORE CHECK ---"
git ls-files | grep -E '\.(pyc|o|so|dll|exe|class)$' | head -5 || echo "  Clean (no binary artifacts)"
# Check TSA .tmp file
echo "  TSA .tmp:"
git ls-files | grep '\.tmp$'

echo ""
echo "=== AUDIT PART 2 COMPLETE ==="
