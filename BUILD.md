# BUILD.md — FIBEMATE 构建与部署指南

**版本**: v3.1-preview | **更新**: 2026-07-06

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
