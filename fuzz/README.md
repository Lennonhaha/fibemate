# Fuzz Testing Guide

> v3.3-preview · 2026-07-22

## Overview

Fuzz targets exercise the ML-KEM-768 attack surface: public-key parsing, ciphertext deserialization, secret-key corruption, and bytecodec boundaries.

## Quick Start

```bash
npm install -g jsfuzz    # one-time
jsfuzz fuzz/fuzz_encapsulate.cjs fuzz/corpus/ --runs 100000
jsfuzz fuzz/fuzz_decapsulate.cjs fuzz/corpus/ --runs 100000
jsfuzz fuzz/fuzz_bytecodec.cjs   fuzz/corpus/ --runs 100000
```

## Targets

| Script | Surface | Strategy |
|:---|:---|:---|
| `fuzz_encapsulate.cjs` | `encapsulate(pk)` | Corrupts valid 1184-byte pk; feeds random-length buffers |
| `fuzz_decapsulate.cjs` | `decapsulate(sk, ct)` | Corrupts sk/ct independently; cross-corrupts both |
| `fuzz_bytecodec.cjs` | `byteEncode/Decode`, `compress/decompress` | All 6 d-values; out-of-range inputs; roundtrip stress |

## Seed Corpus

Place KAT-derived valid inputs in `fuzz/corpus/` to bootstrap:

```bash
node scripts/kat500.js > /dev/null
cp fuzz/corpus/seed_*.bin fuzz/corpus/
```

## CI Integration

Add to `.github/workflows/ci.yml`:

```yaml
fuzz:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22 }
    - run: npm install -g jsfuzz
    - run: jsfuzz fuzz/fuzz_encapsulate.cjs fuzz/corpus/ --runs 50000 --timeout 300
    - run: jsfuzz fuzz/fuzz_decapsulate.cjs fuzz/corpus/ --runs 50000 --timeout 300
    - run: jsfuzz fuzz/fuzz_bytecodec.cjs   fuzz/corpus/ --runs 50000 --timeout 300
```

## Known Limitations

- **No native instrumented fuzzer**: jsfuzz is mutation-based, not coverage-guided
- **Jazzer.js** would provide coverage feedback but requires Java runtime
- **No OSS-Fuzz integration yet**: needs a Dockerfile + build.sh per project standards
- **Crypto timing side-channels**: jsfuzz doesn't detect timing leaks
- **Memory safety**: JavaScript runtime safety is assumed (no use-after-free/buffer overflow in JS heap)

## Roadmap

1. **Short term**: Integrate jsfuzz into CI with 50K runs minimum
2. **Medium term**: Jazzer.js for coverage-guided JS fuzzing
3. **Long term**: OSS-Fuzz proper (required for C addon if added later)
