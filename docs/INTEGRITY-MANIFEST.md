# INTEGRITY-MANIFEST — Software/Firmware Integrity Baseline

> FIPS 140-3 Section 11.9 — software/firmware integrity check
> Last updated: 2026-09-05

## What This Is

`test/INTEGRITY-MANIFEST.json` is the **committed integrity baseline** for the
ML-KEM-768 module that the test suite anchors against. It is **not** a runtime
file and it is **never overwritten by tests**.

```json
{
  "www/crypto/ml-kem-768.js": "a6d4e8d8d143d787fe8e3dd467c17073623c76c4512cd8d501b7b6bbdb532b43",
  "timestamp": "2026-09-05T01:21:24.870Z",
  "algorithm": "SHA-256",
  "standard": "FIPS 140-3 Section 11.9"
}
```

- **Key**: repository-relative path of the anchored module
- **Hash**: SHA-256 of the module file
- **Standard**: FIPS 140-3 §11.9 (software/firmware integrity)

## Why a Baseline (and not an Overwrite)

An earlier version of the test **rewrote** the manifest on every run — which
corrupted a timestamped evidence record and produced a "self-deceiving" success.
The correct FIPS semantics:

- Tests **compare** the live module hash against the committed baseline.
- On match → `完整性基线匹配: 模块未被篡改` (PASS).
- On mismatch → the test reports drift (`完整性基线漂移`) and **rebuilds the
  baseline file for review**, so the change is a conscious, committed decision —
  never a silent overwrite.

## Evidence Chain (RFC 3161 Timestamps)

The manifest is anchored by DigiCert RFC 3161 timestamps, stored in
`docs/tsa/`:

| Evidence | Location |
|---|---|
| Manifest TSR | `docs/tsa/2026-06-08/test_INTEGRITY-MANIFEST.json.tsr` |
| Manifest TSQ | `docs/tsa/2026-06-08/test_INTEGRITY-MANIFEST.json.tsq` |
| Module TSR (ML-KEM-768) | `docs/tsa/2026-06-08/ml-kem-768-td.js.tsr` |
| Test harness TSR | `docs/tsa/2026-06-08/test_test-fibemate.js.tsr` |
| Timestamp index | `docs/tsa/timestamp-manifest.json` (entry [142]) |

When the baseline hash legitimately changes (e.g. the module was upgraded to a
canonical NTT-domain implementation), a **new** timestamped evidence pair should
be generated for the updated manifest — the old evidence remains as history.

## How the Check Works

`test/test-fibemate.js` — Track 3b:

1. Reads `test/INTEGRITY-MANIFEST.json` (baseline)
2. Computes SHA-256 of `www/crypto/ml-kem-768.js`
3. Matches → PASS; mismatches → report drift + rebuild baseline
   (compat fallback: legacy key `ml-kem-768-td.js` is honoured)

Run it:

```bash
node test/test-fibemate.js
```

Expected output (relevant lines):

```
[INTEGRITY] Module hash:
  www/crypto/ml-kem-768.js SHA-256: a6d4e8d8d143d787...
完整性基线匹配: 模块未被篡改
Software/Firmware Integrity: ✓
```

## Updating the Baseline (Conscious Change Only)

1. Modify the module (`www/crypto/ml-kem-768.js`)
2. Run `node test/test-fibemate.js` → it reports drift and rebuilds
   `test/INTEGRITY-MANIFEST.json` with the new hash + timestamp
3. Review the diff — the hash change must correspond to your intended change
4. Commit both the module change **and** the manifest update together
5. (Recommended) Re-anchor with a new RFC 3161 timestamp pair via the TSA tooling

## Related

- Production integrity monitoring: `scripts/integrity-check.sh`
  (baseline at `/opt/fibemate-full/logs/integrity-baseline.sha256` + alerting)
- TSR verification: `scripts/tsr-verify.sh`, `tools/tsr-verify/`
- Full test harness: `test/test-fibemate.js` (36 checks: KAT, round-trip,
  pairwise consistency, continuous RNG, bypass, integrity)
