# FIBEMATE ZK-SNARKs 部署指南

## 概述

本指南说明如何部署 FIBEMATE 的 ZK-SNARKs（零知识证明）认证系统。

## 文件清单

### 前端文件（浏览器）

| 文件 | 大小 | 说明 |
|:---|:---|:---|
| `src/zk-auth-poseidon.js` | 13KB | ZK 认证模块（v12） |
| `src/snarkjs.min.js` | 689KB | snarkjs 浏览器构建 |
| `src/test-poseidon-zk.html` | 10KB | 测试页面 |
| `circuits/build/identity_js/identity.wasm` | 1.7MB | 电路 WASM |
| `circuits/build/setup/identity_final.zkey` | 255KB | 证明密钥 |
| `circuits/build/setup/verification_key.json` | 2.7KB | 验证密钥 |

### 后端文件（Node.js）

| 文件 | 说明 |
|:---|:---|
| `src/server-main.js` | 主服务器入口 |
| `src/server-zk-snarks.js` | ZK 验证路由 |
| `src/server-nexus-api.js` | Nexus API 路由 |
| `src/server-nexus-ws.js` | WebSocket 服务器 |

## 部署步骤

### 1. 安装依赖

```bash
npm install express cors ws snarkjs
```

### 2. 复制电路文件

将以下文件复制到服务器目录：

```
circuits/build/identity_js/identity.wasm
circuits/build/setup/identity_final.zkey
circuits/build/setup/verification_key.json
```

### 3. 启动服务器

```bash
node src/server-main.js
```

服务器将启动在：
- HTTP: http://localhost:3001
- WebSocket: ws://localhost:3001/ws

### 4. 验证部署

访问测试页面：
```
http://localhost:3001/src/test-poseidon-zk.html
```

## API 端点

### ZK-SNARKs 认证

#### 注册
```http
POST /api/auth/register-zk-snarks
Content-Type: application/json

{
  "commitment": "0x...",
  "proof": {
    "pi_a": [...],
    "pi_b": [...],
    "pi_c": [...],
    "protocol": "groth16",
    "curve": "bn128"
  },
  "publicSignals": ["..."]
}
```

#### 登录
```http
POST /api/auth/login-zk-snarks
Content-Type: application/json

{
  "commitment": "0x...",
  "proof": { ... },
  "publicSignals": ["..."],
  "timestamp": 1234567890
}
```

#### 状态检查
```http
GET /api/auth/zk-snarks/status
```

## 测试

### 前端测试

1. 打开 `src/test-poseidon-zk.html`
2. 点击"生成承诺"测试 Poseidon 哈希
3. 点击"生成 ZK 证明"测试证明生成
4. 点击"验证 ZK 证明"测试验证
5. 点击"ZK 注册"测试完整流程

### 后端测试

```bash
curl http://localhost:3001/api/auth/zk-snarks/status
```

## 注意事项

1. **WASM 文件较大** (1.7MB)，首次加载需要一定时间
2. **内存要求**：生成证明需要约 500MB 内存
3. **浏览器支持**：需要 WebAssembly 支持（Chrome 57+, Firefox 52+, Safari 11+）
4. **HTTPS**：生产环境必须使用 HTTPS

## 故障排除

### snarkjs 未加载
- 检查 `src/snarkjs.min.js` 是否正确复制
- 检查浏览器控制台是否有加载错误

### 证明生成失败
- 检查 WASM 文件路径是否正确
- 检查 zKey 文件是否存在
- 确保有足够内存（500MB+）

### 验证失败
- 检查 verification_key.json 是否与电路匹配
- 确保 commitment 格式正确（64 hex 字符）

## 安全建议

1. **生产环境**应使用 PostgreSQL 替代内存存储
2. **JWT 密钥**应使用强随机值并定期轮换
3. **HTTPS**必须启用，防止中间人攻击
4. **Rate Limiting**应添加，防止暴力破解

## 性能优化

1. **WASM 缓存**：浏览器会自动缓存 WASM 文件
2. **zKey 压缩**：可以使用 gzip 压缩传输
3. **CDN**：静态文件可以使用 CDN 加速
