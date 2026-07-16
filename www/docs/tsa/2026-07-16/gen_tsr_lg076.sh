#!/bin/bash
# lg-076 TSR 生成脚本（服务器端执行）
# 用法: ssh ubuntu@8.156.77.68 'bash -s' < gen_tsr_lg076.sh

set -e

REPO_DIR="/opt/fibemate-repo"
TAG="lg-076-lgv2-defense-modules-20260716"
TSA_DIR="$REPO_DIR/www/docs/tsa/2026-07-16"
SHA256_FILE="$TSA_DIR/$TAG.sha256"
TSQ_FILE="$TSA_DIR/$TAG.tsq"
TSR_FILE="$TSA_DIR/$TAG.tsr"

echo "=== Generating TSR for $TAG ==="

# 1. Generate TSQ
openssl ts -query -data "$SHA256_FILE" -cert -sha256 -out "$TSQ_FILE"
echo "TSQ: $(stat -c%s $TSQ_FILE) bytes"

# 2. Submit to DigiCert
curl -s -H "Content-Type: application/timestamp-query" \
  --data-binary "@$TSQ_FILE" \
  https://timestamp.digicert.com \
  -o "$TSR_FILE"
echo "TSR: $(stat -c%s $TSR_FILE) bytes"

# 3. Verify
openssl ts -verify -data "$SHA256_FILE" -in "$TSR_FILE" \
  -CAfile "$REPO_DIR/digicert-certs/digicert_tsa_chain.pem" && \
  echo "VERIFICATION OK" || echo "VERIFICATION FAILED"

# 4. Print timestamp
openssl ts -reply -in "$TSR_FILE" -text | grep -E "Time stamp|Serial number|Policy"

echo "=== Done ==="
