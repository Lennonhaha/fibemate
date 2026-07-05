#!/bin/bash
# JWT_SECRET 硬编码修复脚本
# 执行: cd /opt/fibemate-full && bash fix_jwt_secret.sh

set -e

cd /opt/fibemate-full

echo "=== 1. 确保 data/.jwt-secret 存在 ==="
mkdir -p data
if [ ! -f data/.jwt-secret ]; then
 openssl rand -base64 48 > data/.jwt-secret
 chmod 600 data/.jwt-secret
 echo "✅ 已生成新的 .jwt-secret"
else
 echo "✅ .jwt-secret 已存在"
fi

echo ""
echo "=== 2. 创建公共 JWT 辅助模块 ==="
mkdir -p src/lib
cat > src/lib/jwt-helper.js << 'ENDFILE'
const fs = require('fs');
const path = require('path');

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(__dirname, '..', '..', 'data', '.jwt-secret');
  if (fs.existsSync(secretFile)) {
    const secret = fs.readFileSync(secretFile, 'utf-8').trim();
    if (secret.length >= 32) return secret;
  }
  console.error('FATAL: JWT_SECRET not found in env or data/.jwt-secret');
  process.exit(1);
}

function getJwtSecretFile() {
  return path.join(__dirname, '..', '..', 'data', '.jwt-secret');
}

module.exports = { getJwtSecret, getJwtSecretFile };
ENDFILE
echo "✅ 已创建 src/lib/jwt-helper.js"

echo ""
echo "=== 3. 修复 zk-auth.js ==="
if [ -f src/routes/zk-auth.js ]; then
 cp src/routes/zk-auth.js src/routes/zk-auth.js.bak.$(date +%Y%m%d%H%M%S)
 if ! grep -q "jwt-helper" src/routes/zk-auth.js; then
 sed -i '1i const { getJwtSecret } = require("../lib/jwt-helper");' src/routes/zk-auth.js
 fi
 sed -i 's/let JWT_SECRET = process.env.JWT_SECRET || .*/let JWT_SECRET = getJwtSecret();/' src/routes/zk-auth.js
 echo "✅ 已修复 src/routes/zk-auth.js"
else
 echo "⚠️ src/routes/zk-auth.js 不存在，跳过"
fi

echo ""
echo "=== 4. 修复 zk-register-v2.js ==="
if [ -f src/routes/zk-register-v2.js ]; then
 cp src/routes/zk-register-v2.js src/routes/zk-register-v2.js.bak.$(date +%Y%m%d%H%M%S)
 if ! grep -q "jwt-helper" src/routes/zk-register-v2.js; then
 sed -i '1i const { getJwtSecret, getJwtSecretFile } = require("../lib/jwt-helper");' src/routes/zk-register-v2.js
 fi
 sed -i 's|/opt/fibemate-full/src/.jwt_secret|getJwtSecretFile()|g' src/routes/zk-register-v2.js
 sed -i 's/const JWT_SECRET = .*/const JWT_SECRET = getJwtSecret();/g' src/routes/zk-register-v2.js
 echo "✅ 已修复 src/routes/zk-register-v2.js"
else
 echo "⚠️ src/routes/zk-register-v2.js 不存在，跳过"
fi

echo ""
echo "=== 5. 修复 zk-anonymous-auth.js ==="
if [ -f src/routes/zk-anonymous-auth.js ]; then
 cp src/routes/zk-anonymous-auth.js src/routes/zk-anonymous-auth.js.bak.$(date +%Y%m%d%H%M%S)
 if ! grep -q "jwt-helper" src/routes/zk-anonymous-auth.js; then
 sed -i '1i const { getJwtSecret } = require("../lib/jwt-helper");' src/routes/zk-anonymous-auth.js
 fi
 sed -i 's/let JWT_SECRET = .*/let JWT_SECRET = getJwtSecret();/' src/routes/zk-anonymous-auth.js
 echo "✅ 已修复 src/routes/zk-anonymous-auth.js"
else
 echo "⚠️ src/routes/zk-anonymous-auth.js 不存在，跳过"
fi

echo ""
echo "=== 6. 检查其他可能有硬编码的文件 ==="
grep -rn "noir-default-jwt-secret\|fibemate-dev-jwt-secret" src/ --include="*.js" 2>/dev/null | grep -v "jwt-helper" | grep -v ".bak" || echo "✅ 未发现其他硬编码"

echo ""
echo "=== 7. PM2 重启服务 ==="
pm2 restart fibemate-backend 2>&1 | tail -5
sleep 3
pm2 list | grep fibemate-backend

echo ""
echo "=== 8. 验证服务健康 ==="
curl -s http://127.0.0.1:3001/api/health || echo "⚠️ 健康检查失败"

echo ""
echo "✅ JWT_SECRET 硬编码修复完成"
echo "备份文件保存在同目录下 *.bak.*"
