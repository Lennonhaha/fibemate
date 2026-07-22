#!/usr/bin/env python3
"""Add SPDX-License-Identifier: GPL-3.0-only to all source files"""
import os

SPDX = "// SPDX-License-Identifier: GPL-3.0-only\n"
extensions = {'.js': '//', '.ts': '//', '.mjs': '//', '.cjs': '//'}
skip_dirs = {'node_modules', '.git', 'temp', 'archive', 'experimental', 'lgv2', 'lgv1', 'crypto/lgv2'}
skip_paths = {'/test/', '/scripts/'}

count = 0
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for f in files:
        _, ext = os.path.splitext(f)
        if ext not in extensions:
            continue
        path = os.path.normpath(os.path.join(root, f))
        if any(s in path for s in skip_paths):
            continue
        # read
        with open(path, 'r', encoding='utf-8') as fh:
            content = fh.read()
        if 'SPDX-License-Identifier' in content:
            continue
        # prepend
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(SPDX + content)
        count += 1
        if count <= 20:
            print(f"  + {path}")
print(f"\nTotal: {count} files tagged with SPDX header")
