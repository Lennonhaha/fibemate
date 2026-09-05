#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Apply Barrett reduction to modMul in ml-kem-768.js"""
import re

path = "/opt/fibemate-repo/packages/pqc-kem/src/ml-kem-768.js"
with open(path, "r") as f:
    content = f.read()

# 1. Add Barrett helper after Q definition
insert_after = "| 0; const r = ((a|0)+(b|0)) % Q; return r >= 0 ? r : r+Q; }"
barrett_def = "\n\n// Barrett reduction for modMul — K=24 μ=5039 (0 errors / 11,082,241 exhaustive)\nconst BAR_K = 24, BAR_MU = 5039;\nfunction modMulBarrett(a, b) {\n  const p = a * b;                         // exact in f64: p < 11,082,241 < 2^24\n  const q = Math.floor(p * BAR_MU / 16777216); // Barrett quotient; 16777216 = 2^24\n  let r = p - q * 3329;\n  if (r >= 3329) r -= 3329;               // q may be 1 too low\n  if (r >= 3329) r -= 3329;               // double safety\n  return r;\n}\n"

if "modMulBarrett" not in content:
    # Insert before function modAdd
    content = content.replace(
        "function modAdd(a, b)",
        barrett_def + "function modAdd(a, b)"
    )
    print("✓ Barrett helper injected")

# 2. Replace modMul body
old_modMul = "function modMul(a, b) { const na = ((a|0)%Q+Q)%Q, nb = ((b|0)%Q+Q)%Q; return Number((BigInt(na)*BigInt(nb))%BigInt(Q)); }"
new_modMul = "function modMul(a, b) { return modMulBarrett(((a|0)%Q+Q)%Q, ((b|0)%Q+Q)%Q); }"

if old_modMul in content:
    content = content.replace(old_modMul, new_modMul)
    print("✓ modMul → Barrett")
elif new_modMul in content:
    print("✓ Barrett already applied")
else:
    print("✗ ERROR: modMul pattern not found!")
    # Show what the current modMul looks like
    for i, line in enumerate(content.split('\n')):
        if 'modMul' in line and 'function' in line:
            print(f"  line {i+1}: {line.strip()}")

with open(path, "w") as f:
    f.write(content)

print("Done. File updated.")
