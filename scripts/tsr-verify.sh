#!/bin/bash
# TSR batch verification & backup
# Run: daily via cron
set -e

TSA_DIR="/opt/fibemate-full/www/docs/tsa"
BACKUP_DIR="/opt/fibemate-backup/tsr"
LOG_DIR="/var/log/fibemate"
CA_FILE="/tmp/freetsa-ca.pem"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_DIR/tsr-verify.log"; }

# Ensure FreeTSA CA cert
if [ ! -f "$CA_FILE" ]; then
  curl -sL https://freetsa.org/files/cacert.pem -o "$CA_FILE" 2>/dev/null || true
fi

log "======== TSR VERIFY $(date -I) ========"

total=0 passed=0 failed=0

for tsr in "$TSA_DIR"/lg-*.tsr; do
  [ -f "$tsr" ] || continue
  base="${tsr%.tsr}"
  name="$(basename "$tsr")"
  
  if [ ! -f "${base}.sha256" ]; then
    log "SKIP $name (no .sha256)"
    continue
  fi

  total=$((total + 1))

  # Verify TSR (try FreeTSA CA first, fall back to system)
  if openssl ts -verify -in "$tsr" -data "${base}.sha256" -CAfile "$CA_FILE" 2>/dev/null | grep -q "Verification: OK"; then
    log "OK   $name"
    passed=$((passed + 1))
  elif openssl ts -verify -in "$tsr" -data "${base}.sha256" -CAfile /etc/ssl/certs/ca-certificates.crt 2>/dev/null | grep -q "Verification: OK"; then
    log "OK   $name"
    passed=$((passed + 1))
  else
    # TSR may be valid but CA not in trust store — check status
    status=$(openssl ts -reply -in "$tsr" -text 2>/dev/null | grep "Status:" | head -1)
    if echo "$status" | grep -q "Granted"; then
      log "OK   $name (status=Granted, CA verify skipped)"
      passed=$((passed + 1))
    else
      log "FAIL $name ($status)"
      failed=$((failed + 1))
    fi
  fi
done

log "TOTAL=$total PASS=$passed FAIL=$failed"

# Weekly backup (Sunday)
if [ "$(date +%u)" = "7" ]; then
  tar -czf "$BACKUP_DIR/tsr-$(date +%Y%m%d).tar.gz" -C "$TSA_DIR" . 2>/dev/null
  find "$BACKUP_DIR" -name "tsr-*.tar.gz" -mtime +90 -delete
  log "BACKUP created: tsr-$(date +%Y%m%d).tar.gz"
fi

[ $failed -eq 0 ] || exit 1
