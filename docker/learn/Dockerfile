# FIBEMATE PQC Learn — 教育环境镜像
# 设计文档: docs/product-designs/08-pqc-docker.md §7.1
FROM nginx:alpine@sha256:1ed1b0e1d7652937d6cbdaf4018c7b6fc009a7dd6c3047351e2eddda745de43f

LABEL org.fibemate.image="pqc-learn"
LABEL org.fibemate.version="3.3.0"

# 复制静态文件（29 可视化 + 文档）
COPY www/ /usr/share/nginx/html/

# 自定义 nginx.conf（CSP 放宽，允许 inline script）
COPY docker/learn/nginx.conf /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

# 非 root 运行
USER nginx

EXPOSE 80
