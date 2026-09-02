# =============================================================================
# FIBEMATE 基础部署镜像
# 详细说明见 BUILD.md §Docker 部署。本镜像为「标准化部署」起点，覆盖：
#   - 静态站点  : /opt/fibemate-full/www  (nginx 提供)
#   - Web/ZX 服务: www/src/server-main.js        -> 3002 (api/ws/health)
#   - 注册服务   : reg-server/server.js           -> 3080(WS)/3081(health)
#   - 主 API     : src/index.js (noir-backend)     -> 3001  (见下方已知约束)
#
# 已知约束（已修复，2026-09-02）：
#   主 API (3001) 优先加载原生 ML-KEM 插件 addon/build/Release/mlkem.node；
#   若插件未编译，自动回退到纯 JS 实现（packages/pqc-kem 桥接 API：
#   generateKeypair/encapsulate/decapsulate），进程不再退出。
#   如需更高性能，可在 ADDON_DIR 提供源码并在构建期执行 addon 构建。
# =============================================================================
FROM node:20.18.1-bookworm AS build

# 构建期工具（better-sqlite3 / 原生插件需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential python3 make g++ pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/fibemate-full
COPY package*.json ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts
COPY . .

# 子服务依赖（各自 lockfile 已生成）
RUN [ -f www/package.json ] && (cd www && npm ci --ignore-scripts || npm install --ignore-scripts) || true
RUN [ -f reg-server/package.json ] && (cd reg-server && npm ci --ignore-scripts || npm install --ignore-scripts) || true

# 可选：原生 ML-KEM 插件构建（ADDON_DIR 提供源码时启用）
# ARG ADDON_DIR=
# RUN if [ -n "$ADDON_DIR" ] && [ -d "$ADDON_DIR" ]; then \
#       cp -r "$ADDON_DIR" addon && cd addon && npm install && npm run build; \
#     fi

# ---- 运行时 ----
FROM node:20.18.1-bookworm AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /opt/fibemate-full
COPY --from=build /opt/fibemate-full /opt/fibemate-full

COPY docker/nginx-fibemate.conf /etc/nginx/sites-enabled/fibemate.conf
COPY docker/docker-start.sh /opt/fibemate-full/docker/docker-start.sh
RUN chmod +x /opt/fibemate-full/docker/docker-start.sh

ENV NODE_ENV=production
EXPOSE 8080 8443
CMD ["/opt/fibemate-full/docker/docker-start.sh"]
