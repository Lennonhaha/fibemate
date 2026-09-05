#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
echo "=== FIBEMATE SSL 自动部署 ==="
echo "[1/5] 安装 Certbot..."
apt-get update
apt-get install -y certbot

echo "[2/5] 申请 SSL 证书..."
certbot certonly --standalone \
 --non-interactive \
 --agree-tos \
 --email admin@fibemate.cn \
 -d fibemate.cn \
 -d www.fibemate.cn

echo "[3/5] 配置自动续期..."
echo "0 3 * * * root certbot renew --quiet" > /etc/cron.d/certbot-renew

echo "[4/5] 配置证书路径..."
mkdir -p /etc/ssl/fibemate
ln -sf /etc/letsencrypt/live/fibemate.cn/fullchain.pem /etc/ssl/fibemate/fibemate.cn.crt
ln -sf /etc/letsencrypt/live/fibemate.cn/privkey.pem /etc/ssl/fibemate/fibemate.cn.key

echo "[5/5] 验证证书..."
ls -la /etc/ssl/fibemate/
openssl x509 -in /etc/ssl/fibemate/fibemate.cn.crt -text -noout | grep -E "Subject:|Not After"

echo ""
echo "=== 部署完成 ==="
