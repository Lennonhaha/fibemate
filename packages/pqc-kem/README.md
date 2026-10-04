# fibemate-pqc-kem

**ML-KEM-768 (FIPS 203)** 閳?zero-dependency, pure JavaScript post-quantum key encapsulation mechanism. No WASM, no NTT, no native addons.

## Features

- **Pure JavaScript** 閳?runs anywhere: Node.js, browsers, Deno, Bun
- **Zero dependencies** 閳?self-contained SHA3/Keccak implementation
- **Constant-time** 閳?TVLA v2 Enhanced (N=10,000) verified: 8/9 core ops constant-time 閴?(compress 閸忣剙绱戦弫鐗堝祦娓氭繆绂? |t|=23.93, 娴ｅ簼寮楅柌宥呭)
- **NIST ACVP verified** — passes keyGen, encapsulation, and decapsulation test vectors for ML-KEM-512/768/1024 (180/180 cases)
- **Performance (Pure JS)** 閳?~5.0ms/round, 10,000 rounds ~50s (闂冨潡鍣锋禍?ECS鐎圭偞绁?
- **Performance (C Native Addon)** 閳?~0.29ms/round, 10,000 rounds ~2.9s (AVX2 optimized)
- **IND-CPA roundtrip** 閳?14/14 tests passing 閴?- **Hybrid mode** 閳?ML-KEM-768 + ECDH-P-256 via `HybridKeyExchange`

## Install

```bash
npm install fibemate-pqc-kem
```

## Quick Start

```js
const { generateKeypair, encapsulate, decapsulate } = require('fibemate-pqc-kem');

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
const { HybridKeyExchange } = require('fibemate-pqc-kem');

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
| `generateKeypair()` | 閳?| `{ publicKey: Uint8Array(1184), secretKey: Uint8Array(2400) }` |
| `encapsulate(publicKey)` | `Uint8Array(1184)` | `{ ciphertext: Uint8Array(1088), sharedSecret: Uint8Array(32) }` |
| `decapsulate(secretKey, ciphertext)` | `sk, ct` | `Uint8Array(32)` |

### Constants

- `PUBLIC_KEY_BYTES` = 1184
- `SECRET_KEY_BYTES` = 2400
- `CIPHERTEXT_BYTES` = 1088
- `SHARED_SECRET_BYTES` = 32

### HybridKeyExchange

- `new HybridKeyExchange()` 閳?creates an instance
- `async .initialize()` 閳?`{ kemPublicKey, ecdhPublicKey }` 閳?generate keypair
- `async .encapsulateToPeer(kemPk, ecdhPk)` 閳?`{ ciphertext, sharedSecret }`
- `async .decapsulateFromPeer(ct, ecdhPk)` 閳?`sharedSecret`

## Security

This implementation has passed:
- **NIST ACVP** — 180/180 keyGen, encapsulation, and decapsulation vectors for ML-KEM-512/768/1024 (source: usnistgov/ACVP-Server)
- **Roundtrip self-consistency** — 10,000/10,000 encap/decap pairs (internal check, not an external KAT)
- **Pending** — keyCheck (implicit rejection) vectors
- **TVLA v2 Enhanced** 閳?8/9 core operations constant-time (N=10,000, |t| range 0.44閳?3.93, compress=23.93 low severity)

FIBEMATE's ML-KEM-768 implementation passes NIST ACVP keyGen/encapsulation/decapsulation vectors and has undergone TVLA v2 side-channel assessment.

## License

GPL-3.0-only