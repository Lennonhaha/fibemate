# FIBEMATE 前端密码学模块清单 & API 文档

> 生成时间: 2026-06-25 · 目标: React Native 复用评估

## 模块总览

| 模块 | 文件 | 大小 | RN 复用 | 核心依赖 |
|:---|:---|:---|:---:|:---|
| SM2EC | sm2-ec-browser.js | 11KB | ⚠️ | crypto.getRandomValues, BigInt |
| SM3Hash | sm3-browser.js | 8KB | ✅ | 纯 JS, BigInt |
| SM4GCM | sm4-browser.js | 15KB | ✅ | 纯 JS (Web Crypto AES-GCM 选项) |
| SM2 (上层) | sm2-bridge.js | 10KB | ⚠️ | SM2EC, SM3Hash, localStorage |
| MessageGM | message-gm.js | 35KB | ⚠️ | SM2EC, SM3Hash, SM4GCM, IndexedDB |
| GM (旧版) | gm.js | 12KB | ❌ | window.GM (Electron IPC) |
| OPK | opk-client.js | 8KB | ⚠️ | Web Crypto subtle |
| PQC Hybrid | pqc-hybrid-client.js | 4KB | ⚠️ | fetch + Web Crypto HKDF |
| ML-KEM-768 | ml-kem-768.js | 20KB | ✅ | 纯 JS + crypto.subtle |
| SLH-DSA | slh-dsa.js | 7KB | ⚠️ | WASM Worker |
| Constant-Time | constant-time.js | 7KB | ✅ | 纯 JS |
| Security-Levels | security-levels.js | 4KB | ✅ | 纯 JS |

## 各模块 API 详细

### 1. SM2EC (sm2-ec-browser.js)
暴露: `window.SM2EC` (global, 12KB, BigInt + Jacobian + wNAF, TVLA-masked)

```
SM2EC.generateKeyPair()          → { publicKey: hex, privateKey: hex }
SM2EC.getPublicKey()             → hex | null
SM2EC.encrypt(pubKeyHex, text)   → { ciphertext: hex, ephemeralPub: hex }
SM2EC.decrypt(privKeyHex, obj)   → plaintext
SM2EC.sign(privKeyHex, message)  → { r: hex, s: hex }
SM2EC.verify(pubKeyHex, msg, s)  → boolean
SM2EC.deriveSharedSecret(priv, pub) → hex (64B raw)
SM2EC.selftest()                 → { nPassed, nFailed, total }
```

RN 适配: `crypto.getRandomValues` → `react-native-get-random-values`

### 2. SM3Hash (sm3-browser.js)
暴露: `window.SM3Hash` (global, 8KB, 纯 JS)

```
SM3Hash.hash(message)      → hex (64 char)
SM3Hash.hmac(key, message) → hex
SM3Hash.digestHex(message) → hex (alias)
```

RN 适配: 纯 JS, 零依赖, 直接复用 ✅

### 3. SM4GCM (sm4-browser.js)
暴露: `window.SM4GCM` (global, 15KB, 纯 JS + GCM)

```
SM4GCM.generateKey()                                        → hex (32 char)
SM4GCM.encrypt(keyHex, plaintext, aad?)                      → { ciphertext, iv, tag }
SM4GCM.decrypt(keyHex, cipherHex, ivHex, tagHex, aad?)       → plaintext
```

RN 适配: 纯 JS 实现, 直接复用 ✅ (Web Crypto 仅作为优化选项)

### 4. SM2 (sm2-bridge.js)
暴露: `window.SM2` (class, 10KB, async, SM2 上层封装)

```
const sm2 = new SM2()
await sm2.init()                        // localStorage 加载或生成密钥
await sm2.encrypt(peerPubHex, msg)       → hex envelope
await sm2.decrypt(envelopeHex)           → plaintext
await sm2.sign(message)                  → hex signature
await sm2.verify(peerPubHex, msg, sig)   → boolean
sm2.exportPublicKey(keyId)               → hex
```

RN 适配: localStorage → AsyncStorage

### 5. MessageGM (message-gm.js)
暴露: `window.MessageGM` (35KB, 消息级加解密引擎, 含 DR 会话)

```
MessageGM.encryptWithSM2(recipientPubHex, plaintext)   → envelope JSON
MessageGM.decryptWithSM2(envelope)                     → plaintext
MessageGM.encryptWithMLKEM(recipientPkBytes, text)     → envelope
MessageGM.decryptWithMLKEM(envelope)                   → plaintext
MessageGM.signWithSLHDSA(message)                      → { signature, publicKey }
MessageGM.verifySLHDSA(pubKey, msg, sig)               → boolean
MessageGM.createDRSession(peerId)                      → sessionId
MessageGM.sendMessage(sessionId, text)                 → envelope
MessageGM.receiveMessage(envelope)                     → { peerId, text }
```

RN 适配: IndexedDB → 存储层完全替换, SLH-DSA WASM → Worker 支持

### 6. PQC Hybrid Client (pqc-hybrid-client.js)
暴露: 模块模式, 4KB

```
initPqcHandshake()                              → { sessionId, pkBytes }
finalizePqcHandshake(sessionId, ctBytes)        → { sessionKey }
deriveSessionKey(tlsSessionId, pqcSecret)       → CryptoKey
```

RN 适配: fetch 原生可用, Web Crypto HKDF → polyfill 后直接可用

### 7. OPK Client (opk-client.js)
暴露: `window.OPKClient` (class, 8KB)

```
OPKClient.getOrCreate()           → OPKClient (DB-backed)
OPKClient.registerPreKeys(n)      → Promise
OPKClient.getSignedPreKey()       → { keyId, publicKey }
```

RN 适配: Web Crypto subtle + IndexedDB → 存储层替换

## RN 复用评估矩阵

| 模块 | 状态 | 需要做的事 |
|:---|:---|:---|
| sm3-browser.js | 🟢 绿色 | 直接 import, 零依赖 |
| sm4-browser.js | 🟢 绿色 | 直接 import, 纯 JS |
| constant-time.js | 🟢 绿色 | 直接 import |
| security-levels.js | 🟢 绿色 | 直接 import |
| ml-kem-768.js | 🟡 黄色 | crypto.subtle → polyfill |
| sm2-ec-browser.js | 🟡 黄色 | getRandomValues → polyfill |
| sm2-bridge.js | 🟡 黄色 | localStorage → AsyncStorage |
| pqc-hybrid-client.js | 🟡 黄色 | polyfill 完成后直接可用 |
| opk-client.js | 🟡 黄色 | polyfill + 存储层替换 |
| message-gm.js | 🔴 红色 | IndexedDB 需完整替换存储后端 |
| gm.js | ⛔ 排除 | 旧版 Electron IPC |

## 建议 C2 验证路径 (1-2小时)

1. 安装 `react-native-get-random-values`
2. 拷贝 sm3-browser.js → import → `SM3Hash.hash("test")` → 确认 hex 输出
3. 拷贝 sm2-ec-browser.js → 替换 random → `SM2EC.selftest()` → 确认 5/5 PASS
4. 拷贝 sm4-browser.js → `generateKey() → encrypt → decrypt` → round-trip PASS
5. 基于 2-4 结果写 `reuse-report.md`

## C3 依赖评估清单

| 依赖 | 浏览器 | React Native | polyfill |
|:---|:---|:---|:---|
| BigInt | 原生 ✅ | 原生 (Hermes) ✅ | 无需 |
| crypto.getRandomValues | 原生 ✅ | `react-native-get-random-values` | 需要 |
| crypto.subtle | 原生 ✅ | `react-native-quick-crypto` | 需要 |
| localStorage | 原生 ✅ | `@react-native-async-storage/async-storage` | 需要 |
| IndexedDB | 原生 ✅ | ❌ 无等效替代 | 需完整替换 |
| fetch | 原生 ✅ | 原生 ✅ | 无需 |
| Web Worker | 原生 ✅ | ❌ Hermes 限制 | 需评估 |
| WASM | 原生 ✅ | ❌ Hermes 限制 | 需评估 |
| TextEncoder/TextDecoder | 原生 ✅ | 原生 ✅ | 无需 |

## 备注

- 所有浏览器模块路径: `/opt/fibemate-full/www/crypto/`
- SM2EC 已通过 TVLA N=5,000/10,000, 1-4 阶矩全绿
- SM3Hash 纯 JS 实现, SM4GCM 纯 JS 实现
- PQC Hybrid 已在生产运行 (900/900 高压全绿)
- 不建议在 RN 中引入 SLH-DSA WASM (平台限制), 签名改用 SM2 即可
