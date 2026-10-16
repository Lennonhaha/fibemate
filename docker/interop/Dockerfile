# =============================================================================
# FIBEMATE Interop — 一键互操作复现镜像（P2.1）
#
# 方案:   plans/P2镜像方案_20261016.md（workspace）
# 先例:   docker/bench/Dockerfile（同系列镜像 idiom：摘要钉死 + 非 root + ENTRYPOINT/CMD）
#
# 目的：让陌生人用一条命令复现 ML-KEM-768 跨实现互操作结论，并产出带 SHA256 的报告。
#
#   docker build -f docker/interop/Dockerfile -t fibemate-interop . \
#     && docker run --rm -v "$PWD/interop-out:/report" fibemate-interop run --rounds 1000
#
# 钉死清单（可复现性 —— 每一条都是「防漂移」）：
#   - base 镜像 : 摘要钉死（与 docker/bench 同一 base）
#   - liboqs    : tag 0.12.0 + commit 双向核对（构建期断言，不符即失败）
#   - oqs_gen   : 仓内 scripts/oqs_gen.c，编译命令逐字照
#                 .github/workflows/nightly-phase2.yml:119
#   - 安装前缀  : /usr/local（默认动态库搜索路径）⇒ 无需 LD_LIBRARY_PATH
#                 （结构性消灭 scripts/liboqs-10000.cjs 原先的 /opt 硬编码）
#   - 只编用到的算法: -DOQS_MINIMAL_BUILD=KEM_ml_kem_768
#     ⚠️ 0.12.0 的 CMakeLists 里**没有** OQS_ALGS_ENABLED（仓内 BUILD.md:166 用的是旧变量）；
#     且 CMake 对不认识的 -D 变量只会警告后**静默忽略**（退化成编全部算法）
#     ⇒ 故配一条构建期断言 ASSERT_MINIMAL，见 stage 1 末尾。
#
# 已知先后顺序（非缺陷）：ENTRYPOINT 指向 scripts/interop/run.mjs（P2.2）。
#   在 P2.2 落地前，镜像可构建，但 `run` 会报模块缺失；
#   此间可用现有脚本驱动：docker run --rm <img> node scripts/liboqs-10000.cjs
# =============================================================================

# ---- stage 1: 构建并安装 liboqs（仅 ML-KEM-768） ----------------------------
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS liboqs

ARG LIBOQS_TAG=0.12.0
# 0.12.0 的 tag 指向的 commit（2026-10-16 由 GitHub 公开 API 解析：
#   https://api.github.com/repos/open-quantum-safe/liboqs/git/refs/tags/0.12.0
# 构建期会强制核对，钉错则失败）
ARG LIBOQS_COMMIT=f4b96220e4bd208895172acc4fedb5a191d9f5b1
# 只编用到的算法。0.12.0 的合法旋钮是 OQS_MINIMAL_BUILD；值格式与 OQS_ENABLE_* 变量名
# 逐字对应（.CMake/alg_support.cmake 的 filter_algs() Case 2 为精确匹配）。
ARG OQS_MINIMAL_BUILD=KEM_ml_kem_768
# 构建期断言「该旋钮确实生效」。若 strings 判据在本机不适用，可 --build-arg ASSERT_MINIMAL=0 关闭。
ARG ASSERT_MINIMAL=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake ninja-build libssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    git clone --depth 1 -b "${LIBOQS_TAG}" https://github.com/open-quantum-safe/liboqs /src/liboqs; \
    cd /src/liboqs; \
    test "$(git rev-parse HEAD)" = "${LIBOQS_COMMIT}" \
      || { echo "FATAL: liboqs ${LIBOQS_TAG} -> $(git rev-parse HEAD) 与钉死 ${LIBOQS_COMMIT} 不符"; exit 1; }; \
    cmake -GNinja -B build \
        -DBUILD_SHARED_LIBS=ON \
        -DOQS_BUILD_ONLY_LIB=ON \
        -DOQS_MINIMAL_BUILD="${OQS_MINIMAL_BUILD}" \
        -DCMAKE_INSTALL_PREFIX=/usr/local; \
    ninja -C build -j"$(nproc)"; \
    ninja -C build install; \
    ldconfig; \
    strings /usr/local/lib/liboqs.so | grep -q 'ML-KEM-768'; \
    if [ "${ASSERT_MINIMAL}" = "1" ] && strings /usr/local/lib/liboqs.so | grep -q 'Classic-McEliece'; then \
      echo "FATAL: OQS_MINIMAL_BUILD 未生效（liboqs 仍编入其它算法族）—— 核对值格式，或显式 --build-arg OQS_MINIMAL_BUILD="; \
      exit 1; \
    fi; \
    echo "${LIBOQS_COMMIT}" > /liboqs.commit

# ---- stage 2: 运行镜像 ------------------------------------------------------
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

LABEL org.fibemate.image="pqc-interop" \
      org.fibemate.version="3.3.0" \
      org.opencontainers.image.source="https://github.com/Lennonhaha/fibemate"

# liboqs 运行期构件（gcc 阶段编译 oqs_gen 需要头文件与 -lcrypto）
COPY --from=liboqs /usr/local/lib/liboqs.so* /usr/local/lib/
COPY --from=liboqs /usr/local/include/oqs /usr/local/include/oqs
COPY --from=liboqs /liboqs.commit /liboqs.commit

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc libc6-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && ldconfig

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY scripts/ ./scripts/
COPY packages/pqc-kem/src/ ./packages/pqc-kem/src/
COPY packages/pqc-kem/test/kat/ ./packages/pqc-kem/test/kat/

# 逐字照 .github/workflows/nightly-phase2.yml:119，并做一次构建期冒烟（keygen 必须成功）
RUN gcc -O2 -o scripts/oqs_gen scripts/oqs_gen.c -l oqs -lcrypto \
    && ./scripts/oqs_gen keygen > /dev/null

# 非 root 运行；报告目录固定 /report（由 -v 挂载进来）
RUN useradd -m -u 1000 interop \
    && mkdir -p /report \
    && chown interop:interop /report
USER interop

ENV NODE_ENV=production

ENTRYPOINT ["node", "scripts/interop/run.mjs"]
CMD ["run", "--rounds", "1000", "--out", "/report"]
