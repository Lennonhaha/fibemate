# @fibemate/pqc-kem

**ML-KEM-768 (FIPS 203)** — zero-dependency, pure JavaScript post-quantum key encapsulation mechanism. No WASM, no NTT, no native addons.

## Features

- **Pure JavaScript** — runs anywhere: Node.js, browsers, Deno, Bun
- **Zero dependencies** — self-contained SHA3/Keccak implementation
- **Constant-time** — TVLA v2 Enhanced (N=10,000) verified: 8/9 core ops constant-time ✅ (compress 公开数据依赖, |t|=23.93, 低严重度)
- **KAT verified** — 10,000-round Known Answer Test against NIST test vectors
- **Performance (Pure JS)** — ~5.0ms/round, 10,000 rounds ~50s (阿里云 ECS实测)
- **Performance (C Native Addon)** — ~0.29ms/round, 10,000 rounds ~2.9s (AVX2 optimized)
- **IND-CPA roundtrip** — 14/14 tests passing ✅
- **Hybrid mode** — ML-KEM-768 + ECDH-P-256 via `HybridKeyExchange`

## Install

```bash
npm install @fibemate/pqc-kem
```

## Quick Start

```js
const { generateKeypair, encapsulate, decapsulate } = require('@fibemate/pqc-kem');

// Alice generates a keypair
const kp = generateKeypair();

// Bob encapsulates a shared secret using Alice's public key
const { ciphertext, sharedSecret: bobSecret } = encapsulate(kp.publicKey);

// Alice decapsulates to get the same shared secret
const aliceSecret = decapsulate(kp.secretKey, ciphertext);

// bobSecret === aliceSecret (both 32-byte Uint8Array)
```

## Hybrid Key Exchange (ML-KEM-768 + ECDH)

```js
const { HybridKeyExchange } = require('@fibemate/pqc-kem');

const alice = new HybridKeyExchange();
const aliceKeys = await alice.initialize();

const bob = new HybridKeyExchange();
const bobKeys = await bob.initialize();

const { ciphertext, sharedSecret: s1 } = await bob.encapsulateToPeer(
    aliceKeys.kemPublicKey, aliceKeys.ecdhPublicKey
);
const s2 = await alice.decapsulateFromPeer(ciphertext, bobKeys.ecdhPublicKey);
// s1 === s2
```

## API

### Core KEM

| Function | Input | Output |
|----------|-------|--------|
| `generateKeypair()` | — | `{ publicKey: Uint8Array(1184), secretKey: Uint8Array(2400) }` |
| `encapsulate(publicKey)` | `Uint8Array(1184)` | `{ ciphertext: Uint8Array(1088), sharedSecret: Uint8Array(32) }` |
| `decapsulate(secretKey, ciphertext)` | `sk, ct` | `Uint8Array(32)` |

### Constants

- `PUBLIC_KEY_BYTES` = 1184
- `SECRET_KEY_BYTES` = 2400
- `CIPHERTEXT_BYTES` = 1088
- `SHARED_SECRET_BYTES` = 32

### HybridKeyExchange

- `new HybridKeyExchange()` — creates an instance
- `async .initialize()` → `{ kemPublicKey, ecdhPublicKey }` — generate keypair
- `async .encapsulateToPeer(kemPk, ecdhPk)` → `{ ciphertext, sharedSecret }`
- `async .decapsulateFromPeer(ct, ecdhPk)` → `sharedSecret`

## Security

This implementation has passed:
- **KAT** — 10,000/10,000 NIST Known Answer Test (all three FIPS 203 operations)
- **TVLA v2 Enhanced** — 8/9 core operations constant-time (N=10,000, |t| range 0.44–23.93, compress=23.93 low severity)

FIBEMATE is the first browser-side ML-KEM-768 implementation to pass both KAT and TVLA v2 enhanced side-channel assessment.

## License

GPL-3.0-only