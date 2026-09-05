#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
with open('/opt/fibemate-repo/docs/audit-package-2026-07-22.md', 'r') as f:
    content = f.read()

content = content.replace('HEAD `99b3bd47`', 'HEAD `bf9ae819`')
content = content.replace('Commit | `99b3bd47`', 'Commit | `bf9ae819`')

new_section = """

## 9. Update: 2026-07-22 Quality Assurance Documentation (HEAD `bf9ae819`)

The following documents were added after the initial audit package (HEAD `99b3bd47`):

| Document | Description | TSR |
|:---|:---|:---|
| `docs/quality-assurance.md` | 7-layer QA architecture blueprint (L1-L7) | — |
| `docs/testing.md` | 4-layer CI pipeline + functional + compatibility tests | — |
| `docs/security-limitations.md` (expanded) | P0/P1/P2 risk classification + mandatory constraints | lg-094 |
| `docs/risk-rectification.md` | 19-item P0-P3 rectification tracker with 8.31 deadlines | — |
| `.pre-commit-config.yaml` | Multi-language pre-commit hooks | — |
| `test/smoke-crypto.js` | ML-KEM-768 + SM2 pre-commit smoke (5/5 PASS) | — |
| `scripts/update-readme.py` | Idempotent README updater | — |

All new files have been verified on the live server (ECS). Core implementation (`ml-kem-768.js`) unchanged.
"""

content += new_section

with open('/opt/fibemate-repo/docs/audit-package-2026-07-22.md', 'w') as f:
    f.write(content)
print('Updated audit-package-2026-07-22.md')
