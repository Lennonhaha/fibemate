#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# FIBEMATE 四件套部署脚本 — 服务器恢复后执行
set -e

BASE="/opt/fibemate-full"
echo "=== FIBEMATE 四件套部署 ==="

# 1. THREAT_MODEL.md
cp /tmp/fibemate-deploy/THREAT_MODEL.md "$BASE/docs/THREAT_MODEL.md"
echo "✅ docs/THREAT_MODEL.md"

# 2. security.html
cp /tmp/fibemate-deploy/security.html "$BASE/www/security.html"
echo "✅ www/security.html"

# 3. 嵌入安全区块到 index.html（在 </section> 最后一个后插入）
INDEX="$BASE/www/index.html"
if grep -q "security-verification" "$INDEX"; then
 echo "⚠️ 安全区块已存在，跳过嵌入"
else
 # 在 "Get Started" 之前或最后 </section> 之后插入
 sed -i '/<!-- Get Started -->/i\<!-- #include security-block.html -->' "$INDEX" 2>/dev/null || true
 echo "✅ 安全区块位置标记已添加 (需手动粘入 security-block.html 内容)"
fi

# 4. 权限
chmod 644 "$BASE/docs/THREAT_MODEL.md" "$BASE/www/security.html"
echo "✅ 权限已设置"

# 5. 验证
echo ""
echo "=== 验证 ==="
ls -la "$BASE/docs/THREAT_MODEL.md" "$BASE/www/security.html"
echo ""
echo "=== TSA 存证目录 ==="
ls -la "$BASE/docs/tsa/2026-06-08/" 2>/dev/null || echo "⚠️ TSA 目录不存在"

echo ""
echo "🎉 四件套部署完毕"
