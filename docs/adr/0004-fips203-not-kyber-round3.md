# 0004 — `fibemate-core` implements FIPS 203, not Kyber round-3

<!-- SPDX-License-Identifier: GPL-3.0-only -->

- **Date**: 2026-11-28 (defect found 2026-11-27, fix released as 0.1.1)
- **Status**: Accepted
- **Supersedes**: —

## Context

`fibemate-core@0.1.0` was published to npm on 2026-11-15 and stayed `latest` for twelve days.
It was labelled FIPS 203 but was neither FIPS 203 nor Kyber round-3:

- KeyGen hashed `G(d)` without the `k` domain separator.
- `samplePoly` appended a 16-bit nonce into a `Uint8Array`, truncating it to one byte, so matrix
  rows repeated: the matrix had row rank 1.
- Encaps/Decaps used the round-3 KDF `K = H(K_bar || H(ct))` instead of `ss = K` from
  `(K, r) = G(m || H(ek))`.

All sizes matched (ek 1184, dk 2400, ct 1088, ss 32) and roundtrip passed, so the only tests in
place — five length assertions and one roundtrip — were green. Against `@noble/post-quantum`
the package failed 20/20 in both directions and threw nothing: it returned a wrong 32-byte
secret. Two of the three defects had been recorded 52–72 days before publication
(2026-09-04 and 2026-09-24); a 2026-09-04 note explicitly deferred the fix because "the package
is unpublished and has little value".

## Decision

The published package is FIPS 203 ML-KEM-768, verified against outside anchors, not against
itself:

- 100 KAT records (regression anchor) **and** 80 NIST ACVP vectors (external anchor:
  25 keyGen, 25 encapsulation, 10 decapsulation incl. implicit rejection, 10 + 10 key checks).
- 100-round bidirectional differential against `@noble/post-quantum`.
- A mutation gate that re-introduces each known defect and requires the KAT to fail.
- A publish preflight in `release.yml` that runs KAT, ACVP and the noble differential before
  `npm publish`, plus a registry-truth assertion that reads the registry instead of trusting
  the job conclusion.

## Consequences

- 0.1.0 and 0.0.0-stage are deprecated on npm; 0.1.1 is `latest`; release notes carry the
  warning; issue #19 is pinned.
- Keys and ciphertexts from 0.1.0 are not interoperable and cannot be migrated; they must be
  discarded. No consumer existed, so the blast radius was distribution, not deployed systems.
- "Roundtrip green" is no longer accepted as evidence of correctness anywhere in this repo;
  see `docs/EFFECTIVENESS-AUDIT.md`.
