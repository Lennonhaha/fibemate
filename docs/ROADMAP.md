# ROADMAP

This file records externally imposed timelines that shape the project plan. It is a
planning aid, not a compliance claim.

## Post-quantum migration: NIST IR 8547

NIST IR 8547, *Transition to Post-Quantum Cryptography Standards* (initial public
draft, November 2024), proposes the following schedule for the classical public-key
algorithms that FIBEMATE still has to interoperate with:

| Milestone | Proposed date | Meaning |
|---|---|---|
| Deprecation | 2030 | RSA, ECDSA, ECDH, DH (and finite-field variants) should no longer be used for new deployments |
| Disallowance | 2035 | Those algorithms should be removed from use entirely |

The dates are a draft proposal and may change before the report is final. They are
recorded here because they set the deadline for the work below, not because they are
settled policy.

### What this means for FIBEMATE

- **Already shipped:** ML-KEM-768 (FIPS 203) in `fibemate-core` and the Tauri client
  (RustCrypto/libcrux), ML-DSA and SLH-DSA in `packages/fml-dsa`, hybrid
  X25519 + ML-KEM-768 for session bootstrap.
- **Gap that the 2030 date exposes:** the client keeps a classical-only fallback for
  peers that do not advertise hybrid support (`0x01` envelope). That is an
  interoperability path, not a PQC path, and it has to be retired or gated before the
  deprecation milestone.
- **Gap that the 2035 date exposes:** any stored or long-lived key material that is
  still RSA/ECC (legacy vault entries, exported backups) has to be migrated or
  invalidated, not merely wrapped.
- **Not covered by the IR:** signatures on releases, timestamps and package metadata.
  Those are tracked separately in `SECURITY.md` and the release documentation.

### Tracking

- [ ] Inventory every classical-only code path and mark it with the milestone it must
      disappear by (2030 deprecation / 2035 disallowance).
- [ ] Decide whether the classical fallback is removed or kept behind an explicit
      opt-in with a warning, and record the decision before 2030.
- [ ] Add a release check that refuses to ship a build whose default handshake is
      classical-only.
- [ ] Re-check this file when NIST publishes the final IR 8547; update the dates and
      the gaps rather than keeping a stale table.

## Other timelines

- **Terrestrial re-keying:** see `docs/deployment.md` for the certificate and key
  rotation schedule.
- **Release train:** see `RELEASE-DISCIPLINE.md` and the GitHub Releases page.
