#!/bin/bash
# FIBEMATE daily backup — runs at 03:00 via cron
set -e

SRC="/opt/fibemate-repo"
DST="/opt/backups/code/fibemate-full_$(date +%Y%m%d_030001).tar.gz"
LOG="/var/log/fibemate/backup.log"

mkdir -p "$(dirname "$LOG")" "$(dirname "$DST")"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup..." >> "$LOG"

tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='target' \
    --exclude='*.o' \
    --exclude='*.node' \
    -czf "$DST" \
    -C /opt/fibemate-repo .

SIZE=$(du -h "$DST" | cut -f1)
SHA=$(sha256sum "$DST" | awk '{print $1}')

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done: $DST ($SIZE) SHA256=$SHA" >> "$LOG"

# Keep only last 30 days
find /opt/backups/code/ -name 'fibemate-full_*.tar.gz' -mtime +30 -delete 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleanup complete." >> "$LOG"
