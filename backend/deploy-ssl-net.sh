#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
set -e

echo "=== FIBEMATE SSL 自动部署 (fibemate.net) ==="

echo "[1/5] 安装 Certbot..."
apt-get update -qq
apt-get install -y certbot -qq

echo "[2/5] 停止占用 80 端口的服务..."
systemctl stop nginx 2>/dev/null || true
systemctl stop fibemate 2>/dev/null || true
sleep 2

echo "[3/5] 申请 SSL 证书..."
certbot certonly --standalone \
 --non-interactive \
 --agree-tos \
 --email admin@fibemate.net \
 -d fibemate.net \
 -d www.fibemate.net

echo "[4/5] 配置自动续期..."
echo "0 3 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew

echo "[5/5] 配置证书路径..."
mkdir -p /etc/ssl/fibemate
ln -sf /etc/letsencrypt/live/fibemate.net/fullchain.pem /etc/ssl/fibemate/fibemate.net.crt
ln -sf /etc/letsencrypt/live/fibemate.net/privkey.pem /etc/ssl/fibemate/fibemate.net.key

echo ""
echo "=== 证书部署完成 ==="
echo "证书路径:"
ls -la /etc/ssl/fibemate/
echo ""
echo "证书信息:"
openssl x509 -in /etc/ssl/fibemate/fibemate.net.crt -text -noout | grep -E "Subject:|Not After|DNS:"
