#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# TSR batch verification & backup -- run daily via cron.
#
# The classification itself lives in tsr-verify.cjs: every .tsr under the tree, what
# openssl can determine about it, and whether that matches the recorded allowlist.
# This wrapper keeps the cron-facing bits (logging, weekly backup) and passes the
# exit code through, so a drift cannot be swallowed.
#
# History worth keeping: this loop used to glob `lg-*.tsr` in one directory and report
# "TOTAL=2 PASS=2 FAIL=0" while 239 nested tokens were never opened. The 2 that "passed"
# passed on Status: Granted, which only says the TSA replied. See
# docs/engineering-notes.md for the full account.
set -eo pipefail
# pipefail matters: without it `node ... | tee` returns tee's status, so a drift (exit 1)
# would be logged as OK. The wrapper's whole job is passing the code through.

TSA_DIR="${TSA_DIR:-/opt/fibemate/current/www/docs/tsa}"
BACKUP_DIR="/opt/fibemate-backup/tsr"
LOG_DIR="/var/log/fibemate"
CA_FILE="/tmp/freetsa-ca.pem"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWLIST="${ALLOWLIST:-$SCRIPT_DIR/tsr-verify-allowlist.txt}"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_DIR/tsr-verify.log"; }

if [ ! -f "$CA_FILE" ]; then
  curl -sL https://freetsa.org/files/cacert.pem -o "$CA_FILE" 2>/dev/null || true
fi

log "======== TSR VERIFY $(date -I) ========"

rc=0
node "$SCRIPT_DIR/tsr-verify.cjs" --dir "$TSA_DIR" --allowlist "$ALLOWLIST" --ca "$CA_FILE" 2>&1 | tee -a "$LOG_DIR/tsr-verify.log" || rc=$?

# Weekly backup (Sunday)
if [ "$(date +%u)" = "7" ]; then
  tar -czf "$BACKUP_DIR/tsr-$(date +%Y%m%d).tar.gz" -C "$TSA_DIR" . 2>/dev/null
  find "$BACKUP_DIR" -name "tsr-*.tar.gz" -mtime +90 -delete
  log "BACKUP created: tsr-$(date +%Y%m%d).tar.gz"
fi

if [ "$rc" -eq 0 ]; then
  log "TSR VERIFY OK"
else
  log "TSR VERIFY FAILED rc=$rc"
fi
exit "$rc"
