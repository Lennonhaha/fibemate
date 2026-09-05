#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
cd /opt/fibemate-full/reg-server
fuser -k 3080/tcp 3081/tcp 2>/dev/null || true
sleep 1
nohup node server.js 3080 > reg-server.log 2>&1 &
PID=$!
echo "Started PID=$PID"
sleep 2
curl -s http://127.0.0.1:3081/health
echo ""
echo "---"
cat reg-server.log
