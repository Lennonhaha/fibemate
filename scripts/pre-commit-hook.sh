#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# FIBEMATE pre-commit guard
# 防止 git add -A 误暂存编译产物/依赖目录（2026-08-05 事故后建立）
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

MAX_FILES=50
MAX_SIZE_KB=10240   # 10 MB

# 1) 暂存文件数
STAGED_FILES=$(git diff --cached --name-only | wc -l)

# 2) 暂存文件总大小（bytes → KB）
#    注意：暂存区为空时 git diff --cached 无输出，xargs 会回退到当前目录，
#    必须用 -z 读取文件名并在空时显式置 0，否则 du 会统计整个工作树。
if git diff --cached --quiet; then
  STAGED_SIZE=0
else
  STAGED_SIZE=$(git diff --cached --name-only -z 2>/dev/null \
    | xargs -0 du -cb 2>/dev/null | tail -1 | awk '{print $1}')
fi
[ -z "$STAGED_SIZE" ] && STAGED_SIZE=0
STAGED_SIZE_KB=$((STAGED_SIZE / 1024))

# 3) 危险目录/文件模式（仅限绝对无意的自动生成产物；
#    www/circuits/build/、*.log 等项目有意文件不在列，避免误伤）
DANGER_PATTERNS='rust/target/|node_modules/|\.venv|__pycache__|\.pyc$'

if [ "$STAGED_FILES" -gt "$MAX_FILES" ]; then
  echo "❌ 暂存了 $STAGED_FILES 个文件（超过 $MAX_FILES 限制）"
  echo "   → 可能误用了 git add -A？"
  echo "   → 建议：git reset，然后只添加需要的文件"
  echo "   → 强制提交请用：git commit --no-verify"
  exit 1
fi

if [ "$STAGED_SIZE_KB" -gt "$MAX_SIZE_KB" ]; then
  echo "❌ 暂存文件总大小约 ${STAGED_SIZE_KB}KB（超过 ${MAX_SIZE_KB}KB = 10MB）"
  echo "   → 可能包含编译产物或依赖目录"
  echo "   → 强制提交请用：git commit --no-verify"
  exit 1
fi

STAGED_DANGER=$(git diff --cached --name-only | grep -E "$DANGER_PATTERNS" || true)
if [ -n "$STAGED_DANGER" ]; then
  echo "❌ 暂存了以下危险文件/目录："
  echo "$STAGED_DANGER"
  echo "   → 请确保 .gitignore 已包含这些路径"
  echo "   → 强制提交请用：git commit --no-verify"
  exit 1
fi

echo "✅ 提交前检查通过（暂存 $STAGED_FILES 个文件，约 ${STAGED_SIZE_KB}KB）"
