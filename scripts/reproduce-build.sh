#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# =============================================================================
# scripts/reproduce-build.sh
# 复现性前置校验：
#   1. 校验 Node 版本与 .nvmrc 一致
#   2. 校验每个 package.json 与 package-lock.json 同步（npm ci --dry-run）
#      —— 若 lock 与 package.json 不一致，说明存在隐性版本漂移，立即报错退出
#   3. 若有 docs/wasm-checksums.txt，校验 WASM 产物 sha256 未变
# 用法： bash scripts/reproduce-build.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[repro] Node: $(node -v)  (期望 .nvmrc: $(cat .nvmrc | tr -d 'v\r'))"

# --- 1. Node 版本校验 ---
EXPECTED="v$(cat .nvmrc | tr -d 'v\r')"
ACTUAL="$(node -v)"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "[repro][WARN] Node 版本不符：期望 $EXPECTED，当前 $ACTUAL（功能可能仍正常，但复现基线不一致）"
fi

# --- 2. lockfile 同步校验（核心）---
for d in . www reg-server mixnet mixnet/entry mixnet/exit mixnet/middle; do
  if [ -f "$d/package.json" ]; then
    echo "== lock sync: $d =="
    (cd "$d" && npm ci --dry-run --no-audit --no-fund)
  fi
done

# --- 3. WASM 校验和比对 ---
SUMFILE="$ROOT/docs/wasm-checksums.txt"
if [ -f "$SUMFILE" ]; then
  echo "== WASM checksums =="
  sha256sum -c "$SUMFILE"
else
  echo "[repro]（跳过 WASM 校验：无 $SUMFILE）"
fi

echo "[repro] OK —— 依赖锁定与可复现安装校验通过"
