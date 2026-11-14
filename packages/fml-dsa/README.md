# fml-dsa

ML-DSA (FIPS 204) in pure JavaScript. No native addon, no WebAssembly. The two runtime
dependencies are `@noble/hashes` (SHAKE/SHA-3) and `@noble/post-quantum` (the NTT and
sampling primitives, so the arithmetic is byte-identical to a second implementation rather
than to a second copy of the same code); everything else is in `src/core`.

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

`opts` accepts `{ context }` (≤255 bytes, FIPS 204 domain separation) and
`{ extraEntropy }`: `false` or omitted signs deterministically (`rnd = 0^32`, the FIPS 204
default), `true` draws 32 bytes from the CSPRNG, and a 32-byte `Uint8Array` is used verbatim.
`externalMu` throws: this implementation does not provide the pre-hashed variant, and
silently ignoring the flag would produce a signature that verifies under a different rule
than the caller asked for.

Sizes (65 / 44 / 87 in bytes): `pubBytes` 1952 / 1312 / 2592, `secretKey` 4032 / 2560 / 4896,
signature 3309 / 2420 / 4627.

## Compatibility

Key generation is byte-for-byte compatible with the NIST ACVP vectors for all three parameter sets
(75/75). Deterministic signatures are byte-identical to `@noble/post-quantum` 0.7.1 for
ML-DSA-44/65/87 on fixed seeds, and signatures, `pk` and `sk` interoperate in both
directions. The test suite asserts that equality (`test/sign-deterministic-parity.test.js`,
33 assertions); it is not inferred from "it round-trips".

The distinction matters: verification never recomputes `ρ''` and never calls `ExpandMask`, so
six FIPS 204 deviations in the signing path were invisible to every round-trip test this
project had. Only comparing bytes with an independent implementation found them.

Decoding is strict: non-canonical signatures are rejected, and secret keys whose length is not the
exact size for the parameter set throw `RangeError` naming the expected length.

## What this is not

- Not quiet on import. Every module runs its self-test when loaded and prints one line per
  check; a failure throws, so a broken build cannot load silently, but an application will
  see that output on stdout. Making the passing output opt-in is tracked as an issue, and it
  is deliberately not done as a drive-by: the same code path is what makes a failed self-test
  fatal, and that property is worth more than a clean console.
- Not constant-time in the JIT/v8 sense. Do not treat it as hardened against local timing attackers.
- Not audited by a third party.
- Not a replacement for a validated cryptographic module when one is required.

## License

GPL-3.0-only. See `LICENSE` in the repository root.
