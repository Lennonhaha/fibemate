# FIBEMATE PQC Attack — 攻防沙盒镜像（仅供本地研究）
# 设计文档: docs/product-designs/08-pqc-docker.md §7.2
FROM python:3.12-slim

LABEL org.fibemate.image="pqc-attack"
LABEL org.fibemate.warning="FOR LOCAL RESEARCH ONLY — NOT FOR PRODUCTION"

# 安装攻击工具
RUN pip install --no-cache-dir frida-tools angr pwntools

# 复制 VWZ 挑战 + LG 混淆目标 + 攻击套件
COPY vwz-challenge/ /app/vwz/
COPY experimental/vwz-lg/attack/ /app/attack/

# 攻击 API 服务器
COPY docker/attack/server.js /app/server.js

WORKDIR /app

# 非 root
RUN useradd -m -u 1000 attackuser
USER attackuser

EXPOSE 3000
CMD ["node", "server.js"]
