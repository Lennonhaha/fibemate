# FIBEMATE PQC Bench — 性能基准镜像
# 设计文档: docs/product-designs/08-pqc-docker.md §7.3
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

LABEL org.fibemate.image="pqc-bench"
LABEL org.fibemate.version="3.3.0"

# 编译 C Native Addon 所需
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# 复制 C Native 源码并编译
COPY packages/pqc-kem/native/ /app/native/
WORKDIR /app/native
RUN node-gyp rebuild

# 复制基准测试脚本
WORKDIR /app
COPY scripts/ntt-bench.js /app/
COPY scripts/kat-bench.js  /app/
COPY tools/ntt-benchmark/ /app/ntt-benchmark/

# 非 root
RUN useradd -m -u 1000 benchuser
USER benchuser

ENTRYPOINT ["node", "/app/ntt-benchmark/bin/ntt-bench.js"]
CMD ["run", "--rounds", "10000"]
