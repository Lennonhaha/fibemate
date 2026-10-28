# 2026-10-28 - retirement of the ML-KEM-768 time-domain module

Two RFC 3161 timestamps recorded after the module was deleted:

| number | artifact | meaning |
|---|---|---|
| lg-109 | `ml-kem-768-td-retirement.md` | the retirement record itself (decision, evidence, merge commit) |
| lg-110 | `SHA256SUMS` | digest of every file tracked at the retirement commit |

Both were stamped by FreeTSA (`https://freetsa.org/tsr`). Each `.tsr` carries a certificate, and
each was verified against `docs/tsa/2026-09-06-vwz-rank2/freetsa-root-ca.pem` with
`openssl ts -verify`; the imprint inside the token was also compared byte for byte against the
artifact digest. `timestamp-manifest.json` records both facts.

The earlier timestamps for the retired file remain frozen:

- `docs/tsa/2026-06-08/ml-kem-768-td.js.tsq` / `.tsr` - valid for the file **as it existed then**;
- `docs/tsa/2026-06-11/ml-kem-768.js.tsr` - a different file, unaffected.

They are historical evidence and must not be regenerated, moved or deleted. This directory
records the state *after* retirement; the two records answer different questions and neither
supersedes the other.
