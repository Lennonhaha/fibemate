# FIBEMATE v3.3-preview — Audit Package

> Generated 2026-07-22 · HEAD `bf9ae819`
> For third-party security auditors

## 1. Repository Snapshot

| Field | Value |
|:---|:---|
| Repository | `https://github.com/Lennonhaha/fibemate` |
| Branch | `master` |
| Commit | `bf9ae819` |
| License | GPL-3.0-only |
| Language | JavaScript (ES2022) + Rust (WASM bindings) |
| Node.js | 22 LTS |

## 2. Scope of Audit

### 2.1 Critical Path (P0 — must review)

| File | Lines | Description |
|:---|:---|:---|
| `packages/pqc-kem/src/ml-kem-768.js` | 355 | ML-KEM-768 (FIPS 203) core — NTT domain, full keygen/encaps/decaps |
| `packages/pqc-kem/src/hybrid.js` | — | Hybrid KEX: ML-KEM-768 + ECDH-P-256 |
| `packages/pqc-kem/index.js` | — | Package entry |

### 2.2 Supporting (P1 — should review)

| File | Description |
|:---|:---|
| `www/message-crypto.js` | Double-ratchet session manager |
| `www/key-manager.js` | IndexedDB key storage |
| `www/double-ratchet-pq.js` | PQ double-ratchet state machine |
| `www/session-manager.js` | Session lifecycle |

### 2.3 Research (P2 — for context, not production)

| File | Description |
|:---|:---|
| `rust/lgv2/` (LookingGlass v2.2) | Group representation — additive reverse engineering barrier |
| `rust/vwz-sign-wasm/` (VWZ) | Tensor signature — research prototype |
| `privacy-layers/` | Mix network + safety numbers — prototypes |

## 3. Verification Evidence

### 3.1 Self-Consistency

| Test | Result | Method |
|:---|:---|:---|
| KEM roundtrip (1,000) | ✅ 1000/1000 | `scripts/kat500.js` |
| KEM roundtrip (10,000) | ✅ 10000/10000 | `scripts/prep-release.js` |
| KAT vectors (500) | ✅ 500/500 | `scripts/kat500.js` |

### 3.2 Cross-Validation

| Reference | Direction | Rounds | Result |
|:---|:---|:---|:---|
| `@noble/post-quantum` v0.7.2 | JS ↔ JS (same domain) | 10,000 | ✅ |
| liboqs 0.12.0 (C) | JS ↔ C | 10,000 | ✅ |
| liboqs 0.12.0 (C) | C ↔ JS | 10,000 | ✅ |

### 3.3 Wire Format (FIPS 203)

| Parameter | Spec (§) | Expected | Observed |
|:---|:---|:---|:---|
| Public key | §7.2 | 1184 B | 1184 B ✅ |
| Secret key | §7.2 | 2400 B | 2400 B ✅ |
| Ciphertext | §7.2 | 1088 B | 1088 B ✅ |
| Shared secret | §7.2 | 32 B | 32 B ✅ |

### 3.4 Side-Channel Mitigations

| Mitigation | Status | Notes |
|:---|:---|:---|
| Barrett reduction (constant-time) | ✅ | `modMul` uses Barrett K=24, MU=20159; 14× faster than BigInt |
| SM2 scalar masking (k-masking) | ✅ | `k' = k + r·N`, random 64-bit r |
| Decaps fail check (constant-time) | ✅ | Bitwise mask, no early return |

### 3.5 Known Limitations

| Limitation | Severity | Mitigation |
|:---|:---|:---|
| Pure JS — no native ASAN/UBSAN | Info | liboqs C cross-validation covers arithmetic correctness |
| No hardware TVLA | Info | SM2 masking design validated by N=5000 statistical TVLA (software) |
| No formal verification | Info | TLA+ model for Path C-2 K3 strong key independence (7 invariants, 101K states) |

## 4. TSR Chain (Timestamp Evidence)

| ID | Subject | SHA256 | Authority | Date |
|:---|:---|:---|:---|:---|
| lg-089 | ml-kem-768.js (NTT rewrite) | f5f7e221… | FreeTSA | 2026-07-21 |
| lg-090 | README.md (NTT domain docs) | — | FreeTSA | 2026-07-22 |
| lg-091 | ml-kem-768.js (liboqs fix) | — | FreeTSA | 2026-07-22 |
| lg-092 | Barrett optimization | — | FreeTSA | 2026-07-22 |
| lg-093 | pqc-readiness.md | — | FreeTSA | 2026-07-22 |
| lg-094 | security-limitations.md | — | FreeTSA | 2026-07-22 |
| lg-095 | demo/ml-kem-768.js + index.html | 2df63d18… | FreeTSA | 2026-07-22 |
| lg-001~088 | Earlier artifacts | — | DigiCert + FreeTSA | 2026-03~07 |

**Total**: 95 timestamped artifacts (lg-001 ~ lg-095)

### TSR Verification

```bash
# Verify any individual TSR
openssl ts -verify -in docs/tsa/YYYY-MM-DD/lg-NNN.tsr \
  -queryfile docs/tsa/YYYY-MM-DD/lg-NNN.tsq \
  -CAfile /path/to/DigiCert_Assured_ID_Root_CA.pem

# Check manifest
cat docs/TSR-MANIFEST.md
node scripts/verify-tsr.js
```

## 5. Build Reproducibility

```bash
# Lockfile-based deterministic install
npm ci                    # Node.js dependencies
cargo build --release     # Rust/WASM modules (VWZ, LookingGlass)

# Docker reproducible baseline
docker build -t fibemate-bench -f Dockerfile.bench .
docker run --rm fibemate-bench
```

## 6. Security Boundaries

### What this project claims

- ✅ ML-KEM-768 FIPS 203 compliant wire format
- ✅ CCA-secure KEM (inherits ML-KEM-768 security reduction)
- ✅ SM2 GB/T 32918 compliant signing + encryption
- ✅ Constant-time Barrett modMul

### What this project does NOT claim

- ❌ Novel cryptographic hardness (DMTH/VWZ are research, default-off)
- ❌ Hardware security (no secure element, no TEE)
- ❌ Protocol-level security proof (double-ratchet is informal)
- ❌ Third-party audit (pending as of 2026-07-22)

## 7. Auditor Access

| Resource | URL |
|:---|:---|
| Source | `https://github.com/Lennonhaha/fibemate` (commit `99b3bd47`) |
| Live demo | `https://fibemate.net/demo/` |
| Docs | `https://fibemate.net/docs/` |
| TSR manifests | `docs/TSR-MANIFEST.md` |
| Vulnerability registry | `docs/VULNERABILITIES.md` |
| API stability | `docs/api-stability.md` |
| Security limitations | `docs/security-limitations.md` |

## 8. Contact

For audit queries: open a GitHub issue with `[audit]` prefix, or email the repository owner.


## 9. Update: 2026-07-22 Quality Assurance Documentation (HEAD `bf9ae819`)

The following documents were added after the initial audit package (HEAD `99b3bd47`):

| Document | Description | TSR |
|:---|:---|:---|
| `docs/quality-assurance.md` | 7-layer QA architecture blueprint (L1-L7) | — |
| `docs/testing.md` | 4-layer CI pipeline + functional + compatibility tests | — |
| `docs/security-limitations.md` (expanded) | P0/P1/P2 risk classification + mandatory constraints | lg-094 |
| `docs/risk-rectification.md` | 19-item P0-P3 rectification tracker with 8.31 deadlines | — |
| `.pre-commit-config.yaml` | Multi-language pre-commit hooks | — |
| `test/smoke-crypto.js` | ML-KEM-768 + SM2 pre-commit smoke (5/5 PASS) | — |
| `scripts/update-readme.py` | Idempotent README updater | — |

All new files have been verified on the live server (ECS). Core implementation (`ml-kem-768.js`) unchanged.
