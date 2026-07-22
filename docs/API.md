# FIBEMATE API 参考

> 版本: v3.3 | 最后更新: 2026-07-22

## 1. ML-KEM-768 — 后量子密钥封装 (NTT 域, FIPS 203)

```bash
node -e "const { generateKeypair, encapsulate, decapsulate } = require('./packages/pqc-kem/src/ml-kem-768.js');"
```

### 1.1 generateKeypair()

生成一次性 ML-KEM-768 密钥对（非确定性）。

```js
const { generateKeypair } = require('./packages/pqc-kem/src/ml-kem-768.js');
const kp = generateKeypair();
// => { publicKey: <Uint8Array 1184B>, secretKey: <Uint8Array 2400B> }
```

| 字段 | 长度 (bytes) | 说明 |
|:---|:---|:---|
| publicKey | 1184 | ek = t (NTT 域多项式向量) + ρ (32B 种子) |
| secretKey | 2400 | dk = sk (NTT 域多项式向量) + h(ek) + ek + … |

- 安全等级: NIST Category 1 (≈128-bit 经典 / ≈64-bit 量子)
- 认证: ✅ NIST FIPS 203
- 验证: ✅ Noble 200/200 | ✅ liboqs 10000/10000

### 1.2 encapsulate(publicKey)

Alice 使用 Bob 的公钥封装共享密钥。

```js
const { encapsulate } = require('./packages/pqc-kem/src/ml-kem-768.js');
const bobKp = generateKeypair();
const { ciphertext, sharedSecret } = encapsulate(bobKp.publicKey);
// => ciphertext: <Uint8Array 1088B>, sharedSecret: <Uint8Array 32B>
```

- 参数: `publicKey` — 长度为 1184 的 Uint8Array
- 返回: `{ ciphertext, sharedSecret }`
  - ciphertext: 1088B
  - sharedSecret: 32B (SHA3-256(K_bar || H(ciphertext)))

### 1.3 decapsulate(secretKey, ciphertext)

Bob 解封 Alice 发送的密文，获得相同的共享密钥。

```js
const { decapsulate } = require('./packages/pqc-kem/src/ml-kem-768.js');
const bobKp = generateKeypair();
const { ciphertext, sharedSecret } = encapsulate(bobKp.publicKey);
const recovered = decapsulate(bobKp.secretKey, ciphertext);
// recovered === sharedSecret (如果密文正确)
```

- 参数: `secretKey` (2400B), `ciphertext` (1088B)
- 返回: `sharedSecret` (32B Uint8Array)
- ⚠ 参数顺序: `(secretKey, ciphertext)` — 不同于某些库的 `(ct, sk)`

### 1.4 polyMulNTT(a, b)

NTT 域多项式乘法（BaseCaseMultiply）。`a`, `b` 均为 NTT 域多项式（Int16Array 256）。

### 1.5 底层基元

| 函数 | 用途 |
|:---|:---|
| ntt(f) / intt(f) | NTT / iNTT (DIT/DIF, 7 层蝴蝶) |
| byteEncode(f, d) / byteDecode(data, d) | FIPS 203 整数编码 (d∈{1,2,4,10,11,12}) |
| compress(f, d) / decompress(g, d) | 系数压缩/解压 |
| cbd2(buf) | 中心二项分布 (η=2) |
| sampleNTT(seed) | 拒绝采样 NTT 多项式 (SHAKE-128) |
| sha3_256 / sha3_512 / shake128 / shake256 | Keccak 系列哈希 |

---

## 2. SM2 — 国密椭圆曲线

### 2.1 SM2 密钥生成

```js
import { genKeyPair } from './packages/sm2/src/sm2.js';
const { publicKey, privateKey } = genKeyPair();
```

### 2.2 SM2 签名

```js
import { sign, verify } from './packages/sm2/src/sm2.js';
const keypair = genKeyPair();
const signature = sign(hashValue, keypair.privateKey);
const isValid = verify(hashValue, signature, keypair.publicKey);
```

**安全增强 (P0-03a):**
- k-masking: `k' = k + r·N` (320-bit 随机掩码)
- modInv: 费马小定理 `a^(N-2)` 替代扩展欧几里得
- TVLA: N=5000 |t|<5 ✅

### 2.3 SM4 对称加密

```js
import { sm4Encrypt, sm4Decrypt } from './packages/sm4/src/sm4.js';
const ciphertext = sm4Encrypt(plaintext, key);
const recovered = sm4Decrypt(ciphertext, key);
// => recovered === plaintext
```

- 密钥长度: 16 bytes (128-bit)
- 分组长度: 16 bytes

---

## 3. MessageCrypto — 端到端加密 (E2EE)

### 3.1 SM2-SM4 混合加密

```js
import { encryptWithSM2, decryptWithSM2 } from './www/crypto/message-gm.js';
const recipientPubKey = '04...'; // SM2 公钥 (130 hex chars)
const encrypted = encryptWithSM2('Hello', recipientPubKey);
const decrypted = decryptWithSM2(encrypted, recipientPrivateKey);
```

### 3.2 ML-KEM + SM4 混合加密

```js
import { encryptWithMLKEM, decryptWithMLKEM } from './www/crypto/message-gm.js';
const encrypted = encryptWithMLKEM('Hello', mlkemRecipientPublicKey);
const decrypted = decryptWithMLKEM(encrypted, mlkemRecipientSecretKey);
```

### 3.3 IndexedDB 密钥存储

```js
import { KeyStorage } from './www/crypto/key-storage.js';
const ks = new KeyStorage();
await ks.saveIdentityKey(publicKey, privateKey);
const keys = await ks.getIdentityKey();
```

---

## 4. Registration Server — WebSocket 协议 (IANA #4590)

```bash
node reg-server/server.js [port]   # 默认 ws://0.0.0.0:3080
```

### 4.1 基础协议

| 类型 | 方向 | 参数 | 返回 |
|:---|:---|:---|:---|
| register | C→S | username, identityKey | { ok, userId } |
| upload-opk | C→S | userId, opks[] | { ok, count } |
| fetch-opk | C→S | userId | { ok, opk } |
| send | C→S | from, to, ciphertext | { ok } |
| poll | C→S | userId | { ok, messages[] } |
| whoami | C→S | userId | { ok, userId, username } |
| lookup | C→S | username | { ok, userId, username, identityKey } |

### 4.2 IANA #4590 E2E 扩展

| 类型 | 方向 | 说明 |
|:---|:---|:---|
| e2e-init | C→S | 发起 ML-KEM 握手 (keyShare) |
| e2e-respond | C→S | Bob 用 keyShare + ML-KEM 封装回复 |
| e2e-poll | C→S | Alice 轮询 handshake 响应 |
| e2e-msg | C→S | 发送 E2E 加密消息 |
| e2e-fetch | C→S | 获取 E2E 消息 |

### 4.3 Health Check

```
GET http://0.0.0.0:3081/health
=> { ok: true, users: 42, totalOpks: 128, uptime: 3600, iana4590: true }
```

---

## 5. 浏览器端全局 API

在浏览器中，访问 `https://fibemate.net` 后以下 API 挂载在 `window` 上:

### 5.1 ML-KEM 模块

```js
window.MLKEM768
  .keygen()          // => { publicKey, secretKey }
  .encapsulate(pk)   // => { ciphertext, sharedSecret }
  .decapsulate(sk, ct) // => sharedSecret
```

### 5.2 消息加密

```js
window.MessageCrypto
  .encrypt(plaintext, recipientPublicKey)   // => ciphertext
  .decrypt(ciphertext, recipientPrivateKey)  // => plaintext
```

### 5.3 SM2/SM4 国密

```js
window.SM2.encrypt(message, pubKey, mode)
window.SM4.encrypt(message, key)
```

### 5.4 Tauri Desktop 命令

在 Tauri v2 桌面端，以下 IPC 命令可用:

```
cmd: mlkem768_keygen | mlkem768_encapsulate | mlkem768_decapsulate
cmd: sm2_keygen | sm2_sign | sm2_verify | sm2_encrypt | sm2_decrypt
cmd: sm4_encrypt | sm4_decrypt
```

---

## 6. 数据维度速查

| 数据项 | 大小 |
|:---|:---|
| ML-KEM-768 公钥 (ek) | 1,184 B |
| ML-KEM-768 私钥 (dk) | 2,400 B |
| ML-KEM-768 密文 | 1,088 B |
| ML-KEM-768 共享密钥 | 32 B |
| SM2 公钥 (压缩) | 33 B |
| SM2 公钥 (非压缩) | 65 B |
| SM2 签名 | 64 B |
| SM4 密钥 | 16 B |
| SM3 哈希 | 32 B |
| VWZ k=8 公钥 (稀疏压缩) | 468 B |
| VWZ k=8 签名 | 36 B |
| WebSocket 消息头 | ~4 B (JSON) |

---

## 7. 验证与测试

```bash
# ML-KEM 自洽
node scripts/kat-10000.js

# liboqs 交叉验证
node scripts/noble-liboqs-xcross.mjs

# Noble 交叉验证
node scripts/vwz-148-test.js

# SM2 TVLA
node scripts/test-sm2-node-fix.js

# FPGA 测试
node scripts/fpga-l8l9-43-test.js
```

---

> 完整安全模型见 [docs/THREAT_MODEL.md](./THREAT_MODEL.md) | 设计决策见 [docs/design-decisions.md](./design-decisions.md)
