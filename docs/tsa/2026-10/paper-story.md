# Paper story — FIBEMATE tooling line

Target venues, in order of fit:

1. **USENIX Security / CCS Artifact Track** — the tooling already has the shape artifacts
   need (reproducible packaging, signed releases, offline audit), and the artifact track
   rewards exactly the thing this work is strongest at: evidence that the artifact does what
   the paper says.
2. **ICSE / FSE (tool + empirical track)** — if the emphasis lands on "how practitioners get
   false assurance from SBOM tooling", the software-engineering venues are the better home.

Both need the same three contributions stated the same way. What follows is the story, not a
result set: every number is marked `[measured]`, `[in progress]` or `[planned]`.

## Working title

**False Green in Post-Quantum SBOM Tooling: Optional Fields, Silent Data Loss, and an
Auditable Alternative**

## Contribution 1 — Empirical: how the ecosystem produces false assurance

Claim: the dominant failure mode of CBOM/SBOM tooling for post-quantum migration is not a
crash or a wrong answer, it is a **well-formed, schema-valid document that silently carries
less information than it appears to**.

Two measured cases:

- **Silent field loss in a standards-conformant serializer.** In `cyclonedx-python-lib`
  11.12.0, `algorithmProperties.algorithmFamily` and `ellipticCurve` are dropped in both JSON
  and XML output; the result still validates against the CycloneDX 1.7 schema. `[measured]`
  Reported as an independent verification comment on the upstream tracking PR rather than as
  a bug report, because 1.7 support is a tracked known-missing feature, not a regression —
  the interesting part is the *silence*, not the gap.
- **Optional-field incompleteness in our own audit corpus.** 2,263 claims across 345 documents:
  before the sealed-artifact glob was repaired, `docs/tsa/**` matched zero real labels (real
  labels look like `fibemate/docs/tsa/…`), so 45 timestamped artifact declarations were judged
  `unbound` — a permanent zero-match rule, i.e. a rule that cannot fail loudly. `[measured]`
  After repair: `sealed=45`, `unbound 1768→1728`, `verified 138→135` (three of the 45 were
  previously counted as verified under a looser rule).

The generalisation to defend in the paper: **a tool that only reports "valid / invalid" cannot
distinguish "checked and clean" from "not checked at all"**. Practitioners read the first.

## Contribution 2 — Method: separating declaration state from evaluation state

Claim: audit results should be a **partial order with explicit unknowns**, not a boolean.

`verifact` assigns each claim a *declaration state* (is the artifact present, hashed, and
timestamped?) independently of an *evaluation state* (does the code do what the claim says?),
and refuses to collapse the two. Concretely:

- content-addressed binding between a claim and a file digest, so a claim cannot silently
  follow a file that changed;
- strict inequality checks (a claim is `verified` only if every required field matches; a
  missing field is `unbound`, never a pass);
- an explicit `ambiguous` bucket and a `drift` counter, both of which must be reported to the
  reader — the arithmetic on the published page has to reconcile
  (`137+0+213+1768=2118`, `2118+17+1=2136`, `2136+126=2262` `[measured]`), and a page that
  does not reconcile renders red instead of rendering normally.

The methodological contribution is the **reconciliation rule**: any summary number shown to a
user must be derivable from the counts displayed beside it. This is what makes the false-green
class detectable at all; it is also the cheapest possible defence and, in our survey of
comparable tools, an uncommon one. `[in progress: same-arithmetic check on Trivy/Syft output]`

## Contribution 3 — Evidence: publishing cross-implementation agreement as a record

Claim: conformance between two post-quantum implementations can be *published as evidence*
rather than asserted as a compatibility note, and doing so is what makes the difference between
"our tests pass" and "these two independently written ends agree, byte for byte, and here is the
record."

To our knowledge, this is the first two-end interoperability matrix built on an independent oracle, published
with per-cell hex, a timestamp, and an executable that lets a third party check the record was not altered
after the fact. `[measured, lg-116]`

Two qualifications belong here rather than in the limitations, because they change how the claim should be
read. **"Independent" describes the oracle, not the ends**: the reference end is `@noble/post-quantum` 0.7.1,
installed from the registry and pinned by source digest; the other end is ours. In the three-way audit the
two library-backed ends — Rust and the WASM artifact — both delegate to `libcrux-ml-kem`, so they are one
implementation compiled twice, not two implementations. Only the noble comparison is independent. **"Published
as a record" is not "verified by a third party"**: the mechanism and the harness are public, but the runs
reported here were performed by us, and a reviewer should treat the published procedure as the claim, not our
exit code.

The matrix runs four cells over three seeds: each cell fixes one end as key generator, the other
as encapsulator, and decapsulates back at the first — so `PN` and `NP` are the cross rows that a
single-implementation test can never contain. Every cell reports three *separate* claims, never a
merged verdict:

| column | question | what it catches |
|---|---|---|
| round trip | does decapsulation return the sender's secret? | real interop failure; the only validity criterion for a baseline cell |
| `ss =P` | is the shared secret byte-identical to the reference end? | an implementation that agrees with itself but applies an extra KDF, hash, or truncation |
| `ct bytes =P` | is the ciphertext byte-identical? | encoding or compression drift that still decapsulates |

Separating them is not stylistic. A Kyber-round-3 KDF difference passes both the round trip and
the ciphertext comparison and fails only `ss =P` — merge the three and the finding disappears
into a green cell. `[measured]`

Endpoints are `fibemate-pqc-kem` 0.1.0 and `@noble/post-quantum` 0.7.1; the second is installed
from the registry and pinned by source digest, not vendored, so "independent" is checkable rather
than claimed. Seeds are derived from a labelled SHAKE-256 string, published in the specification,
and re-derived at run time — a stale seed table aborts the run instead of producing silently
different artifacts. `[measured]`

Result of the sealed run: **62/62 checks, 12 rows, 6 baselines, 0 failed** — public keys and
secret keys byte-identical across ends on all three seeds, ciphertexts byte-identical per cell,
all four cross rows decapsulating to the sender's secret. Three controls run on every seed: a
flipped ciphertext yields a deterministic secret with no exception and the same secret on both
ends; a wrong key does not return the sender's secret; three seeds yield three distinct public
keys. `[measured, lg-116]`

Agreement between two implementations is not a security claim; it is a claim that they compute the same thing.

The record is sealed rather than described: an RFC 3161 token (FreeTSA) over a digest list of the
14 artifacts — the machine-readable matrix, its rendered form, and the 12 raw hex logs — with the
token imprint, the worktree digest and the committed blob digest all equal. The chain is stated
where it can be checked: the token seals the digest list, the list plus a public commit seals the
artifacts, and neither says the matrix is correct — that is what the self-test is for, which
demonstrates the harness can fail in four distinct ways (baseline pass, cross-end fail, two
independent invalidity modes, stale seeds) before it is trusted to report a pass. `[measured]`

### Checking the record is a separate job from producing it

A sealed record is auditable, not audited. The distinction matters because the two obvious ways to fake one
are invisible to a value-level checker: change a number, or change a byte that no number depends on. So the
sealing step ships with `verify-evidence`, a standalone checker that takes the digest list, the RFC 3161 token,
the CA bundle and — for nonce binding — the original request, and performs the chain in the order that
makes each failure nameable: per-file SHA-256 against the manifest, manifest digest against the token imprint,
`openssl ts -verify` against the CA, and the request nonce against the token. It exits `0` verified, `1` drift,
`2` usage error, `3` unverifiable — the last one separate on purpose, because "the inputs needed to decide
were not present" must never render as "passed".

The harness asserts each of those paths rather than describing them, on the same 14-artifact record.
These five rows are not the matrix harness's own four self-test modes described above: those perturb the
harness before a run, these perturb the published record after sealing — which is the threat model a reader
of the record actually faces.

| # | perturbation | value-level checker (`verifact`) | record checker (`verify-evidence`) |
|---|---|---|---|
| S0 | none | exit 0, 3 claims verified | `verified`, exit 0 |
| S1 | a published number changes (62 → 61) | `drift`, exit 1 | `drift`, exit 1 |
| S2 | one byte changes, no number touched | **exit 0, still green** | `drift`, exit 1 |
| S3 | S2 plus the digest list itself rewritten | exit 0 | `drift`, exit 1 (imprint) |
| S4 | CA bundle omitted | — | `unverifiable`, exit 3 |

S2 is the row worth the page space. It is not a bug in the value checker: the checker was asked whether the
document still says what it said, and it does. It is evidence that **semantic verification and integrity
verification answer different questions** and that a green result from the first is routinely read as the
second. S3 closes the obvious repair — rewriting the digest list — by moving the anchor to a signature over
the list. S4 exists so the tool cannot be used as a rubber stamp when it is missing an input.

The checker is run by hand, not in CI, and that is a limitation rather than a design choice: it spans two
repositories and needs a local CA bundle and a local `openssl`, so wiring it into a single-repo workflow would
mean either vendoring the record or fetching it at run time. Neither is worth it yet; what is asserted today is
the eleven scenario expectations, which fail loudly if the chain degrades.

The other half of the same question — can the thing that says "verified" be made to say "no"? — is tested by
breaking the implementation on purpose. Forcing the ML-DSA verification predicate to return `true` and pushing
it to a throwaway branch turned the matrix red, and the first attempt is instructive: the run failed at
`cargo fmt --check`, before a single test executed. A red build at a formatting gate proves nothing about test
coverage; the probe was repaired, re-pushed, and only then did the failure land where it had to — 177 passed,
5 failed, with the ACVP signature verification vector and two protocol-level tests among the failures, which
establishes that signature checking is consumed by the protocol layer and not merely present in it. A second
mutation, returning the ciphertext prefix instead of the decapsulated secret, was caught by one unit test and
**not** by the ACVP decapsulation vector, because that vector exercises the typed entry point and not the
byte-level wrapper — a coverage gap the run itself exposed. `[measured]`

The same audit re-derived the headline numbers from a second harness: 182 tests passing with 0 ignored (from
178 passing and 4 ignored before the migration, all four ignored vectors being the ones that could not run
against the previous library), and three fixed seeds compared across Rust, the WASM artifact and noble at
12/12 byte-equality checks per seed for public key, secret key, ciphertext and shared secret, with the
ciphertext and shared-secret digests matching the sealed matrix. `[measured]`

The negative results are the reason to believe the positive one. Every conformance defect in this
project that the matrix would have caught was in fact found by an oracle and not by the project's
own tests: a KEM module whose key generation hashed the seed directly instead of going through
the FIPS 203 domain-separated expansion; a signature key generator missing the `k‖ℓ` domain
separation, the third instance of that same bug family; and a WASM build that was Kyber-768 rather
than ML-KEM-768, differing only in the final KDF step. `[measured]` The three cases are detailed
below, because the reason internal tests missed them is structural rather than accidental.

Tooling is the instantiation, not the claim: `cbom-tools` generates the CBOMs and keeps its
shipped `files[]` list in sync with every runtime `require` by a publish-contract test; `verifact`
produces the claim ledger (offline, no network at verification time); `crypto-time-ledger` binds
artifacts to RFC 3161 timestamps and exports a self-verifying offline bundle;
`crypto-hallucination-detector` screens generated code for cryptographic API misuse; releases go
through GitHub Actions with OIDC, Sigstore signatures and SLSA provenance, and are verified by
re-downloading from the registry and recomputing digests rather than by trusting the publish log.
What the paper argues is the method — fix an independent oracle, keep the claims separate, make
the record reproducible and time-stamped, and treat "cannot fail" as a defect to be demonstrated.

### Baseline comparison: what each kind of evidence can and cannot see

The three cases below are what a cross-language test that shares one reading cannot see in
principle, not what it happened to miss: in each, the code and its tests encoded the same
misunderstanding, so the suite was green by construction.

| case | what was wrong | why internal tests could not catch it |
|---|---|---|
| `src/crypto/ml-kem-768-td.js` (deleted in `4064ba8`) | key generation hashed the seed directly, `sha3_512(d)` at lines 275 and 486, instead of the FIPS 203 expansion `G(d‖k)` | tests compared the module against itself; with the independent oracle, three-way interop failed on every path |
| `packages/fml-dsa/src/core/keygen.js` | the seed expansion omitted the `k‖ℓ` domain separation, producing 96 bytes where FIPS 204 Algorithm 4 line 2 requires 128 | the encoder and decoder mirrored the same convention, so round trips were clean |
| `packages/fml-dsa/src/core/encode.js` | secret-key packing used `s+η` and bare `t0`; §5.2.2 requires `η−s` and `2^(d−1)−t0` | a self-consistent encode/decode pair; byte comparison against the oracle was the only way to see it |

A fourth case has a different shape and is worth naming separately: the WASM build that was in use
until 2026-10-29 is Kyber-768, not ML-KEM-768. Ciphertexts are interchangeable and each end's shared
secret is "correct" for its own reading of the standard — the only signature is that the two secrets
differ by a KDF, `SHAKE256(ss_P ‖ SHA3-256(ct)) = ss_W`, holding in both directions. Nothing raises
an error; the caller simply derives a different key than its peer. `[measured]` The case has since
been closed by shipping a `libcrux`-built artifact and retiring the old one (#377, #385), and it
stays in the record because that failure mode — a mutually consumable ciphertext with a divergent
KDF — is precisely what the `ss =P` column exists to catch, and precisely what a round-trip test
reports as success.

| property | KAT / test-vector conformance | single-implementation test suite | cross-language tests in-tree | this matrix |
|---|---|---|---|---|
| reference is independent of the code under test | yes — vectors come from the standard | no | no — both sides share the same reading | yes — other implementation, installed from the registry, digest-pinned |
| can detect "self-consistent but wrong" | yes, if the vectors are complete | no | no | yes — measured three times in this project |
| covers two ends producing and consuming each other's artifacts | no — vectors are inputs, not peers | no | yes, when both ends exist | yes, including both cross directions |
| separates interop from byte-identity from KDF identity | n/a | no | no — usually one boolean | yes — three columns, deliberately not merged |
| reproducible from a published seed | partial — vectors are data, not processes | rarely | no | yes — seeds in the specification, re-derived and checked at run time |
| failure modes of the harness itself are demonstrated | no | no | no | yes — four self-test runs, two of which must report invalid |
| the record is time-stamped and offline-verifiable | no | no | no | yes — RFC 3161 token over a digest list of all artifacts |

What this comparison is *not* claiming: that KAT tests are dispensable. They answer a different
question — does the implementation match the standard on chosen inputs — and the matrix answers
whether two implementations agree with each other on inputs neither chose. A project needs both,
and the interesting finding is that the first is routinely mistaken for the second.

## Limitations and threats to validity

State them before a reviewer does.

- **"Interoperable" and "secure" are different claims, and this record only supports the first.**
  The matrix shows that two implementations agree on the same bytes; it does not say that agreeing
  is safe. Two ends can interoperate perfectly on a parameter set that should not be deployed, or
  under a protocol that negotiates a weaker mode than either end believes. The matrix answers "do
  they understand each other", never "should they be used".
- **Agreement is not correctness.** The oracle is third-party code, not the standard itself. Two
  implementations can share a misreading; the matrix raises confidence and bounds the class of
  divergence, it does not prove conformance. Only KATs plus an argument about the derivation do
  that, and the two evidence types should be reported together.
- **Two ends, one parameter set, one primitive.** ML-KEM-768 only; both ends are software; no
  signature scheme in the matrix yet. Agreement between two implementations does not generalise to
  a third, and says nothing about hardware or embedded targets.
- **Three ends are not three implementations.** In the three-way audit, Rust and WASM both build on
  `libcrux-ml-kem`; the only independent comparator is noble. Counting "three ends agree" as three
  independent confirmations would overstate the evidence by a factor of two.
- **The record checker runs outside CI.** `verify-evidence` is executed by hand against the sealed
  artifacts; the harness asserts its eleven expectations, but nothing prevents a later record from
  being published without a run. Until that is wired into the release path, the guarantee is that
  the tool works, not that every record passed through it.
- **The matrix does not test the deployment envelope.** It says the artifacts interoperate; it
  does not say a TLS handshake using them is complete, that downgrade paths are closed, or that the
  surrounding protocol is sound. Our own evidence set has the same boundary: KATs and TVLA speak to
  implementation correctness and side-channel behaviour respectively, neither speaks to envelope
  completeness.
- **Deterministic mode measures parity, not randomness quality.** Seeds are injected to make
  results comparable, so the run says nothing about either end's RNG. Randomised runs are a
  separate, weaker check — interop only, no byte comparison — and are labelled as such.
- **No side-channel or timing claim.** Byte-identical output under injected randomness is
  compatible with a timing leak; constant-time properties are measured separately and are not part
  of this record.
- **Negative-space coverage is three controls, not a fuzz campaign.** Malformed ciphertexts,
  wrong-length keys and adversarial encodings are handled by the implementations' own validation
  suites; the matrix does not attempt to characterise rejection behaviour.
- **The corpus is one project's documents plus one external library.** The field-loss finding is
  generalisable only insofar as other serializers share the "optional field, silent drop" pattern —
  which is exactly what the comparative study must show.
- **Counting claims is sensitive to how a "claim" is segmented.** The paper must publish the
  segmentation rule and a sample, not just totals.
- **Timestamps prove existence, not correctness.** A TSR on a wrong file is a well-attested wrong
  file, and the paper should say so in those words.
- **We are the authors of the tool being evaluated.** The mutation tests and the external schema
  validation are there to make that bias expensive, not to remove it.

## Why this is not the previous three submissions

The three rejected drafts read as project documentation: what we built, in the order we built
it. This one opens with a failure mode that exists independently of us, measures it in someone
else's code as well as our own, states a method that would have caught it, and only then
presents tooling as the instantiation. The negative results — the fixture that cannot judge,
the gate that was green because its regex matched a string literal, the package that shipped
without a module — are evidence, not embarrassment, and they belong in the evaluation section.
