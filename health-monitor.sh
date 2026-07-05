#!/bin/bash
# FIBEMATE 服务健康检查脚本
# 每5分钟运行一次，检测关键服务状态

LOG_FILE="/var/log/fibemate-health.log"
ALERT_LOG="/var/log/fibemate-alerts.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# 检查 FIBEMATE 进程
FIBEMATE_PID=$(pgrep -f "node.*fibemate" | head -1)
if [ -z "$FIBEMATE_PID" ]; then
    echo "[$DATE] CRITICAL: FIBEMATE 进程未运行" >> $ALERT_LOG
    # 尝试重启
    systemctl restart fibemate
    echo "[$DATE] 已尝试重启 FIBEMATE" >> $ALERT_LOG
else
    # 检查端口监听
    PORT_3001=$(ss -tlnp | grep :3001 | wc -l)
    if [ "$PORT_3001" -eq 0 ]; then
        echo "[$DATE] WARNING: FIBEMATE 进程存在但端口3001未监听" >> $ALERT_LOG
    fi
fi

# 检查 Nginx
NGINX_PID=$(pgrep nginx | head -1)
if [ -z "$NGINX_PID" ]; then
    echo "[$DATE] CRITICAL: Nginx 未运行" >> $ALERT_LOG
    systemctl restart nginx
    echo "[$DATE] 已尝试重启 Nginx" >> $ALERT_LOG
fi

# 检查磁盘空间
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DKSK_USAGE" -gt 90 ]; then
    echo "[$DATE] CRITICAL: 磁盘使用率 ${DISK_USAGE}%" >> $ALERT_LOG
fi

# 检查内存
MEM_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100.0)}')
if [ "$MEM_USAGE" -gt 95 ]; then
    echo "[$DATE] CRITICAL: 内存使用率 ${MEM_USAGE}%" >> $ALERT_LOG
fi

# 检查 HTTPS 响应
curl -s -o /dev/null -w "%{http_code}" https://fibemate.net/api/health > /tmp/health_status.txt
HTTP_STATUS=$(cat /tmp/health_status.txt)
if [ "$HTTP_STATUS" != "200" ]; then
    echo "[$DATE] CRITICAL: API健康检查失败，HTTP状态: $HTTP_STATUS" >> $ALERT_LOG
fi

# 记录正常状态
if [ ! -f "$ALERT_LOG" ] || [ "$(tail -1 $ALERT_LOG | grep CRITICAL | wc -l)" -eq 0 ]; then
    echo "[$DATE] OK: FIBEMATE PID=$FIBEMATE_PID, 磁盘=${DISK_USAGE}%, 内存=${MEM_USAGE}%, HTTP=$HTTP_STATUS" >> $LOG_FILE
fi

# 保留最近1000行日志
tail -n 1000 $LOG_FILE > /tmp/fibemate-health.tmp && mv /tmp/fibemate-health.tmp $LOG_FILE
tail -n 1000 $ALERT_LOG > /tmp/fibemate-alerts.tmp && mv /tmp/fibemate-alerts.tmp $ALERT_LOG
