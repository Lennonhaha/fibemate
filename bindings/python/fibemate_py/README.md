# FIBEMATE Python Binding

> v3.3-preview · 2026-07-22

Minimal Python wrapper for ML-KEM-768 (FIPS 203). No native compilation required — bridges to the verified Node.js implementation via subprocess.

## Install

```bash
# Prerequisites: Node.js 22+, Python 3.10+
cd bindings/python
node fibemate_py/fibemate_bridge.js  # verify Node.js bridge works
```

No `pip install` needed — the module is self-contained.

## Quick Start

```python
from fibemate_py import MLKEM768

mlkem = MLKEM768()

# Alice generates a keypair
pk, sk = mlkem.keygen()

# Bob encapsulates to Alice's public key
ct, ss_enc = mlkem.encaps(pk)

# Alice decapsulates the ciphertext
ss_dec = mlkem.decaps(sk, ct)

assert ss_enc == ss_dec  # shared secret matches
```

## API

### `MLKEM768(nodejs_path=None)`

Constructor. Optionally specify Node.js binary path (default: `node` from PATH, or `FIBEMATE_NODE` env var).

### `keygen() → (public_key, secret_key)`

- `public_key`: 1184 bytes
- `secret_key`: 2400 bytes

### `encaps(public_key: bytes) → (ciphertext, shared_secret)`

- `ciphertext`: 1088 bytes
- `shared_secret`: 32 bytes (SHA3-256 of K_bar, per FIPS 203)

### `decaps(secret_key: bytes, ciphertext: bytes) → shared_secret`

- `shared_secret`: 32 bytes

### `self_test(n=1000) → bool`

Runs `n` KEM roundtrips and returns True if all produce matching shared secrets.

## Environment Variables

| Variable | Default | Purpose |
|:---|:---|:---|
| `FIBEMATE_NODE` | `node` | Path to Node.js 22+ binary |
| `FIBEMATE_KAT_N` | `1000` | Default iterations for `self_test()` |

## Verification

```bash
cd bindings/python
python3 -m fibemate_py._test
```

Expected output:

```
[1/4] keygen OK — pk=1184B sk=2400B
[2/4] encaps OK — ct=1088B ss=32B
[3/4] decaps OK — ss1 == ss2
[4/4] self-test OK — 1000/1000 roundtrips PASS

✅ All Python binding tests PASS
```

## Notes

- This is an **academic research bridge** — not intended for production key generation
- Subprocess overhead: ~10ms per call (acceptable for batch operations, not for hot loops)
- For production Python use, consider a native CFFI binding or convert to `@noble/post-quantum` directly
- All security guarantees are inherited from the underlying JS implementation; see `docs/security-limitations.md`
