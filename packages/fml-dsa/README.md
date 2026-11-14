# fml-dsa

ML-DSA (FIPS 204) in pure JavaScript. No native addon, no WebAssembly, no runtime dependencies.

```bash
npm install fml-dsa
```

```js
import { ml_dsa65 } from 'fml-dsa';

const { publicKey, secretKey } = ml_dsa65.keygen();
const msg = new TextEncoder().encode('hello');
const sig = ml_dsa65.sign(msg, secretKey);

ml_dsa65.verify(sig, msg, publicKey);          // true
ml_dsa65.verify(sig, new TextEncoder().encode('hell0'), publicKey); // false
```

Parameter sets: `ml_dsa44`, `ml_dsa65`, `ml_dsa87`.

## API

| Call | Returns |
|---|---|
| `keygen()` / `keygen(seed32)` | `{ publicKey, secretKey }` — `Uint8Array`; `seed32` is a 32-byte `Uint8Array` for deterministic key generation |
| `sign(msg, secretKey, opts?)` | `Uint8Array` signature |
| `verify(sig, msg, publicKey, opts?)` | `boolean` — malformed inputs return `false` instead of throwing |
| `.params` | `{ k, l, eta, tau, gamma1, gamma2, beta, omega, pubBytes, secBytes, sigBytes, level }` |

`opts` accepts `{ context }` (≤255 bytes, FIPS 204 domain separation).
`extraEntropy: true` and `externalMu` throw: this implementation signs deterministically and does
not implement those variants. Silently ignoring them would produce signatures that verify under a
different rule than the caller asked for.

Sizes (65 / 44 / 87 in bytes): `pubBytes` 1952 / 1312 / 2592, `secretKey` 4032 / 2560 / 4896,
signature 3309 / 2420 / 4627.

## Compatibility

Key generation is byte-for-byte compatible with the NIST ACVP vectors for all three parameter sets
(75/75), and signatures/pk/sk interoperate with `@noble/post-quantum` in both directions. The test
suite includes that comparison; it is not inferred from "it round-trips".

Decoding is strict: non-canonical signatures are rejected, and secret keys whose length is not the
exact size for the parameter set throw `RangeError` naming the expected length.

## What this is not

- Not constant-time in the JIT/v8 sense. Do not treat it as hardened against local timing attackers.
- Not audited by a third party.
- Not a replacement for a validated cryptographic module when one is required.

## License

GPL-3.0-only. See `LICENSE` in the repository root.
