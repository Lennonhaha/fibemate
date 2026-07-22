#!/usr/bin/env python3
import re

with open('/opt/fibemate-repo/README.md', 'r') as f:
    content = f.read()

# 1. Update date + TSR count
content = content.replace('2026-07-21 · TSR: lg-001~094 (94 records', '2026-07-22 · TSR: lg-001~095 (95 records')
content = content.replace('94 RFC 3161 records', '95 RFC 3161 records')
content = content.replace('(lg-001~094)', '(lg-001~095)')

# 2. Add doc tree entries before the closing ``` of Project Structure
# The tree uses ├── for non-last and └── for last entries
old_marker = '└── BUILD.md             # Build and deployment guide\n```'
new_marker = '''├── BUILD.md             # Build and deployment guide
├── .pre-commit-config.yaml   # Multi-language pre-commit hooks
├── docs/
│   ├── testing.md              # 4-layer CI pipeline + functional + compatibility tests
│   ├── quality-assurance.md    # 7-layer QA architecture blueprint
│   ├── security-limitations.md # Security boundaries & stability weighting
│   ├── audit-package-2026-07-22.md  # Third-party audit package
│   ├── platform-matrix.md      # Multi-platform test matrix
│   └── VULNERABILITIES.md      # Vulnerability tracking (FIB-001~)
```'''
content = content.replace(old_marker, new_marker)

with open('/opt/fibemate-repo/README.md', 'w') as f:
    f.write(content)
print('Done')
