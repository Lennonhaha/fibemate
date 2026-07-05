#!/bin/bash
# FIBEMATE 阿里云监控告警配置脚本
# 配置云监控、日志服务、告警规则

set -e

# 配置
PROJECT_NAME="fibemate"
REGION="cn-hangzhou"
LOGSTORE="fibemate-logs"
METRIC_NS="fibemate-metrics"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== FIBEMATE 阿里云监控告警配置 ===${NC}"

# 检查 aliyun CLI
if ! command -v aliyun &> /dev/null; then
    echo -e "${YELLOW}安装阿里云 CLI...${NC}"
    curl -O https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz
    tar -xzf aliyun-cli-linux-latest-amd64.tgz
    mv aliyun /usr/local/bin/
    rm aliyun-cli-linux-latest-amd64.tgz
fi

# 配置日志服务 (SLS)
echo -e "${GREEN}配置日志服务 (SLS)...${NC}"

# 创建 Project
aliyun log create-project \
    --project-name="${PROJECT_NAME}-monitor" \
    --description="FIBEMATE 监控日志项目" \
    --region-id="${REGION}" 2>/dev/null || echo "Project 已存在"

# 创建 Logstore
aliyun log create-logstore \
    --project-name="${PROJECT_NAME}-monitor" \
    --logstore-name="${LOGSTORE}" \
    --shard-count=2 \
    --ttl=30 \
    --region-id="${REGION}" 2>/dev/null || echo "Logstore 已存在"

# 创建索引
aliyun log create-index \
    --project-name="${PROJECT_NAME}-monitor" \
    --logstore-name="${LOGSTORE}" \
    --index-detail='{
        "line": {"token": [",", " ", "'"'"'", "\"", ";", "=", ":", "{", "}", "[", "]", "(", ")", "\n", "\t"]},
        "keys": {
            "level": {"type": "text", "token": [","], "caseSensitive": false},
            "status": {"type": "text", "token": [","], "caseSensitive": false},
            "ip": {"type": "text", "token": [","], "caseSensitive": false},
            "userId": {"type": "text", "token": [","], "caseSensitive": false}
        }
    }' \
    --region-id="${REGION}" 2>/dev/null || echo "索引已存在"

# 创建机器组
echo -e "${GREEN}配置机器组...${NC}"
aliyun log create-machine-group \
    --project-name="${PROJECT_NAME}-monitor" \
    --machine-group="fibemate-servers" \
    --machine-list='["8.156.77.68"]' \
    --region-id="${REGION}" 2>/dev/null || echo "机器组已存在"

# 创建告警规则
echo -e "${GREEN}创建告警规则...${NC}"

# 1. CPU 使用率告警
aliyun cms PutResourceMetricRule \
    --RuleName "fibemate-cpu-high" \
    --Namespace "acs_ecs_dashboard" \
    --MetricName "CPUUtilization" \
    --Resources '[{"Dimensions":[{"Name":"instanceId","Value":"i-8v7b6c5d4e3f2a1b"}]}]' \
    --ContactGroups '["fibemate-admins"]' \
    --Escalations.Critical.Statistics "Average" \
    --Escalations.Critical.ComparisonOperator ">=" \
    --Escalations.Critical.Threshold 80 \
    --Escalations.Critical.Times 3 \
    --Period 300 \
    --EffectiveInterval "00:00-23:59" \
    --SilenceTime 3600 2>/dev/null || echo "CPU 告警已存在"

# 2. 内存使用率告警
aliyun cms PutResourceMetricRule \
    --RuleName "fibemate-memory-high" \
    --Namespace "acs_ecs_dashboard" \
    --MetricName "memory_usedutilization" \
    --Resources '[{"Dimensions":[{"Name":"instanceId","Value":"i-8v7b6c5d4e3f2a1b"}]}]' \
    --ContactGroups '["fibemate-admins"]' \
    --Escalations.Critical.Statistics "Average" \
    --Escalations.Critical.ComparisonOperator ">=" \
    --Escalations.Critical.Threshold 85 \
    --Escalations.Critical.Times 3 \
    --Period 300 \
    --SilenceTime 3600 2>/dev/null || echo "内存告警已存在"

# 3. 磁盘使用率告警
aliyun cms PutResourceMetricRule \
    --RuleName "fibemate-disk-high" \
    --Namespace "acs_ecs_dashboard" \
    --MetricName "diskusage_utilization" \
    --Resources '[{"Dimensions":[{"Name":"instanceId","Value":"i-8v7b6c5d4e3f2a1b"},{"Name":"device","Value":"/dev/vda1"}]}]' \
    --ContactGroups '["fibemate-admins"]' \
    --Escalations.Critical.Statistics "Average" \
    --Escalations.Critical.ComparisonOperator ">=" \
    --Escalations.Critical.Threshold 90 \
    --Escalations.Critical.Times 2 \
    --Period 300 \
    --SilenceTime 7200 2>/dev/null || echo "磁盘告警已存在"

# 4. 网络入流量告警 (DDoS 检测)
aliyun cms PutResourceMetricRule \
    --RuleName "fibemate-network-in-high" \
    --Namespace "acs_ecs_dashboard" \
    --MetricName "InternetInRate" \
    --Resources '[{"Dimensions":[{"Name":"instanceId","Value":"i-8v7b6c5d4e3f2a1b"}]}]' \
    --ContactGroups '["fibemate-admins"]' \
    --Escalations.Critical.Statistics "Average" \
    --Escalations.Critical.ComparisonOperator ">=" \
    --Escalations.Critical.Threshold 104857600 \
    --Escalations.Critical.Times 2 \
    --Period 60 \
    --SilenceTime 1800 2>/dev/null || echo "网络告警已存在"

# 5. 自定义应用告警 - 5xx 错误率高
aliyun log create-alert \
    --project-name="${PROJECT_NAME}-monitor" \
    --alert-name="fibemate-5xx-errors" \
    --condition='error_count > 10' \
    --query='status >= 500 | select count(1) as error_count' \
    --notification='{"type":"sms","mobile":"+86138****8888"}' \
    --region-id="${REGION}" 2>/dev/null || echo "5xx 告警已存在"

# 配置日志收集
echo -e "${GREEN}配置日志收集...${NC}"

# 创建 Logtail 配置
cat > /tmp/logtail-config.json << 'EOF'
{
    "inputType": "file",
    "configName": "fibemate-app-logs",
    "inputDetail": {
        "logType": "json_log",
        "logPath": "/var/log/fibemate",
        "filePattern": "*.log",
        "maxReadSpeed": "2MB",
        "topicFormat": "none"
    },
    "outputDetail": {
        "logstoreName": "fibemate-logs"
    }
}
EOF

aliyun log create-logtail-config \
    --project-name="${PROJECT_NAME}-monitor" \
    --config-detail="file:///tmp/logtail-config.json" \
    --region-id="${REGION}" 2>/dev/null || echo "Logtail 配置已存在"

# 应用配置到机器组
aliyun log apply-config-to-machine-group \
    --project-name="${PROJECT_NAME}-monitor" \
    --machine-group="fibemate-servers" \
    --config-name="fibemate-app-logs" \
    --region-id="${REGION}" 2>/dev/null || echo "配置已应用"

# 创建 Dashboard
echo -e "${GREEN}创建监控 Dashboard...${NC}"

cat > /tmp/dashboard.json << 'EOF'
{
    "dashboardName": "fibemate-overview",
    "charts": [
        {
            "title": "CPU 使用率",
            "type": "line",
            "query": "* | select __time__ - __time__ % 60 as time, avg(cpu_percent) as cpu from log group by time order by time limit 1000"
        },
        {
            "title": "内存使用率",
            "type": "line",
            "query": "* | select __time__ - __time__ % 60 as time, avg(memory_percent) as memory from log group by time order by time limit 1000"
        },
        {
            "title": "请求 QPS",
            "type": "line",
            "query": "* | select __time__ - __time__ % 60 as time, count(1) as qps from log group by time order by time limit 1000"
        },
        {
            "title": "错误率",
            "type": "line",
            "query": "status >= 400 | select __time__ - __time__ % 60 as time, count(1) as errors from log group by time order by time limit 1000"
        }
    ]
}
EOF

aliyun log create-dashboard \
    --project-name="${PROJECT_NAME}-monitor" \
    --dashboard-detail="file:///tmp/dashboard.json" \
    --region-id="${REGION}" 2>/dev/null || echo "Dashboard 已存在"

echo -e "${GREEN}=== 阿里云监控配置完成 ===${NC}"
echo -e "${YELLOW}请完成以下手动配置:${NC}"
echo "1. 在阿里云控制台添加告警联系人组 'fibemate-admins'"
echo "2. 配置短信/邮件/钉钉通知渠道"
echo "3. 在 ECS 控制台确认实例 ID 并更新告警规则"
echo "4. 安装 Logtail 到服务器: wget http://logtail-release-cn-hangzhou.oss-cn-hangzhou.aliyuncs.com/linux64/logtail.sh"
