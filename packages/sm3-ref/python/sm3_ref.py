#!/usr/bin/env python3
"""SM3 Python reference + KAT generator + JS cross-validation companion"""
from gmssl import sm3
import json
import os

# ── GBT 32905 standard test vectors (from the spec) ──
STANDARD_VECTORS = [
    {
        "desc": "GBT 32905 TV0: 'abc' × 1",
        "msg_hex": "616263",
        "md": "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0",
    },
    {
        "desc": "GBT 32905 TV1: 'abcd' × 16 (512 bits / 64 bytes)",
        "msg_hex": "6162636461626364616263646162636461626364616263646162636461626364"
                   "6162636461626364616263646162636461626364616263646162636461626364",
        "md": "debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732",
    },
]

# ── self-check ──
print("=== GBT 32905 Standard Test Vectors ===")
all_tv_ok = True
for tv in STANDARD_VECTORS:
    msg_bytes = bytes.fromhex(tv["msg_hex"])
    h = sm3.sm3_hash(list(msg_bytes))
    ok = h == tv["md"]
    print(f"  {tv['desc']}: {'PASS' if ok else 'FAIL'}")
    if not ok:
        print(f"    expected: {tv['md']}")
        print(f"    got:      {h}")
        all_tv_ok = False

# ── JS-style input test: sm3 hash of raw bytes ──
# The JS sm3 is called as sm3(byteArray) — let's test with known input
# input: byte array for string "abc" = [97, 98, 99]
h_abc = sm3.sm3_hash([97, 98, 99])
print(f"\nJS-style sm3_hash([97,98,99]): {h_abc}")
print(f"  matches TV0: {h_abc == STANDARD_VECTORS[0]['md']}")

# ── Generate KAT vectors ──
import random
random.seed(0x7a6d)

kat_vectors = []
for i in range(30):
    # mix of short ascii, random bytes, empty, etc
    if i < 10:
        msg = f"FIBEMATE-SM3-KAT-{i:03d}"
        msg_bytes = msg.encode('utf-8')
    elif i < 20:
        rlen = random.randint(1, 200)
        msg_bytes = bytes([random.randint(0, 255) for _ in range(rlen)])
    else:
        rlen = random.randint(1, 500)
        msg_bytes = bytes([random.randint(0, 255) for _ in range(rlen)])

    h = sm3.sm3_hash(list(msg_bytes))
    kat_vectors.append({
        "count": i,
        "len": len(msg_bytes),
        "msg": msg_bytes.hex(),
        "md": h,
    })

# verify
for v in kat_vectors:
    h2 = sm3.sm3_hash(list(bytes.fromhex(v["msg"])))
    assert h2 == v["md"], f"self-verify failed at #{v['count']}"

out_dir = os.path.dirname(os.path.abspath(__file__)) + "/../test/kat"
os.makedirs(out_dir, exist_ok=True)

# JSON
json_path = os.path.join(out_dir, "sm3-KAT.json")
with open(json_path, "w") as f:
    json.dump(kat_vectors, f, indent=2)
print(f"\nWrote {json_path} ({len(kat_vectors)} vectors)")

# RSP (NIST-like)
rsp_path = os.path.join(out_dir, "sm3-KAT.rsp")
with open(rsp_path, "w") as f:
    f.write("# SM3 KAT vectors — FIBEMATE sm2-ref\n")
    f.write(f"# Algorithm: SM3\n# Generated: 2026-07-22\n")
    f.write("# Python reference: gmssl sm3.sm3_hash\n#\n")
    for v in kat_vectors:
        f.write(f"Count = {v['count']}\n")
        f.write(f"Len = {v['len']}\n")
        f.write(f"Msg = {v['msg']}\n")
        f.write(f"MD = {v['md']}\n\n")
print(f"Wrote {rsp_path}")

print(f"\n=== SUMMARY ===")
print(f"  Standard vectors: {'ALL OK' if all_tv_ok else 'FAIL'}")
print(f"  KAT vectors generated: {len(kat_vectors)}")
print(f"  Self-verified: {len(kat_vectors)}/{len(kat_vectors)}")
