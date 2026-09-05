#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# ═══════════════════════════════════════════════════════════════════════════
# FIBEMATE CI guard — verify no build artifacts / deps are tracked
# 等价于 pre-commit 钩子的 CI 层防护（2026-08-05 git add -A 事故后建立）
# 用法（CI 或本地）：bash scripts/ci-check-tracked-files.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "🔍 检查是否误跟踪了编译产物 / 依赖目录..."
# 仅查绝对无意的自动生成产物；项目有意文件（www/circuits/build/、*.log）不在列
BAD=$(git ls-files | grep -E 'rust/target/|node_modules/|\.venv|__pycache__|\.pyc$' || true)

if [ -n "$BAD" ]; then
  echo "❌ 检测到被跟踪的危险文件/目录："
  echo "$BAD"
  echo " → 这些不应进入版本控制。请 git rm --cached 并从 .gitignore 排除。"
  exit 1
fi

echo "✅ 未发现编译产物 / 依赖被跟踪"

# 二次防护：提交规模异常检测（防止单笔误提交大量文件）
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l || echo 0)
if [ "$STAGED" -gt 50 ]; then
  echo "⚠️  本地暂存了 $STAGED 个文件，疑似 git add -A 误操作"
  echo " → 请 git reset 后仅添加目标文件"
  exit 1
fi

echo "✅ 提交规模正常"
