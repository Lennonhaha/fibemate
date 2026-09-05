#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# ═══════════════════════════════════════════════════════════════════════════
# check-encoding-cron.sh — server-side every-3-hour encoding scan
#
# 每 3 小时运行一次：检测 U+FFFD / GBK mojibake / 控制字符 / BOM / NUL。
# 发现乱码时写入 /var/log/fibemate-encoding-check.log。
#
# ⚠ 服务器仓库是「磁盘先行」（scp 部署），常处于 dirty 态。
#   故这里只用 `git fetch` 对比远端，不做 `git pull`（避免 clobber 磁盘内容）。
#   TOOLS.md 约定：拉取前先 fetch 对比，确认磁盘 == main 后再操作。
#
# Crontab（每 3 小时，0:00/3:00/6:00/...）：
#   0 */3 * * * /opt/fibemate-repo/scripts/check-encoding-cron.sh >> /var/log/fibemate/encoding-cron.log 2>&1
# ═══════════════════════════════════════════════════════════════════════════
LOG_FILE="/var/log/fibemate-encoding-check.log"
REPO_DIR="/opt/fibemate-repo"
TMP="/tmp/encoding-check.tmp"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
cd "$REPO_DIR" || { echo "repo dir missing: $REPO_DIR"; exit 1; }

# 对比远端（不落地，不改变工作树）
git fetch origin main 2>/dev/null

node scripts/check-encoding.cjs > "$TMP" 2>&1
rc=$?

if [ "$rc" -ne 0 ]; then
  echo "[$(date '+%F %T')] FAIL: encoding corruption detected" >> "$LOG_FILE"
  cat "$TMP" >> "$LOG_FILE"
  echo "──────────────────────" >> "$LOG_FILE"
  # 可选告警：Telegram / 邮件 / 钉钉（预留，默认关闭）
else
  echo "[$(date '+%F %T')] OK" >> "$LOG_FILE"
fi

rm -f "$TMP"
exit 0
