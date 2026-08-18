#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# FIBEMATE pre-commit guard (combined)
# 1) Encoding check  — block U+FFFD / GBK mojibake / control chars / BOM / NUL
# 2) Staging guard    — block git add -A misuse (file count / size / dangerous dirs)
#
# Install:  cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# Force commit:  git commit --no-verify
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

MAX_FILES=50
MAX_SIZE_KB=10240   # 10 MB
DANGER_PATTERNS='rust/target/|node_modules/|\.venv|__pycache__|\.pyc$'

# ── 1) Encoding check on STAGED text files ────────────────────────────────
STAGED=$(git diff --cached --name-only -z | tr '\0' '\n' | grep -E '\.(js|mjs|cjs|ts|tsx|html|htm|md|json|css|scss|ya?ml|toml|py|rs|sh|ps1|sql|vue|txt|tcl|xml)$' || true)

if [ -n "$STAGED" ]; then
  if command -v node >/dev/null 2>&1; then
    # Pass staged files explicitly; if none matched, no-op.
    if ! node scripts/check-encoding.cjs $STAGED; then
      echo "❌ 编码检查失败：暂存文件含乱码（U+FFFD / GBK / 控制字符 / BOM / NUL）"
      echo "   → 请用 UTF-8（无 BOM）重新保存文件"
      echo "   → 强制提交请用：git commit --no-verify"
      exit 1
    fi
    echo "✅ 编码检查通过"
  else
    echo "⚠️  未找到 node，跳过编码检查（建议安装 Node.js）"
  fi
fi

# ── 2) Staging guard ──────────────────────────────────────────────────────
STAGED_FILES=$(git diff --cached --name-only | wc -l)

if [ "$STAGED_FILES" -gt "$MAX_FILES" ]; then
  echo "❌ 暂存了 $STAGED_FILES 个文件（超过 $MAX_FILES 限制）"
  echo "   → 可能误用了 git add -A？建议 git reset 后只添加需要的文件"
  echo "   → 强制提交请用：git commit --no-verify"
  exit 1
fi

if git diff --cached --quiet; then
  STAGED_SIZE=0
else
  STAGED_SIZE=$(git diff --cached --name-only -z 2>/dev/null \
    | xargs -0 du -cb 2>/dev/null | tail -1 | awk '{print $1}' || echo 0)
fi
[ -z "$STAGED_SIZE" ] && STAGED_SIZE=0
STAGED_SIZE_KB=$((STAGED_SIZE / 1024))

if [ "$STAGED_SIZE_KB" -gt "$MAX_SIZE_KB" ]; then
  echo "❌ 暂存文件总大小约 ${STAGED_SIZE_KB}KB（超过 ${MAX_SIZE_KB}KB = 10MB）"
  echo "   → 可能包含编译产物或依赖目录"
  echo "   → 强制提交请用：git commit --no-verify"
  exit 1
fi

STAGED_DANGER=$(git diff --cached --name-only | grep -E "$DANGER_PATTERNS" || true)
if [ -n "$STAGED_DANGER" ]; then
  echo "❌ 暂存了危险文件/目录："
  echo "$STAGED_DANGER"
  echo "   → 请确保 .gitignore 已包含这些路径"
  echo "   → 强制提交请用：git commit --no-verify"
  exit 1
fi

echo "✅ 提交前检查通过（暂存 $STAGED_FILES 个文件，约 ${STAGED_SIZE_KB}KB）"
