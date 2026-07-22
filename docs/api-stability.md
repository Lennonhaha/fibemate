# API Stability Policy

> v3.3-preview · 2026-07-22

## Semantic Versioning

FIBEMATE follows [SemVer 2.0](https://semver.org/):

| Version component | Trigger |
|:---|:---|
| **MAJOR** (x.0.0) | Breaking API changes: removed exports, changed parameter order, renamed functions |
| **MINOR** (0.x.0) | New backward-compatible API, new algorithms, new WASM exports |
| **PATCH** (0.0.x) | Bug fixes, performance improvements, documentation updates |

Current pre-release: **v3.3-preview** — APIs may still change before v3.3.0 stable.

## API Tiers

### 🟢 Stable API — Backward-compatible across MINOR versions

These functions have stabilized field-tested interfaces. Breaking changes require a MAJOR bump.

#### ML-KEM-768 (FIPS 203)
| Export | Signature | Since |
|:---|:---|:---|
| `generateKeypair()` | `() => {publicKey: Buffer, secretKey: Buffer}` | v3.3 |
| `encapsulate(publicKey)` | `(pk: Buffer) => {ciphertext: Buffer, sharedSecret: Buffer}` | v3.3 |
| `decapsulate(secretKey, ciphertext)` | `(sk: Buffer, ct: Buffer) => Buffer` | v3.3 |
| `byteEncode(coeffs, d)` | `(arr: Int16Array, d: number) => Buffer` | v3.3 |
| `byteDecode(data, d)` | `(buf: Buffer, d: number) => Int16Array` | v3.3 |
| `compress(x, d)` / `decompress(y, d)` | `(n: number, d: number) => number` | v3.3 |
| `ntt(f)` / `invNtt(f)` | `(arr: Int16Array) => Int16Array` | v3.3 |
| `polyMulNTT(a, b)` | `(a: Int16Array, b: Int16Array) => Int16Array` | v3.3 |
| `sampleNTT(seed)` | `(seed: Buffer) => Int16Array` | v3.3 |

#### SM2 (GB/T 32918)
| Export | Signature | Since |
|:---|:---|:---|
| `sm2.generateKeyPair()` | `() => {publicKey: Buffer, privateKey: Buffer}` | v3.1 |
| `sm2.sign(message, privateKey)` | `(msg: Buffer, sk: Buffer) => Buffer` | v3.1 |
| `sm2.verify(message, signature, publicKey)` | `(msg: Buffer, sig: Buffer, pk: Buffer) => boolean` | v3.1 |
| `sm2.encrypt(message, publicKey)` / `decrypt(...)` | standard SM2 encryption | v3.1 |

#### SM3 / SM4
| Export | Signature | Since |
|:---|:---|:---|
| `sm3.hash(data)` | `(data: Buffer) => Buffer` | v3.2 |
| `sm4.encrypt(key, data)` / `decrypt(...)` | `(key: Buffer, data: Buffer) => Buffer` | v3.2 |

---

### 🟡 Experimental API — May change in MINOR releases

These modules are functional but interfaces may evolve based on field feedback.

| Module | Exports | Notes |
|:---|:---|:---|
| `hybrid.js` (Path C-2 SM2+ML-KEM) | `e2eInit`, `e2eRespond`, `e2eMsg` | Protocol-level API; handshake primitives may change |
| `message-crypto.js` | `encryptMessage`, `decryptMessage` | Message envelope format v2; subject to wire-format revision |
| `double-ratchet-pq.js` | Ratchet state machine | May adopt MLS-like structure in future |
| `key-storage.js` (IndexedDB) | CRUD wrappers | IndexedDB schema may change |

---

### 🔬 Research API — No compatibility guarantees

Do not depend on these in production code.

| Module | Notes |
|:---|:---|
| LookingGlass v2.x (Rust/WASM) | `apply_forward`, `apply_inverse`, `roundtrip_test` — group representation experiment |
| VWZ sign (Rust/WASM) | `keygen`, `sign`, `verify` — tensor signature research |
| `privacy-layers/mixnet-router.js` | Mix network prototype |
| `privacy-layers/safety-numbers.js` | Trust-on-first-use fingerprinting |

---

### 🏷️ Deprecated API — Will be removed

| Export | Deprecated in | Removal in | Replacement |
|:---|:---|:---|:---|
| (none currently) | — | — | — |

---

## Breaking Change Policy

1. **Announcement**: Breaking changes are announced at least **one MINOR version** before taking effect
2. **Migration path**: Deprecated exports remain functional with console warnings
3. **Changelog**: Every release includes a `BREAKING CHANGES` section in the release notes
4. **Pre-release exceptions**: v3.3-preview APIs may change without prior deprecation

## Stability Commitments by Component

| Layer | Stability | Rationale |
|:---|:---|:---|
| `ml-kem-768.js` core API | 🟢 Stable | FIPS 203 wire format is fixed |
| `sm2-bigint-ec.js` core API | 🟢 Stable | GB/T 32918 is fixed |
| Hybrid KEX protocol envelopes | 🟡 Experimental | I-D draft may evolve |
| Message encryption envelope format | 🟡 Experimental | v3 format under design |
| WASM ABIs (VWZ/LookingGlass) | 🔬 Research | Active cipher research |
| Tauri IPC commands | 🟡 Experimental | App shell not released |
| reg-server WebSocket protocol | 🔬 Research | Prototype, not production |

## Reporting API Concerns

If a Stable API behaves unexpectedly or an Experimental API blocks your use case, open an issue with:

1. The API you're calling
2. Your Node.js / browser version
3. A minimal reproduction script
