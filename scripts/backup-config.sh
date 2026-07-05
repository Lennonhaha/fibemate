#!/bin/bash
# FIBEMATE 配置备份 (nginx + certbot)
# 运行: 每天凌晨3点 via cron
set -e

BACKUP_DIR="/opt/fibemate-full/backups/config"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR/$TIMESTAMP"

# 备份 nginx 配置
cp -r /etc/nginx/sites-enabled "$BACKUP_DIR/$TIMESTAMP/sites-enabled" 2>/dev/null || true
cp -r /etc/nginx/sites-available "$BACKUP_DIR/$TIMESTAMP/sites-available" 2>/dev/null || true
cp /etc/nginx/nginx.conf "$BACKUP_DIR/$TIMESTAMP/nginx.conf" 2>/dev/null || true

# 备份 certbot
cp -r /etc/letsencrypt "$BACKUP_DIR/$TIMESTAMP/letsencrypt" 2>/dev/null || true

# 备份应用配置
cp /opt/fibemate-full/src/index.js "$BACKUP_DIR/$TIMESTAMP/index.js" 2>/dev/null || true
cp /opt/fibemate-full/data/.jwt-secret "$BACKUP_DIR/$TIMESTAMP/.jwt-secret" 2>/dev/null || true

# 打包
cd "$BACKUP_DIR"
tar czf "config_${TIMESTAMP}.tar.gz" "$TIMESTAMP" 2>/dev/null || true
rm -rf "$TIMESTAMP"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Config backup: config_${TIMESTAMP}.tar.gz"

# 清理旧备份
find "$BACKUP_DIR" -name "config_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaned config backups older than ${RETENTION_DAYS} days"

