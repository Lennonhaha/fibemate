#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# =============================================================================
# docker-start.sh — FIBEMATE 容器内服务启动
# 启动 nginx（前台，保持容器存活）+ 各 Node 服务（后台）。
# 任何 Node 服务缺失入口时跳过并打印警告，不影响静态站点与已启动服务。
# =============================================================================
set -u

ROOT=/opt/fibemate-full
log() { echo "[docker-start] $*"; }

log "启动 FIBEMATE 服务..."

# 注册服务 (reg-server: WS 3080 / health 3081)
if [ -f "$ROOT/reg-server/server.js" ]; then
  ( cd "$ROOT/reg-server" && PORT=3080 node server.js ) >>/proc/1/fd/1 2>&1 &
  log "reg-server 已启动 (3080/3081)"
else
  log "警告: 未找到 reg-server/server.js，跳过"
fi

# Web/ZX 服务 (www/src/server-main.js -> 3002)
if [ -f "$ROOT/www/src/server-main.js" ]; then
  ( cd "$ROOT/www" && PORT=3002 node src/server-main.js ) >>/proc/1/fd/1 2>&1 &
  log "www 服务已启动 (3002)"
else
  log "警告: 未找到 www/src/server-main.js，跳过"
fi

# 主 API (noir-backend: src/index.js -> 3001，需原生 ML-KEM 插件)
if [ -f "$ROOT/addon/build/Release/mlkem.node" ]; then
  ( cd "$ROOT" && PORT=3001 node src/index.js ) >>/proc/1/fd/1 2>&1 &
  log "主 API 已启动 (3001)"
else
  log "警告: addon/build/Release/mlkem.node 缺失，主 API(3001) 未启动"
  log "       （纯 JS 回退需代码调整；原生插件源码请参见 BUILD.md）"
fi

log "启动 nginx (前台)..."
exec nginx -g 'daemon off;'
