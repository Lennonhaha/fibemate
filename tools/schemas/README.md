# Vendored CycloneDX schemas

These files are vendored so `tools/validate-cbom.cjs` can validate the CBOM with
no external checkout (CI, air-gapped runs, contributors without the tools repo).

| File | Bytes | SHA-256 |
|---|---|---|
| `bom-1.6.schema.json` | 262666 | `18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d` |
| `spdx.schema.json` | 63418 | `4b345e2329f209f34e960ae2a8e7cb46a166907e6a45e94978565925dc47b359` |
| `jsf-0.82.schema.json` | 8058 | `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae` |

Source: `fibemate-tools/cbom-tools/test/fixtures/` (the same fixtures the
cbom-tools test suite validates against), copied byte-for-byte.

## Why all three, not just bom-1.6

`bom-1.6.schema.json` is **not self-contained**. It references:

- `spdx.schema.json` (license expressions)
- `jsf-0.82.schema.json#/definitions/signature` (JSON Signature Format)

Loading `bom-1.6.schema.json` alone makes ajv fail at compile time with
`can't resolve reference spdx.schema.json from id
http://cyclonedx.org/schema/bom-1.6.schema.json`. All three must be present.

## Updating

Re-copy all three together and update the hashes above. Do not hand-edit these
files: they are upstream artifacts, and a local edit silently changes what
"VALID" means.

Note on provenance: the upstream hash was cross-checked against the copy in
`fibemate-tools` (identical), but a direct fetch from `cyclonedx.org` could not
be completed from this machine (outbound HTTPS blocked), so the values above are
"vendored copy is identical to the tools-repo fixture", not "re-verified against
upstream today".
