# CycloneDX 1.7 optional-field loss — verification record

**Date:** 2026-10-28 (Asia/Shanghai)
**Subject:** `cyclonedx-python-lib` 11.12.0
**Status:** reproducible; re-measured from a clean virtual environment on the date above.

摘要：把一份带 `algorithmFamily` / `ellipticCurve` / `parameterSetIdentifier` 的
CycloneDX 1.7 文档交给官方 Python 库解析再输出，四个方向全部丢掉前两个字段，只保留
第三个；输出的文档仍然通过官方 1.7 schema 校验。也就是说，「校验通过」不能证明
「数据还在」。

---

## 1. What was tested

The CycloneDX 1.7 schema adds optional `algorithmProperties` fields used to describe
post-quantum and modern algorithms. Optional means: a document without them is still
valid. That is the property this record exploits — dropping them cannot be detected by
schema validation, and the library emits no warning while doing it.

Three fields were carried in a minimal, schema-valid document:

| field | value used | why this field |
|---|---|---|
| `algorithmFamily` | `SHA-3` | the family label a consumer needs to interpret the primitive |
| `ellipticCurve` | `secp256r1` | curve identity; without it a `key-agree` asset is underspecified |
| `parameterSetIdentifier` | `256` | control: this one is modelled by 11.12.0 and must survive |

## 2. Method

`verify_cyclonedx_data_loss.py` (in this directory) does not use the library's
constructor API to build the document — that would only test what the library can
represent. It hands the library a document that **already contains** the fields, asks it
to parse and re-emit, and then reads the emitted document back. This is the round trip a
tool performs when it ingests a CBOM and passes it on.

Four paths are exercised, because a loss in only one serialiser would be a different
(defensible) bug than a loss in all four:

1. JSON in → JSON out
2. JSON in → XML out
3. XML in → JSON out
4. XML in → XML out

The emitted JSON is additionally validated against the schema bundled with the library
(`cyclonedx/schema/_res/bom-1.7.SNAPSHOT.schema.json`) so that "valid" is measured, not
assumed.

## 3. Measured results

```
cyclonedx-python-lib: 11.12.0

JSON in -> JSON out / XML out
  json->json algorithmFamily          LOST (got None)
  json->json ellipticCurve            LOST (got None)
  json->json parameterSetIdentifier   kept (got '256')
  json->xml  algorithmFamily          LOST (got None)
  json->xml  ellipticCurve            LOST (got None)
  json->xml  parameterSetIdentifier   kept (got '256')

XML in -> JSON out / XML out
  xml->json  algorithmFamily          LOST (got None)
  xml->json  ellipticCurve            LOST (got None)
  xml->json  parameterSetIdentifier   kept (got '256')
  xml->xml   algorithmFamily          LOST (got None)
  xml->xml   ellipticCurve            LOST (got None)
  xml->xml   parameterSetIdentifier   kept (got '256')

emitted document against the bundled 1.7 schema: valid
RESULT: 8 field(s) dropped: json->json/algorithmFamily, json->json/ellipticCurve,
        json->xml/algorithmFamily, json->xml/ellipticCurve, xml->json/algorithmFamily,
        xml->json/ellipticCurve, xml->xml/algorithmFamily, xml->xml/ellipticCurve
```

Eight drops out of twelve cells, in both directions of both formats. The control field
survives, which rules out "the whole `algorithmProperties` block was discarded" and
narrows the failure to specific model fields.

## 4. The part that matters

The document that came out had lost two of the three fields **and validated**. A CI step
that checks `cyclonedx validate` on that output is green, and a reviewer reading the
validation badge learns nothing about whether the fields survived.

This is the false green pattern in its general form: the check that is easy to run
(schema conformance) answers a different question from the one that matters (did the
data survive the trip). Optional fields make the two questions permanently
distinguishable, and the schema cannot be fixed to close the gap — the whole point of
`optional` is that absence is allowed.

## 5. Upstream context

`CycloneDX/cyclonedx-python-lib` PR **#1015** ("feat(crypto): support standardized
algorithm identifiers") is open as of 2026-10-28, head `1af5683`. The 11.12.0 model
exposes `parameter_set_identifier`, `curve`, and no `algorithm_family` at all, which is
consistent with the loss measured here: the JSON/XML readers have nowhere to put the
value.

This record does not assert what #1015 does or does not fix beyond that model gap; the
honest statement is that the fields are absent from 11.12.0's model, and the loss
follows from that. A verification comment with the same four-path method was posted on
that PR on 2026-10-27.

## 6. Reproduction

```bash
python -m venv venv
venv/bin/pip install cyclonedx-python-lib==11.12.0 jsonschema
venv/bin/python verify_cyclonedx_data_loss.py; echo "exit=$?"
```

Exit code `0` means every field survived (i.e. the bug is fixed and this record is
historical); `1` means fields were dropped; `2` means the environment could not be set
up. The script prints the library version first, so a result can never be attributed to
the wrong version by accident.

## 7. Limits / non-claims

- **One library, one version.** This says nothing about the JavaScript, Go, Java or .NET
  CycloneDX implementations, or about other versions of this one.
- **Not a vulnerability.** No memory unsafety, no injection, no privilege boundary is
  crossed. It is silent data loss in a data-interchange tool, which is why it belongs in
  a methodology paper rather than a CVE queue.
- **Field-level, not document-level.** Other 1.7 additions were not audited here; three
  fields were chosen because one is a control and two are used by CBOM producers.
- **No claim about deployed users.** The consequence for any specific downstream
  consumer was not measured.

## 8. Provenance

- This file and `verify_cyclonedx_data_loss.py` are covered by an RFC 3161 timestamp
  (FreeTSA) under this directory; digests are listed in `ASSET-MANIFEST.md`, which is
  itself timestamped.
- The measurement was run on Python 3.11.10 (Windows), `cyclonedx-python-lib` 11.12.0,
  `jsonschema` from PyPI, both installed into a fresh virtual environment created for
  this purpose.
