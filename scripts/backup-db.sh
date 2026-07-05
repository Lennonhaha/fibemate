#!/bin/bash
# FIBEMATE 数据库每日备份
# 运行: 每天凌晨3点 via cron
set -e

BACKUP_DIR="/opt/fibemate-full/backups"
DB_PATH="/opt/fibemate-full/data/noir-db.json"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 备份数据库
cp "$DB_PATH" "$BACKUP_DIR/noir-db_${TIMESTAMP}.json"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created: noir-db_${TIMESTAMP}.json"

# 清理旧备份
find "$BACKUP_DIR" -name "noir-db_*.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaned backups older than ${RETENTION_DAYS} days"

