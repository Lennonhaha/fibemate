# BUILD.md — FIBEMATE 构建与部署指南

**版本**: v3.3-preview | **更新**: 2026-07-14

---

## 系统要求

| 组件 | 最低版本 | 推荐版本 |
|------|---------|---------|
| **操作系统** | Ubuntu 20.04 / Windows 10 / macOS 12 | Ubuntu 24.04 |
| **Node.js** | 18.0 | 22.x (v22.21 LTS) |
| **npm** | 9.0 | 10.x |
| **GCC** | 9.0 | 13.x |
| **CMake** | 3.20 | 3.28 |
| **OpenSSL** | 3.0 (仅 TLS 混合握手) | 3.0.13 |
| **Rust** | 1.70 (仅 VWZ/LookingGlass WASM) | 1.80 |
| **Vivado** | 2023.1 (仅 FPGA 综合) | 2024.x |

---

## 一、基础构建

### 1.1 克隆

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
```

### 1.2 Node.js 依赖

```bash
npm install
```

核心依赖：
- `express` — Web 框架
- `better-sqlite3` — 嵌入式数据库
- `@noble/curves`, `@noble/post-quantum` — 纯 JS 密码后端 (fallback)
- `node-addon-api` — C Native 插件接口

### 1.3 C Native 插件

```bash
cd addon
npm install
cd ..
```

编译产物: `addon/build/Release/mlkem.node`

验证:
```bash
node -e "const m=require('./addon/build/Release/mlkem.node'); \
  const kp=m.keygen(); console.log('ML-KEM-768 OK, pk:', kp[0].length, 'bytes')"
# 预期输出: ML-KEM-768 OK, pk: 1184 bytes
```

---

## 二、开发服务启动

### 2.1 开发模式

```bash
npm start
# 或直接:
node src/index.js
```

服务监听: `http://localhost:3001`

### 2.2 API 验证

```bash
# 健康检查
curl http://localhost:3001/api/health

# PQC 混合握手状态
curl http://localhost:3001/api/pqc-hybrid/status
# → {"enabled":true,"algorithm":"SM2+ML-KEM-768","version":"c2-sm2-mlkem-hybrid"}

# 混合握手初始化
curl -H 'X-TLS-Session-Id: test-session' http://localhost:3001/api/pqc-hybrid/init
```

---

## 三、生产部署

### 3.1 PM2 进程管理

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 开机自启
pm2 save
pm2 startup
```

`ecosystem.config.js` 配置:
```js
module.exports = {
  apps: [{
    name: 'fibemate',
    script: 'src/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

### 3.2 Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name fibemate.net;

    ssl_certificate     /etc/letsencrypt/live/fibemate.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fibemate.net/privkey.pem;

    # PQC 混合握手 (需要 oqs-provider)
    ssl_ecdh_curve X25519MLKEM768:prime256v1;

    # 转发 TLS Session ID 给 Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header X-TLS-Session-Id $ssl_session_id;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }

    # 静态资源
    location / {
        root /opt/fibemate-full/www;
        try_files $uri $uri/ /index.html;
        gzip_static on;
    }
}
```

### 3.3 TLS 混合握手（路径 A）

```bash
# 安装 liboqs + oqs-provider (一次性)

> **⚠️ 状态**: 编译链就绪但 nginx 接线未完成。本节为技术参考，
> 生产环境尚未启用 X25519MLKEM768。待 nginx 重编译后更新。

cd /tmp
git clone --depth 1 -b 0.12.0 https://github.com/open-quantum-safe/liboqs
cd liboqs && mkdir build && cd build
cmake -GNinja -DCMAKE_INSTALL_PREFIX=/opt/liboqs -DOQS_ALGS_ENABLED=ML_KEM_768 ..
ninja && ninja install

git clone --depth 1 -b 0.11.0 https://github.com/open-quantum-safe/oqs-provider
cd oqs-provider
cmake -GNinja -DCMAKE_INSTALL_PREFIX=/usr -DOPENSSL_ROOT_DIR=/usr ..
ninja && ninja install

# 配置 OpenSSL
echo 'providers = provider_sect
[provider_sect]
default = default_sect
oqsprovider = oqsprovider_sect
[default_sect]
activate = 1
[oqsprovider_sect]
activate = 1' > /opt/oqs/openssl.cnf

# systemd 注入
mkdir -p /etc/systemd/system/nginx.service.d
echo '[Service]
Environment=OPENSSL_CONF=/opt/oqs/openssl.cnf' > /etc/systemd/system/nginx.service.d/override.conf

systemctl daemon-reload && systemctl restart nginx
```

验证:
```bash
openssl s_client -groups X25519MLKEM768 -connect fibemate.net:443 </dev/null | grep -E 'key_share|Cipher'
```

---

## 四、WASM 构建

### 4.1 VWZ 签名 (Rust → WASM)

```bash
cd rust/vwz-sign-wasm
wasm-pack build --target web
# 产物: pkg/vwz_sign_wasm_bg.wasm (~96KB, gzip ~46KB)
```

### 4.2 LookingGlass v2 (等变 LWE)

```bash
cd rust/lg-v2-wasm
wasm-pack build --target web
# 产物: pkg/lg_v2_wasm_bg.wasm (~18KB, gzip <5KB)
```

---

## 五、FPGA 综合

```bash
# 打开 Vivado 项目
vivado -mode tcl -source scripts/build_fpga_v5.tcl

# 烧录
vivado -mode tcl -source scripts/program_fpga.tcl
```

所需 RTL 文件:
- `rtl/ntt_core_pipe2.v` — NTT 7 级流水线
- `rtl/hw_monitor.v` — 硬件故障检测 (L9)
- `rtl/lfsr256_prng.v` — 256-bit Galois LFSR
- `rtl/vwz/vwz_lambda_rom.v` — VWZ BRAM ROM

---

## 六、测试

### 6.1 核心密码测试

```bash
# ML-KEM-768 KAT (10000 次)
node test/ml-kem-768-kat.js

# SM2 TVLA (N=10000, 高阶 1-4)
node test/sm2-tvla-suite.js

# 混合握手 E2E
node test/pqc-hybrid-test.js

# 全量回归
node test/test-all.js
```

### 6.2 浏览器测试

```bash
cd www/crypto
# 启动本地 HTTP 服务器
npx http-server -p 8080

# 浏览器打开:
# - http://localhost:8080/test-ml-kem-kat.html    (ML-KEM KAT)
# - http://localhost:8080/pqc-hybrid-e2e.html     (混合握手 E2E)
```

### 6.3 FPGA 仿真

```bash
cd rtl
iverilog -o ntt_tb.vvp ntt_core_pipe2.v ntt_tb.v
vvp ntt_tb.vvp
# 预期: 256/256 words match
```

---

## 常见问题

### Q: C Native 插件编译失败？

检查 `node-addon-api` 和 `node-gyp`:
```bash
npm install -g node-gyp
cd addon && node-gyp rebuild
```

### Q: ML-KEM KAT 不通过？

KAT 向量来自 NIST ACVP 服务器。确保使用正确的实现版本:
```bash
node -e "console.log(require('./www/crypto/ml-kem-768.js').version)"
```

### Q: TLS 混合握手不生效？

1. 确认 OpenSSL ≥ 3.0: `openssl version`
2. 确认 oqs-provider 正确安装: `openssl list -providers | grep oqs`
3. 确认 nginx 重新加载: `systemctl restart nginx`

---

## 安全部署建议

1. **不要在生产环境启用实验模块** (LookingGlass/VWZ)
2. **定期更新** Let's Encrypt 证书 (certbot auto-renew)
3. **监控** PM2 内存使用 (`pm2 monit`)
4. **备份** TSA 时间戳文件定期同步至离线存储
5. **防火墙** 仅开放 443 (HTTPS)，限制 SSH 至白名单 IP

---

*更多技术细节见项目 README.md 及各模块源码注释。*




## CI/CD 流水线

三组 GitHub Actions 工作流：

### CI (push / PR → master)

| 作业 | 内容 | 耗时 |
|------|------|------|
| node-test | Keccak + FIBEMATE + 跨语言单元测试 | ~2 min |
| rust-check | pq-wasm Cargo check (wasm32 target) | ~3 min |
| docs-check | Markdownlint + 死链扫描 | ~1 min |

### Nightly (每日 06:00 UTC)

- 跨语言一致性验证 (JS ↔ Rust)
- KAT 正确性烟雾测试
- SM2 TVLA 抽样 (N=500, 需手动启用)
- STM32 C 编译检查

### Release (手动触发 / tag push v*)

- 全量测试 (4 套)
- SHA256 文件校验和清单
- 工件上传

> 当前 TVLA N=5,000 / 10,000 和 FPGA 仿真因 Runner 资源限制不在 CI 中运行，保留为本地验证。

---

## 开源前置脱敏扫描

在每次公开推送前执行：

```bash
# 1. 检查是否有真实生产配置被 track
git ls-files ecosystem.config.js nginx.conf .env

# 2. 硬编码内网 IP / 端口
grep -rn '8\.156\.77\.68\|3001\|3443' src/ --include='*.js'

# 3. 绝对路径泄露
grep -rn 'E:/fpga\|D:/FIBEMATE\|C:/Users' src/ www/docs/ --include='*.js' --include='*.md'

# 4. 秘密/密钥字段
grep -rni 'password\|secret\|api\.key\|auth\.token' src/ --include='*.js' --include='*.json'

# 5. PM2 真实配置
grep -c 'ecosystem\.config\.js' .gitignore  # 应为 1
```

---

## Docker 部署

本项目提供基础部署镜像，覆盖静态站点与子服务，便于标准化交付与评审。

### 构建镜像
`bash
docker build -t fibemate:local .
# 或
docker compose build
`

### 运行
`bash
docker compose up -d
# 访问 http://localhost:8080
`
端口：8080 = HTTP 静态+反代；8443 = HTTPS（需自行挂载证书或前置 TLS 终结）。

### 容器内服务拓扑
- **nginx** : 8080 提供 www/ 静态资源，并反代 /api /ws /health → 3002，/v1 → 3001
- **www/src/server-main.js** : 3002（Web / ZX 服务）
- **reg-server/server.js** : 3080（WS）/ 3081（health）
- **src/index.js**（noir-backend）: 3001 —— 依赖原生 ML-KEM 插件 addon/build/Release/mlkem.node

### 已知约束
- 主 API（3001）依赖原生 ML-KEM 插件，该插件源码当前**未纳入本仓库**；默认镜像中 3001 不启动（docker-start.sh 会打印警告并继续）。如需 3001，在构建期通过 ADDON_DIR 提供源码并构建（见 Dockerfile 注释）。
- 持久化（数据库 / 上传）需自行挂载卷（参考 docker-compose.yml 注释）。

---

## TSR 时间戳存证验证

所有重要产物均通过 DigiCert RFC3161 TSA 存证，形式为 .tsr + .tsq + .sha256 三元组。第三方拿到仓库后可一键复现验证其完整性与时间戳有效性。

### 验证脚本
- scripts/verify-tsr.sh —— Bash，需 openssl，可选 sha256sum
- scripts/verify-tsr.js —— Node，跨平台，用 Node crypto 做文件完整性校验

### 用法
`bash
# Bash
./scripts/verify-tsr.sh www/docs/tsa digicert-certs/digicert-tsa-chain.pem

# Node（跨平台）
node scripts/verify-tsr.js www/docs/tsa digicert-certs/digicert-tsa-chain.pem
`

### 两层验证
1. **签名层**：openssl ts -verify -in <f>.tsr -queryfile <f>.tsq -CAfile digicert-certs/digicert-tsa-chain.pem —— 确认由 DigiCert TSA 合法签署。
2. **绑定层**：令牌的 messageImprint 必须等于 .sha256 清单哈希（且与该 .tsq 请求哈希一致）—— 无需 CA 即可证明令牌精确绑定到清单内容。

### CA 链
digicert-certs/digicert-tsa-chain.pem 含 DigiCert 2025 TSA 完整链（leaf + 中间 + 根）。历史早期时间戳（2026-05 / 06 由 FreeTSA 或 DigiCert 早期证书签发）需对应时期的 CA 链，不在本仓库内，故对这些旧 .tsr 的 	s -verify 会 FAIL —— 这**不代表时间戳无效**，仅表示验证链未随仓库分发。

### 已知可复现性缺口
- 部分 .tsr 的 .sha256 清单所引用的原始文件，在后续提交中被修改过，导致「文件完整性」校验 FAIL（例如 lg-074 对应的 fpga-l8l9-43-tests_2026-07-15.md）。时间戳本身有效且精确绑定到生成时的哈希；该 FAIL 仅说明**当前仓库中的文件已非被时间戳的字节**。如需严格字节级复现，应冻结被时间戳文件或将其纳入存证归档目录随仓库分发。

## 可复现构建与版本锁定（消除隐性版本差异）

本项目通过以下手段消除「隐性版本差异」（npm 浮动版本、未锁版本、Node/Rust/Vivado 差异、全局依赖、原生编译环境、WASM 构建环境等）：

### 1. Node.js 版本固定
- `.nvmrc` 固定为 `20`（LTS）。CI 通过 `actions/setup-node` 的 `node-version-file: .nvmrc` 读取，确保本地/CI 一致。
- 所有 `package.json` 的 `engines` 约束（mixnet `>=20`、www `>=16`）均被 Node 20 满足。

### 2. npm 依赖精确锁定
- 所有 `dependencies` / `devDependencies` / `overrides` 均已去除 `^` / `~`，钉为**精确版本**（不再自动升级补丁/小版本）。
- `package-lock.json` 已提交到 git（root / www / reg-server / mixnet / mixnet/{entry,exit,middle}）。
- 安装统一使用 `npm ci`（严格按 lock 安装，不做版本推断）。**禁止** `npm install` 用于 CI/生产。
- 顶层 `overrides` 已精确钉定（`jsonpath`、`bfj`），用于约束传递依赖。
- 审计：`npm audit --production`（CI 归档为 artifact）。

### 3. lockfile 同步强制校验
- `scripts/reproduce-build.sh` 对每个子项目执行 `npm ci --dry-run`，一旦 lock 与 package.json 不一致立即报错退出。
- CI（`.github/workflows/ci.yml`）在每次 push/PR 强制跑该校验，从机制上阻断「改了 package.json 却忘了更新 lock」导致的隐性漂移。

### 4. Rust / 原生插件锁定
- `research/lgv2/rust/Cargo.lock` 已提交；构建用 `cargo build --locked` 强制遵循 lock。
- 原生 C 插件（better-sqlite3 / node-addon-api / ML-KEM addon）需 Linux 编译工具链（build-essential + python3），Dockerfile 与 CI 均已预装。

### 5. WASM 构建产物校验
- WASM 工具链版本固定（wasm-pack / emscripten 固定版本，写入构建脚本）。
- 产物 sha256 存于 `docs/wasm-checksums.txt`，`scripts/reproduce-build.sh` 通过 `sha256sum -c` 比对，发现差异即报错。
- 当前归档：`www/crypto/lgv2/lookingglass_v2_bg.wasm`。

### 6. Docker 全环境锁定
- `Dockerfile` 基础镜像钉为 `node:20.18.1-bookworm`（精确 tag，不用 `node:latest`）。
- 多阶段构建：`npm ci` 安装 → 拷贝产物 → nginx 提供静态站 + 反代子服务。
- 建议部署镜像打固定 tag（如 `fibemate:v3.3.0`）并推送到 `ghcr.io`，后续部署直接用镜像，不在本地重新编译。

### 7. FPGA / Vivado 环境锁定
- Vivado 版本固定并记录于 FPGA 文档；综合/仿真/约束脚本（`.tcl`）与 `impl_constraints.xdc` 全部提交，保证可复现综合与时序报告，不依赖图形界面工程文件。

### 8. 操作系统与全局环境
- 不依赖全局 npm 包 / 全局工具（pm2、vivado 全局脚本），改用 npx / 本地 `node_modules/.bin`。
- `.gitattributes` 统一换行符（`* text=auto eol=lf`），所有文本 UTF-8 无 BOM。
- 避免硬编码绝对路径/本机用户名（已用 `__dirname` 修复）。
- CI 固定 `ubuntu-22.04`，避免跨系统差异。

### 9. 钉定时的已知决策（偏离「统一降级」模板之处）
- **mixnet/{entry,exit,middle} 保留 `express@5.2.1`**（express 5.x 为这些组件有意采用；强制降到 4.x 属破坏性变更，会使 mixnet 编译/运行失败）。root/www/mixnet 主包钉 `express@4.21.2`。
- **`@noble/*` 保留 2.x**（`@noble/curves@2.2.0`、`@noble/post-quantum@0.6.1`、`@noble/hashes@2.2.0`）。1.x → 2.x 是破坏性 API 变更，强降会导致 ZK/PQC 代码编译失败。
- 以上两者均为「保代码可用」的有意决策，非遗漏。

### 10. 验证方法
在两台干净环境（新 Ubuntu 容器 + 本地）执行：
```bash
node -v            # 应为 v20.x（与 .nvmrc 一致）
bash scripts/reproduce-build.sh   # lock 同步 + WASM 校验和
npm ci && npm test               # 安装并跑测试
```
- ✅ 全部通过、校验和一致 = 无隐性版本差异。
- ❌ 失败/校验和不一致 = 仍存在浮动依赖或环境差异，需先 `npm install --package-lock-only` 重建 lock 再提交。
