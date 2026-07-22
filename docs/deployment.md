# FIBEMATE 部署指南

> 版本: v3.3 | 最后更新: 2026-07-22

## 快速开始

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install
```

### 本地开发

```bash
# 启动静态网站 + reg-server
node scripts/dev-server.js

# 或者分别启动
npx http-server www/ -p 8080 &
node reg-server/server.js 3080
```

### Tauri Desktop (v2)

```bash
cd tauri/
npm install
npx tauri dev     # 开发模式
npx tauri build   # 生产构建
```

## 生产部署 (Linux + Nginx)

### 前提条件

- Ubuntu 22.04+
- Node.js 22+
- Nginx 1.24+
- Let's Encrypt (certbot)

### 1. 克隆仓库

```bash
git clone https://github.com/Lennonhaha/fibemate.git /opt/fibemate-repo
cd /opt/fibemate-repo
npm install --production
```

### 2. Nginx 配置

```nginx
server {
    listen 443 ssl http2;
    server_name fibemate.net www.fibemate.net;

    ssl_certificate     /etc/letsencrypt/live/fibemate.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fibemate.net/privkey.pem;

    # 静态文件
    root /opt/fibemate-repo/www;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # WebSocket 代理 (reg-server)
    location /ws/ {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 安全头
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
}
```

### 3. SSL 证书

```bash
certbot certonly --nginx -d fibemate.net -d www.fibemate.net
certbot renew --dry-run   # 验证自动续期

# 续期后重启 Nginx 的 hook
# /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh:
#   #!/bin/bash
#   systemctl reload nginx
```

### 4. reg-server 后台运行

```bash
# 使用 systemd
cat > /etc/systemd/system/fibemate-reg.service << 'EOF'
[Unit]
Description=FIBEMATE Registration Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/fibemate-repo
ExecStart=/usr/bin/node reg-server/server.js 3080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fibemate-reg
systemctl start fibemate-reg
```

### 5. 健康检查

```bash
# HTTP health
curl http://127.0.0.1:3081/health
# => {"ok":true,"users":0,"totalOpks":0,"uptime":123,"iana4590":true}

# SSL
curl -I https://fibemate.net
# => HTTP/2 200

# 证书到期日
echo | openssl s_client -connect fibemate.net:443 2>/dev/null | openssl x509 -noout -enddate
```

## 防火墙

```bash
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (certbot)
ufw allow 443/tcp    # HTTPS
ufw allow 3080/tcp   # reg-server (仅本地)
ufw enable
```

## 更新部署

```bash
cd /opt/fibemate-repo
git pull origin main
npm install --production      # 如有新依赖
systemctl reload nginx        # 如静态文件变更
systemctl restart fibemate-reg  # 如 reg-server 变更
```

## 备份

```bash
# 代码已在 GitHub
# 备份 KeyStorage (IndexedDB) — 浏览器端
# 备份 reg-server 内存状态 — 可选持久化

# 项目相关数据
tar -czf fibemate-backup-$(date +%Y%m%d).tar.gz \
  /opt/fibemate-repo/www/docs/tsa/ \
  /etc/letsencrypt/live/fibemate.net/
```

## 环境变量

| 变量 | 默认 | 说明 |
|:---|:---|:---|
| `PORT` | 3080 | reg-server WebSocket 端口 |
| `HEALTH_PORT` | 3081 | Health check HTTP 端口 |
| `NODE_ENV` | production | 环境模式 |

## Docker (可选)

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install --production
EXPOSE 3080 3081
CMD ["node", "reg-server/server.js", "3080"]
```

```bash
docker build -t fibemate-reg .
docker run -d -p 3080:3080 -p 3081:3081 fibemate-reg
```

---

> 当前生产环境: Alibaba Cloud ECS (8.156.77.68) | Ubuntu 22.04 | Nginx 1.24
