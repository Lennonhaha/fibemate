# Local MTC issuance and verification

**Date:** 2026-11-11
**Status:** local experiment, reproducible, **no external party involved**
**Spec under test:** `draft-ietf-plants-merkle-tree-certs-01` (implemented by the harness, not by us)

---

## Why this exists

`www/docs/PQC_MIGRATION_PLAN.md` §6.3 argues that a cryptographic inventory performed once per
project is stale by the second certificate renewal, and that MTC changes what a "certificate" is
rather than only how long it lives. That claim creates an obligation: if we are going to say the
certificate layer needs continuous verification, we should be able to verify one certificate.

The certificate layer is also the part of this project we cannot check against ourselves. Every
KAT in `test/` is generated from this repository's own code, which demonstrates self-consistency
and nothing about agreement with anyone else (the same reason `scripts/cross-validate-pqclean.cjs`
exists for ML-KEM).

So the question this experiment answers is narrow:

> Given an MTC certificate and its inclusion proof, can we verify it — with a tool we did not write?

It does **not** answer whether our TLS stack can negotiate MTC, whether TrustAsia's environment is
compatible, or whether anything here is trustworthy in production.

---

## What was run

**Harness:** DigiCert MTC Playground, `github.com/digicert/ca-extension-mtc-playground`,
commit `dbcf6693aef821df3c69743e0bb16dd1579b35be`, AGPL-3.0.

It is used as an **external binary invoked from outside this repository**. No code from it is
vendored here, which keeps this repository's Apache-2.0 licensing unambiguous.

Two facts about that harness matter for reading the results:

1. Its README states it implements **draft -01**. TrustAsia's public material states **-05**, and
   the IETF draft is now at **-08** (2026-11-01). These are not the same specification. Nothing
   below should be read as evidence about -05 or -08 conformance.
2. The binaries committed in that repository are Mach-O (macOS). They do not run on this machine;
   everything below was built from source.

**Toolchain:** Go 1.25.0 `windows/amd64`, unpacked as a portable archive (no installer, no admin
rights, `GOPROXY=https://goproxy.cn`). Docker Desktop was attempted first and abandoned — see
"Environment notes".

**Machine:** Windows 10.0.26300, non-administrator shell, OpenSSL 3.2.3 (the copy shipped with Git).

---

## Result 1 — an MTC certificate is issued

```
Step 2: Building TBSCertificateLogEntry (SPKI hashed)...
        SPKI hash: 620cb89a2a9cd338257242d0506c4128c54b76bc2555aec82f21b44c7c5538ed
        Log entry: 283 bytes DER
        Wire data: 284 bytes (2B type + 3B len + contents octets)

Step 3: Building Merkle tree...
        Leaf index: 1
        Tree size:  4 entries
        Leaf hash:  b234f1f62adf369dbd697e44d2a0940569920ea486f4325b8d6c9f0d3e8896d7
        Root hash:  eb820e1855f6639a670c97f8e3fa5bca0136f69d6411d6025a05a6d76ba4d954

Step 4: Computing inclusion proof and building MTCProof...
        Subtree:     [0, 4)
        Proof depth: 2 sibling hashes
        Mode:        signatureless

Step 5: Building MTC certificate (id-alg-mtcProof)...
        Cert size: 441 bytes DER
        Serial:    1 (= leaf index)
```

**441 bytes** for a signatureless certificate whose proof covers a 4-entry subtree.

That number is worth recording precisely because it is *not* the number in circulation. Vendor
material describes Landmark-Relative certificates of "about 390 bytes"; we did not measure that,
we measure 441 for a different construction (signatureless, subtree `[0,4)`, P-256 key). Neither
figure should be quoted as if it were the other.

## Result 2 — an independent verifier accepts it

`mtc-verify-cert`, a separate binary from the issuer, with no access to the issuer's state:

```
Format:       MTC-spec (signatureAlgorithm = id-alg-mtcProof)
Serial/Index: 1
Not Before:   2026-11-11T04:56:59Z
Not After:    2027-11-11T04:56:59Z
Extensions:   4

--- MTCProof ---
Subtree:        [0, 4)
Inclusion proof: 2 hashes
  hash[0]: 709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c
  hash[1]: ba4a64eb19a348d13ed368200bb84e06f95bbd576c2a201c6f29a7da0f00d394
Signatures:     0
Mode:           signatureless

[PASS] Inclusion proof valid (leaf 1 in subtree [0, 4))
```

`openssl x509 -text` parses the same file without complaint, which matters independently: it means
the object is still an X.509 certificate, not a private blob that only the issuing tool can read.

```
Signature Algorithm: 1.3.6.1.4.1.44363.47.0
Issuer: 1.3.6.1.4.1.44363.47.1=mtc-demo-log
Subject: C=US, O=MTC Demo, CN=demo.example.com
```

`1.3.6.1.4.1.44363.47.0` is `id-alg-mtcProof` — the experimental private-enterprise OID the draft
uses while its final OID is still TBD. A conventional path validator is expected to reject this
signature algorithm, which is the point: an MTC certificate must not be silently accepted as an
ordinary certificate by software that does not understand it.

Certificate SHA-256 (PEM file): `c57c946f2aeb5f1a086c5c54ee00040968fcdbc2c5bb61117ae22cf91de83d25`

## Result 3 — cross-validation against the reference implementation: 11 of 12

`mtc-interop` validates this harness against `bwesterb/mtc` (Bas Westerbaan's reference
implementation), i.e. against code with a different author:

```
  PASS  RFC 9162 Leaf Hash
  PASS  RFC 9162 Interior Hash
  PASS  RFC 9162 Tree Root (power of 2)
  PASS  RFC 9162 Tree Root (non-power of 2)
  PASS  RFC 9162 Tree Root (various sizes)
  PASS  Inclusion Proof Cross-Validation
  FAIL  Reference CA Roundtrip
        issue batch: issuing 0: Updating latest symlink: symlink 0 ...\ca/tmp\symlink-0-.../latest:
        A required privilege is not held by the client.
  PASS  Wire Format MerkleTreeCertEntry Null
  PASS  Wire Format MerkleTreeCertEntry TBSCert
  PASS  Wire Format MTCProof Roundtrip
  PASS  Wire Format MTCSignature Roundtrip
  PASS  Reference Tree Authentication Path

Results: 11 passed, 1 failed, 12 total
```

**The failure is environmental, and saying so is not the same as fixing it.** `os.Symlink` on
Windows requires `SeCreateSymbolicLinkPrivilege`, which requires administrator rights or Developer
Mode. This shell has neither. The failing case cannot run here; every case that exercises Merkle
math, proof construction, wire formats, and the reference implementation's authentication paths
passes.

It is reported as a failure rather than skipped, because a suite that hides its untested paths is
worse than one that is red.

---

## What this proves, and what it does not

| Established | Not established |
|---|---|
| An MTC certificate with an inclusion proof can be produced and verified locally, end to end | That this project implements MTC |
| The certificate remains parseable as X.509 with a standard tool | Conformance with draft -05 or -08 (harness is -01) |
| Our Merkle-tree understanding agrees with an independent reference implementation on hex values | Interoperability with any CA, including TrustAsia |
| The verification path does not require trusting the issuer's own state | That any of this is production-trusted |

The last row of the right column is the one that matters for the roadmap: this experiment closes
"can we verify an inclusion proof", it does not close "can our TLS stack negotiate MTC". The
prerequisite for the latter is a client that sends the `trust_anchors` ClientHello extension and
validates cosigner signatures — neither exists in this repository today, and neither is a small
change.

---

## Environment notes (why not Docker)

The original plan was DigiCert's `docker compose` path, including the 29-case ACME conformance
suite. Docker Desktop did not install on this machine, for two independent reasons:

1. **Network.** `winget install Docker.DockerDesktop` failed with `InternetReadFile() failed
   (0x80072ee2)`; a direct `curl` of the same installer was reset after ~1 MB (`curl: (56) Recv
   failure`) on three retries. The same network serves `mirrors.aliyun.com` and GitHub over SSH
   without trouble, so this is specific to that CDN path, not general connectivity.
2. **Privileges.** Docker Desktop's installer requires administrator rights; this shell does not
   have them and cannot obtain them.

Consequence: the ACME server and the 29-case conformance suite were **not** run, because
`mtc-bridge` requires PostgreSQL and MySQL and the container path was unavailable. What ran is the
issuance-and-proof path, which is the part that needed answering first.

Go was installed as a portable archive specifically to avoid both problems.

---

## Reproduction

```bash
# toolchain (portable, no installer)
curl -L -o go1.25.0.zip https://mirrors.aliyun.com/golang/go1.25.0.windows-amd64.zip
# unpack, then:
export PATH="$PWD/go/bin:$PATH"
export GOPROXY=https://goproxy.cn,direct

git clone https://github.com/digicert/ca-extension-mtc-playground
cd ca-extension-mtc-playground
go build -o bin/mtc-verify-cert ./cmd/mtc-verify-cert/
go build -o bin/demo-embedded-cert ./cmd/demo-embedded-cert/
go build -o bin/mtc-interop ./cmd/mtc-interop/

./bin/demo-embedded-cert -mtc-mode -domain demo.example.com -output /tmp/mtc-spec-cert.pem
./bin/mtc-verify-cert -cert /tmp/mtc-spec-cert.pem      # expect: [PASS] Inclusion proof valid
./bin/mtc-interop                                       # expect: 11 passed, 1 failed on Windows

openssl x509 -in /tmp/mtc-spec-cert.pem -text -noout     # expect: 1.3.6.1.4.1.44363.47.0
```

Expected deviations: `bin/` paths are `bin/*.exe` on Windows; `mtc-interop`'s one failure is
privilege-dependent as described above.

---

## What happens next

1. The TrustAsia onboarding request waits until this document exists — that was the sequencing
   decision, and it is now satisfied.
2. Before any request is sent, the draft-version question (-05 vs -08) must be asked explicitly;
   this harness proves the mechanism, not the revision.
3. `scripts/cross-validate-pqclean.cjs`'s `.rsp` path remains unimplemented by design: a guessed
   DRBG produces vectors that look correct and are not, which is worse than a red test.
