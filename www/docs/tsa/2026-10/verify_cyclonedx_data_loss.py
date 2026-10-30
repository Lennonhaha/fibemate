#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Reproduce the CycloneDX 1.7 optional-field loss in cyclonedx-python-lib.

Method: hand the library a schema-valid 1.7 document that carries three optional
`algorithmProperties` fields, ask it to parse and re-emit the document, then read
the emitted document back and report which fields survived.

This is the round-trip a tool performs when it ingests a CBOM and hands it on:
no exception, no warning, and a document that still validates - with data gone.

Exit codes: 0 all fields survived, 1 fields were dropped, 2 setup error.

    python -m venv venv
    venv/bin/pip install cyclonedx-python-lib==11.12.0
    venv/bin/python verify_cyclonedx_data_loss.py
"""
import json
import sys
import xml.etree.ElementTree as ET

try:
    import cyclonedx
    from cyclonedx.model.bom import Bom
    from cyclonedx.output import make_outputter
    from cyclonedx.schema import OutputFormat, SchemaVersion
except Exception as exc:  # pragma: no cover
    print("SETUP ERROR: %s" % exc)
    sys.exit(2)

FIELDS = {
    "algorithmFamily": "SHA-3",
    "ellipticCurve": "secp256r1",
    "parameterSetIdentifier": "256",
}

INPUT_JSON = {
    "bomFormat": "CycloneDX",
    "specVersion": "1.7",
    "version": 1,
    "components": [
        {
            "type": "cryptographic-asset",
            "bom-ref": "crypto:silent-loss-probe",
            "name": "silent-loss-probe",
            "cryptoProperties": {
                "assetType": "algorithm",
                "algorithmProperties": dict(FIELDS, primitive="hash"),
                "cryptoFunctions": ["digest"],
            },
        }
    ],
}

INPUT_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.7" version="1" serialNumber="urn:uuid:00000000-0000-4000-8000-000000000000">
  <components>
    <component type="cryptographic-asset" bom-ref="crypto:silent-loss-probe">
      <name>silent-loss-probe</name>
      <cryptoProperties>
        <assetType>algorithm</assetType>
        <algorithmProperties>
          <primitive>hash</primitive>
          <algorithmFamily>SHA-3</algorithmFamily>
          <ellipticCurve>secp256r1</ellipticCurve>
          <parameterSetIdentifier>256</parameterSetIdentifier>
        </algorithmProperties>
        <cryptoFunctions><cryptoFunction>digest</cryptoFunction></cryptoFunctions>
      </cryptoProperties>
    </component>
  </components>
</bom>
"""


def emitted_json(bom) -> dict:
    text = make_outputter(bom, OutputFormat.JSON, SchemaVersion.V1_7).output_as_string()
    props = json.loads(text)["components"][0]["cryptoProperties"]["algorithmProperties"]
    return {k: props.get(k) for k in FIELDS}


def emitted_xml(bom) -> dict:
    text = make_outputter(bom, OutputFormat.XML, SchemaVersion.V1_7).output_as_string()
    ns = {"b": "http://cyclonedx.org/schema/bom/1.7"}
    node = ET.fromstring(text).find(".//b:cryptoProperties/b:algorithmProperties", ns)
    out = {k: None for k in FIELDS}
    if node is not None:
        for k in out:
            el = node.find("b:" + k, ns)
            out[k] = el.text if el is not None else None
    return out


def schema_valid(text: str) -> str:
    """Validate an emitted JSON document against the schema bundled with the library."""
    try:
        import jsonschema
        from pathlib import Path
        import cyclonedx.schema as schema_pkg
        path = Path(schema_pkg.__file__).parent / "_res" / "bom-1.7.SNAPSHOT.schema.json"
        if not path.exists():
            return "schema file not found"
        jsonschema.validate(json.loads(text), json.loads(path.read_text()))
        return "valid"
    except ImportError:
        return "jsonschema not installed"
    except Exception as exc:
        return "INVALID: %s" % exc


def report(label: str, got: dict, lost: list) -> None:
    for field, want in FIELDS.items():
        have = got.get(field)
        ok = have == want
        if not ok:
            lost.append("%s/%s" % (label, field))
        print("  %-10s %-24s %s (got %r)" % (label, field, "kept" if ok else "LOST", have))


def main() -> int:
    print("cyclonedx-python-lib: %s" % getattr(cyclonedx, "__version__", "unknown"))
    lost = []

    bom = Bom.from_json(INPUT_JSON)
    print("\nJSON in -> JSON out / XML out")
    report("json->json", emitted_json(bom), lost)
    report("json->xml", emitted_xml(bom), lost)

    bom_x = Bom.from_xml(ET.fromstring(INPUT_XML))
    print("\nXML in -> JSON out / XML out")
    report("xml->json", emitted_json(bom_x), lost)
    report("xml->xml", emitted_xml(bom_x), lost)

    emitted = make_outputter(bom, OutputFormat.JSON, SchemaVersion.V1_7).output_as_string()
    print("\nemitted document against the bundled 1.7 schema: %s" % schema_valid(emitted))

    if lost:
        print("RESULT: %d field(s) dropped: %s" % (len(lost), ", ".join(lost)))
        return 1
    print("\nRESULT: all three fields survived every path")
    return 0


if __name__ == "__main__":
    sys.exit(main())
