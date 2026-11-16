# Pinning the scheduled CBOM scan to cbom-tools 0.3.0

`.github/workflows/cbom-scheduled-scan.yml` pinned `cbom-tools@0.2.6`. The pin exists
so that week-over-week inventories stay comparable, but a pin is also a decision that
has to be revisited: 0.2.6 predates the rule-set work that shipped in 0.2.9 and the
evidence-based confidence model that shipped in 0.3.0. This note records what actually
changes in the artifact before the pin moves, so the step change that follows is
expected rather than discovered.

Date: 2026-11-16. Packages involved: `cbom-tools@0.2.6` (pinned) and
`cbom-tools@0.3.0` (`cbom-tools-v0.3.0` = `8b2c5d1`, published 2026-11-16T06:08:24Z).

## Method

Both versions scanned the same tree with the same flags.

| | |
|---|---|
| Target | full tracked tree of `fibemate` at `6edfe54`, 2,297 files |
| How obtained | `git clone --depth 1 --no-tags` — the tree `actions/checkout` gives this workflow: tracked files only, no `node_modules`, no local edits |
| 0.2.6 | `npm install cbom-tools@0.2.6` in a scratch directory |
| 0.3.0 | `cbom-tools` at `main` (`51a058b`) |
| Command | `node cli.cjs scan --dir <tree> --out <report>.json --spec 1.7` |
| Determinism | each version run two to three times; SHA-256 of the report with `metadata.timestamp` normalised is identical across runs (`9c8a34fcaa5e6573` for 0.2.6, `8d58bbecd97c28af` for 0.3.0), so every difference below is version-driven, not run-to-run noise |

```console
$ node <cli> scan --dir <tree> --out r026.json --spec 1.7
cbom-scan: wrote 19 algorithms to r026.json (CycloneDX 1.7)

$ node <cli> scan --dir <tree> --out r030.json --spec 1.7
cbom-scan: warning: occurrence cap 50 reached (dropped: ML-KEM+1089, SHA-256+375, ...)
cbom-scan: wrote 37 algorithms to r030.json (CycloneDX 1.7)
```

## 1. Components: 19 to 37, nothing removed

```
0.2.6   19 components   113,179 B
0.3.0   37 components   179,914 B
added 18, removed 0
```

| Class | Added in 0.3.0 |
|---|---|
| Classical (10) | `3DES` `AES-GCM` `Blowfish` `DSA` `ECDH` `ECDSA` `MD5` `RSA` `SHA-1` `X25519` |
| Post-quantum spellings (8) | `Dilithium` `Falcon` `Falcon-512` `Falcon-1024` `Kyber` `Kyber-512` `Kyber-768` `Kyber-1024` |

These are not new discoveries about the tree; they are entries 0.2.6 had no rules for.
The size of the rule set explains it: `cbom-scan.cjs` is 14,673 B in 0.2.6 and 33,670 B
in 0.3.0, which additionally ships `algorithm-hierarchy.cjs` (7,236 B). Four of the
additions are weak algorithms — `MD5`, `SHA-1`, `3DES`, `Blowfish` — whose absence from
the inventory was the more serious problem, and four are legacy PQC spellings that the
newer hierarchy maps to the standardized names.

**No component disappeared**, so the pin move cannot silently drop an asset.

## 2. Shared components: primitive and quantum-security level unchanged

All 19 shared components compare equal on the fields the workflow's validator and a
human reader care about:

```
cryptoProperties.assetType      algorithm on both sides, 19/19
algorithmProperties.primitive   19/19 identical (kem, signature, key-agree, hash,
                                block-cipher, pke, ae)
nistQuantumSecurityLevel        omitted on 19/19 in 0.2.6, 37/37 in 0.3.0
```

The omission is deliberate and documented in the report itself
(`fibemate:nistQuantumSecurityLevel:semantics` = "omitted means unknown/unassessed,
never 0"). Neither version asserts a quantum-security level for these assets, so the
bump changes no security judgement.

## 3. Confidence: 0.7 to 0.9 for every shared component

`evidence.identity[0].confidence` moves from 0.7 to 0.9 for all 19 shared components.
This is ADR-0001: confidence is a property of the evidence technique
(`source-code-analysis` 0.9, `manifest-analysis` 0.7), not of the algorithm family.
Before 0.3.0 every technique scored 0.7, which made "found in source" and "only seen in
a manifest" indistinguishable.

The method-level record says the same, and shows one case where the number stays put
while its meaning changes:

```
ML-KEM     manifest-analysis=0.7, source-code-analysis=0.7  ->  0.7, 0.9
Keccak     manifest-analysis=0.7                            ->  0.7
```

Keccak is manifest-only, so its identity confidence is still 0.7 — correct under the
new model, and no longer evidence that the tool treats all findings alike.

## 4. Occurrences: four components gained references

```
Ed25519   40 -> 48
ML-DSA    13 -> 15
ML-KEM    27 -> 29
SHA-512    1 -> 41
```

This is broader matching, not different semantics. 0.2.6 only recognised a hash
constructor call:

```js
// 0.2.6
{ re: /crypto\.createHash\(['"]sha-?512['"]\)/g, algs: ['SHA-512'] },
```

so it recorded exactly one SHA-512 reference in the tree
(`scripts/verify-release.cjs:130`). 0.3.0 keeps that rule and adds both a looser
constructor match and a bare token match:

```js
// 0.3.0
{ re: /\.createHash\(\s*['"]sha-?512['"]/g, algs: ['SHA-512'] },
{ re: /\bsha-?512\b/gi, algs: ['SHA-512'] },
```

which is what picks up `sha512` / `SHA-512` in `fips205/**`. More references per
component is the intended direction for an inventory; it does not affect any verdict.

Both versions cap occurrences at 50 per component, and they differ in whether they say
so. 0.2.6 capped silently: `SHA-256` sits at exactly 50 entries in its report with no
marker, so a reader cannot tell a component with 50 references from one with 500. 0.3.0
announces the cap on stderr and marks each affected component with
`fibemate:occurrencesTruncated` — 14 of them here (`ECDH`, `Keccak`, `Kyber`,
`ML-DSA`, `ML-DSA-44`, `ML-DSA-65`, `ML-DSA-87`, `ML-KEM`, `ML-KEM-768`, `SHA-256`,
`SLH-DSA`, `SM2`, `SM3`, `SM4`).

The cap itself is a known limitation of the scanner and is unchanged by this pin: the
report still does not say how many references were dropped, only that some were. Worth
its own issue; it does not affect the component set, the primitives or the counts the
workflow validates.

## 5. The workflow's validator passes on both

The `Validate the report` step asserts four things: the file parses, `specVersion` is
`1.7`, `components` is non-empty, and at least one component carries
`cryptoProperties`. Replaying it against both reports:

```
0.2.6   PASS   components=19 withCryptoProperties=19   algorithm: 19
0.3.0   PASS   components=37 withCryptoProperties=37   algorithm: 37
```

There is no count threshold, no name assertion and no upper bound, so no input in this
pair can make the step red. The only visible difference in the job is the summary line
(`Components: 19` becomes `37`) and the artifact itself.

## Decision

Bump the pin to `0.3.0`, and treat the first run afterwards as a new baseline.

- The gate is unaffected: both versions pass the same validator, and nothing was
  removed from the inventory.
- Staying on 0.2.6 has a cost that is invisible by design: the nightly inventory has
  been omitting MD5, SHA-1, 3DES, Blowfish, RSA, DSA, ECDSA, ECDH, X25519, AES-GCM and
  the Kyber/Falcon/Dilithium spellings, and a run that under-reports looks exactly like
  a run that found nothing.
- The 30-day artifact history will show one step change in component count, then
  stabilise. This is recorded here and in a comment next to the pin so that a later
  reader does not read the step as a regression.

Out of scope: changing the scanner, changing the validator, or comparing against the
`tools/cbom-cyclonedx.json` artifact that `ci.yml` gates (a different question — that
one is generated from this repository's own tooling and drift-checked separately).
