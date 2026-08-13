# PQC Sandbox — Docker 镜像系列 设计文档

**类型**：Docker 镜像（3 个）
**状态**：设计阶段
**优先级**：⭐⭐⭐⭐

---

## 1. 产品定位

三合一 Docker 镜像组合，覆盖教育、攻防、研究三大场景。一键 `docker-compose up` 即可拥有完整 PQC 实验环境。

---

## 2. 镜像 A：`fibemate/pqc-learn`（教育环境）

**目标用户**：学生、教师、自学者

```
docker run -p 8080:80 fibemate/pqc-learn
```

**包含内容**：
- 29 个可视化页面 → localhost:8080
- 文档中心 → localhost:8080/docs/
- Jupyter Notebook（PQC 交互式教程）
- 预装 `@noble/post-quantum` + `@noble/curves`

**Dockerfile 骨架**：
```
FROM nginx:alpine
COPY www/ /usr/share/nginx/html/
EXPOSE 80
```

---

## 3. 镜像 B：`fibemate/pqc-attack`（攻防沙盒）

**目标用户**：安全研究员、红队、学生

```
docker run -p 8080:80 -p 3000:3000 fibemate/pqc-attack
```

**包含内容**：
- VWZ 签名挑战目标（localhost:3000/vwz）
- LG v2.2 混淆目标 WASM（localhost:3000/lgv2/）
- 攻击工具预装：Frida、Angr、Python 攻击脚本
- 内置题目 + 提示系统

**⚠️ 安全声明**：容器网络隔离（`--network none` 可选），仅本地实验。

---

## 4. 镜像 C：`fibemate/pqc-bench`（性能基准）

**目标用户**：密码学工程师

```
docker run fibemate/pqc-bench --algorithm ML-KEM-768 --rounds 10000
```

**包含内容**：
- C Native Addon（AVX2 优化）
- WASM 模块（ml-kem / lgv2 / vwz）
- Node.js 纯 JS 参考实现
- 自动生成 benchmark report（JSON + Markdown）
- 与知名库对比（liboqs / @noble/post-quantum）

---

## 5. docker-compose 一键启动

```yaml
# docker-compose.yml
version: '3'
services:
  learn:
    image: fibemate/pqc-learn
    ports: ["8080:80"]
  attack:
    image: fibemate/pqc-attack
    ports: ["3000:3000"]
    network_mode: none  # 隔离
  bench:
    image: fibemate/pqc-bench
    profiles: ["bench"]
    command: ["--report", "/out/bench-report.json"]
    volumes: ["./out:/out"]
```

---

## 6. 与现有资产的关系

| 镜像 | 复用资产 |
|------|----------|
| learn | `www/` (29 可视化) + `docs/` (19 文档) |
| attack | `vwz-challenge/` + `experimental/vwz-lg/attack/` |
| bench | `packages/pqc-kem/native/` + `kat_results/` |

---

## 7. 实现细节（伪代码）

### 7.1 Dockerfile: `fibemate/pqc-learn`

```dockerfile
FROM nginx:alpine AS learn
LABEL org.fibemate.image="pqc-learn"
LABEL org.fibemate.version="3.3.0"

# 复制静态文件
COPY www/ /usr/share/nginx/html/

# 自定义 nginx.conf（CSP 放宽，允许 inline）
COPY docker/learn/nginx.conf /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

EXPOSE 80
```

### 7.2 Dockerfile: `fibemate/pqc-attack`

```dockerfile
FROM python:3.12-slim AS attack
LABEL org.fibemate.image="pqc-attack"
LABEL org.fibemate.warning="FOR LOCAL RESEARCH ONLY — NOT FOR PRODUCTION"

# 安装攻击工具
RUN pip install frida-tools angr pwntools

# 复制 VWZ 挑战 + LG 混淆目标
COPY vwz-challenge/ /app/vwz/
COPY experimental/vwz-lg/lg-v2.3/ /app/lgv2/
COPY experimental/vwz-lg/attack/ /app/attack/

# 启动 API 服务器（Node.js）
COPY docker/attack/server.js /app/
WORKDIR /app

EXPOSE 3000
CMD ["node", "server.js"]
```

### 7.3 Dockerfile: `fibemate/pqc-bench`

```dockerfile
FROM node:22-slim AS bench
LABEL org.fibemate.image="pqc-bench"

# 编译 C Native Addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY packages/pqc-kem/native/ /app/native/
WORKDIR /app/native
RUN node-gyp rebuild

# 复制基准测试脚本
COPY scripts/ntt-bench.js /app/
COPY scripts/kat-bench.js  /app/

# 入口
ENTRYPOINT ["node", "/app/kat-bench.js"]
CMD ["--rounds", "10000"]
```

### 7.4 docker-compose 完整版

```yaml
version: '3.8'

services:
  learn:
    build:
      context: .
      dockerfile: docker/learn/Dockerfile
    image: fibemate/pqc-learn:3.3.0
    ports: ["8080:80"]
    restart: unless-stopped
    read_only: true
    tmpfs: ["/var/cache/nginx", "/var/run"]
    security_opt: ["no-new-privileges:true"]

  attack:
    build:
      context: .
      dockerfile: docker/attack/Dockerfile
    image: fibemate/pqc-attack:3.3.0
    ports: ["3000:3000"]
    network_mode: none  # 强制网络隔离
    profiles: ["attack"]
    read_only: true
    tmpfs: ["/tmp"]

  bench:
    build:
      context: .
      dockerfile: docker/bench/Dockerfile
    image: fibemate/pqc-bench:3.3.0
    profiles: ["bench"]
    volumes: ["./bench-out:/out"]
    command: ["--report", "/out/bench-report.json", "--rounds", "10000"]
```

### 7.5 安全加固清单

| 措施 | 说明 |
|------|------|
| `read_only: true` | 容器文件系统只读 |
| `no-new-privileges` | 禁止提权 |
| `network_mode: none` (attack) | 攻击镜像完全断网 |
| `tmpfs` | 仅 `/tmp` 和必要目录可写 |
| `HEALTHCHECK` | 自动检测服务存活 |
| 禁用 root | Dockerfile 最后 `USER 1000` |
| `.dockerignore` | 排除 `node_modules/`、`target/`、`*.log` |

---

*冻结期状态：仅设计文档。8/31 后开发。*
