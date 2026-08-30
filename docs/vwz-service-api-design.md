# VWZ 独立服务化接口设计规范

**版本**: v1.0 | **日期**: 2026-08-12 | **状态**: 设计稿  
**目标**: 将 VWZ 签名方案封装为独立 CLI/HTTP API/Rust crate  
**基准实现**: `rust/vwz-sign-wasm/` (WASM), `scripts/vwz-148-test.js` (测试套件)

---

## 1. 设计目标

| 目标 | 优先级 | 说明 |
|------|:---:|------|
| **接口最小化** | P0 | 仅暴露 keygen/sign/verify 三原语 |
| **零外部依赖** | P0 | 纯 Rust 实现，无 OpenSSL/liboqs |
| **跨平台** | P0 | CLI (Linux/macOS/Windows), WASM (浏览器), C FFI |
| **KAT 集成** | P1 | 内建已知答案测试向量自检 |
| **安全标记** | P0 | 所有接口标注 "EXPERIMENTAL — NOT FOR PRODUCTION USE" |

---

## 2. CLI 接口

### 2.1 命令结构

```bash
vwz-sign <command> [options]

Commands:
  keygen        生成密钥对
  sign          签名消息
  verify        验证签名
  bench         性能基准测试
  kat           已知答案测试 (KAT)
  info          显示参数信息
  help          帮助信息
```

### 2.2 详细规格

#### keygen

```
vwz-sign keygen [--security-level <k>] [--seed <hex>] [--output <path>]

选项:
  --security-level, -k <2|4|8|16|32>    安全参数 (默认: 8)
  --seed <hex>                           确定性密钥生成种子 (可选)
  --output, -o <path>                    输出文件 (默认: stdout JSON)

输出JSON:
{
  "algorithm": "VWZ",
  "security_level": 8,
  "k": 8,
  "q": 3329,
  "public_key": "<base64>",
  "private_key": "<base64>",
  "public_key_size_bytes": 34,
  "private_key_size_bytes": 18,
  "seeded": false
}
```

#### sign

```
vwz-sign sign --message <file|-> --key <private_key_file> [--output <path>]

选项:
  --message, -m <file|->   消息文件 ("-" 为 stdin)
  --key, -k <path>          私钥文件
  --output, -o <path>       签名输出文件 (默认: stdout base64)
```

#### verify

```
vwz-sign verify --message <file> --signature <file> --key <pubkey_file>

选项:
  --message, -m <file>      消息文件
  --signature, -s <file>    签名文件
  --key, -p <path>          公钥文件

退出码:
  0 = 验证通过
  1 = 验证失败
  2 = 参数错误
```

#### bench

```
vwz-sign bench [--security-level <k>] [--iterations <n>] [--json]

输出 (--json):
{
  "algorithm": "VWZ",
  "k": 8,
  "iterations": 1000,
  "keygen_ms": { "mean": 0.12, "median": 0.11, "p99": 0.18 },
  "sign_ms":    { "mean": 0.08, "median": 0.07, "p99": 0.14 },
  "verify_ms":  { "mean": 0.05, "median": 0.04, "p99": 0.09 },
  "total_ms": 250.0,
  "ops_per_sec": 4000
}
```

#### kat

```
vwz-sign kat [--security-level <k>] [--output <path>]

功能: 运行内建 KAT 向量自检，返回通过/失败
退出码: 0 = 通过, 1 = 失败
```

---

## 3. HTTP API

### 3.1 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/vwz/keygen` | 生成密钥对 |
| `POST` | `/vwz/sign` | 签名消息 |
| `POST` | `/vwz/verify` | 验证签名 |
| `GET` | `/vwz/health` | 健康检查 |
| `GET` | `/vwz/bench` | 性能基准 |
| `GET` | `/vwz/info` | 算法信息 |

### 3.2 请求/响应格式

#### POST /vwz/keygen

```json
// Request
{
  "k": 8,                    // 安全参数 (2|4|8|16|32)
  "seed": "hex_string"       // 可选，确定性生成
}

// Response (200)
{
  "public_key": "base64...",
  "private_key": "base64...",
  "k": 8,
  "q": 3329,
  "pk_size": 34,
  "sk_size": 18
}
```

#### POST /vwz/sign

```json
// Request (multipart/form-data 或 JSON)
{
  "message": "base64_or_utf8",
  "private_key": "base64..."
}

// Response (200)
{
  "signature": "base64...",
  "sig_size": 18
}
```

#### POST /vwz/verify

```json
// Request
{
  "message": "base64_or_utf8",
  "signature": "base64...",
  "public_key": "base64..."
}

// Response (200)
{
  "valid": true
}
```

### 3.3 安全标头

所有响应均携带:
- `X-VWZ-Security: EXPERIMENTAL — NOT FOR PRODUCTION USE`
- `X-VWZ-Version: 2.0.0-alpha`

### 3.4 Rate Limiting

| 端点 | 限制 |
|------|------|
| `/vwz/keygen` | 1 req/s (密钥生成开销大) |
| `/vwz/sign` | 10 req/s |
| `/vwz/verify` | 100 req/s |
| `/vwz/bench` | 1 req/30s |

---

## 4. Rust Crate 接口

### 4.1 Cargo.toml

```toml
[package]
name = "vwz-sign"
version = "2.0.0-alpha"
edition = "2021"
description = "VWZ Vandermonde Sparse Signature Scheme — EXPERIMENTAL"

[lib]
name = "vwz_sign"
crate-type = ["lib", "cdylib"]

[dependencies]
rand = "0.8"
serde = { version = "1", features = ["derive"], optional = true }
wasm-bindgen = { version = "0.2", optional = true }

[features]
default = []
serde-support = ["serde"]
wasm = ["wasm-bindgen"]
```

### 4.2 核心 API

```rust
pub struct VwzKeypair {
    pub public_key: Vec<u16>,   // N = 2k+1 元素 (mod 3329)
    pub private_key: Vec<u16>,  // M = k+1 元素 (mod 3329)
    pub k: usize,               // 安全参数
}

pub struct VwzSignature {
    pub w2: Vec<u16>,           // M 元素
    pub w3: Vec<u16>,           // M 元素
    pub k: usize,
}

impl VwzKeypair {
    /// 生成随机密钥对
    pub fn generate(k: usize) -> Result<Self, VwzError>;

    /// 从种子确定性生成
    pub fn from_seed(k: usize, seed: &[u8; 32]) -> Result<Self, VwzError>;
}

impl VwzSignature {
    /// 签名消息
    pub fn sign(message: &[u8], private_key: &[u16], k: usize) -> Result<Self, VwzError>;

    /// 验证签名 (返回 true/false, 无错误泄漏)
    pub fn verify(message: &[u8], signature: &Self, public_key: &[u16]) -> bool;

    /// 序列化签名
    pub fn to_bytes(&self) -> Vec<u8>;

    /// 反序列化签名
    pub fn from_bytes(bytes: &[u8], k: usize) -> Result<Self, VwzError>;

    /// 序列化公钥
    pub fn public_key_to_bytes(&self) -> Vec<u8>; // 注意: 这里设计有歧义, 应该从 VwzKeypair 调用
}
```

### 4.3 错误类型

```rust
#[derive(Debug)]
pub enum VwzError {
    InvalidParameter(String),   // k 不在 {2,4,8,16,32}
    SerializationError,
    DeserializationError,
    SigningError,
    RandomnessError,
}
```

---

## 5. 序列化格式

### 5.1 公钥 (rank-1 压缩)

```
[2 bytes: k] [2 bytes: seed_hi] [2 bytes: seed_lo] [28 bytes: pad]
= 34 bytes (k=8)

注: seed 双射映射到 Vandermonde 投影向量 (N=17 元素)
```

### 5.2 私钥

```
[2 bytes: k] [2 bytes: seed] [8*2 bytes: w3_coeffs] [4 bytes: pad]
= 18 bytes (k=8)
```

### 5.3 签名

```
[2 bytes: k] [2 bytes: global_seed] [k*2 bytes: compact_w]
= 18 bytes (k=8)
```

---

## 6. 部署架构

```
┌─────────────────────────────────────────────────┐
│                    vwz-sign CLI                   │
│  (Rust binary, standalone, <2MB)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ keygen   │ │ sign     │ │ verify   │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│  ┌──────────┐ ┌──────────┐                      │
│  │ bench    │ │ kat      │                      │
│  └──────────┘ └──────────┘                      │
└──────────┬──────────┬──────────┬────────────────┘
           │          │          │
     CLI stdio    HTTP API   C FFI (cdylib)
           │          │          │
     DevOps/CI   微服务集成   嵌入式/IoT
```

### 6.1 构建目标

| 目标 | 方式 | 用途 |
|------|------|------|
| `vwz-sign` | `cargo build --release` | CLI 工具 |
| `libvwz_sign.so/dylib/dll` | `cargo build --lib` | C/Python FFI |
| `vwz_sign_bg.wasm` | `wasm-pack build` | 浏览器/Node.js |
| `vwz-sign:latest` | Dockerfile | HTTP API 微服务 |

---

## 7. 安全声明（必须嵌入所有输出）

```
╔═══════════════════════════════════════════════════════╗
║  ⚠️  VWZ IS EXPERIMENTAL RESEARCH CODE              ║
║                                                       ║
║  NOT AUDITED. NOT FOR PRODUCTION USE.                 ║
║  VMQ-SPARSE is a novel hardness assumption.           ║
║  The security of this scheme has not been             ║
║  independently verified.                              ║
║                                                       ║
║  Use only for research, benchmarking, and             ║
║  cryptographic analysis.                              ║
╚═══════════════════════════════════════════════════════╝
```

---

## 8. 阶段化实现计划

| 阶段 | 时间 | 产出 |
|:---:|------|------|
| **Phase 0 (当前)** | 8/31 前 | 本文档 + KAT 生成脚本 |
| **Phase 1** | 9 月 | Rust crate 核心 API (keygen/sign/verify) |
| **Phase 2** | 10 月 | CLI + C FFI |
| **Phase 3** | 11 月 | HTTP API + Docker |
| **Phase 4** | 12 月 | WASM + 浏览器 demo |
