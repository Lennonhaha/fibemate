#!/usr/bin/env python3
"""FIBEMATE WASM Release Builder

SPDX-License-Identifier: GPL-3.0-only

Builds precompiled WASM artifacts for:
  1. ML-KEM-768 core (when WASM target exists)
  2. VWZ sign
  3. LookingGlass v2.2

Output: dist/wasm/{module}/{module}.wasm.gz + index.js + d.ts

Usage:
  python3 scripts/build-wasm-release.py           # build all
  python3 scripts/build-wasm-release.py --dry-run  # check prerequisites
"""

import subprocess
import gzip
import json
import shutil
import sys
import hashlib
import os
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "wasm"
VERSION = "v3.3-preview"

MODULES = {
    "vwz-sign": {
        "rust_dir": "rust/vwz-sign-wasm",
        "description": "VWZ tensor signature (research)",
        "exports": ["keygen", "sign", "verify", "serialize", "deserialize"],
    },
    "lookingglass-v2": {
        "rust_dir": "rust/lgv2",
        "description": "LookingGlass v2.2 group representation (research)",
        "exports": ["apply_forward", "apply_inverse", "roundtrip_test"],
    },
}


def check_prereqs():
    """Verify build toolchain."""
    checks = {}
    for tool in ["cargo", "wasm-pack"]:
        try:
            subprocess.run([tool, "--version"], capture_output=True, check=True)
            checks[tool] = "✅"
        except (FileNotFoundError, subprocess.CalledProcessError):
            checks[tool] = "❌ not found"
    return checks


def build_module(name: str, cfg: dict) -> dict:
    """Build one WASM module. Returns artifact info dict."""
    result = {"module": name, "status": "unknown"}

    rust_dir = ROOT / cfg["rust_dir"]
    if not rust_dir.exists():
        result["status"] = "skipped"
        result["reason"] = f"Rust source dir not found: {rust_dir}"
        return result

    # wasm-pack build
    try:
        subprocess.run(
            ["wasm-pack", "build", "--target", "web", "--release"],
            cwd=str(rust_dir),
            check=True,
            capture_output=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as e:
        result["status"] = "failed"
        result["stderr"] = e.stderr.decode()[:500]
        return result

    pkg_dir = rust_dir / "pkg"
    wasm_file = next(pkg_dir.glob("*.wasm"), None) if pkg_dir.exists() else None
    if not wasm_file:
        result["status"] = "failed"
        result["reason"] = "No .wasm file in pkg/"
        return result

    # gzip-compress
    out_dir = DIST / name
    out_dir.mkdir(parents=True, exist_ok=True)
    wasm_out = out_dir / f"{name}.wasm"
    shutil.copy2(wasm_file, wasm_out)

    gz_out = out_dir / f"{name}.wasm.gz"
    with open(wasm_file, "rb") as f_in, gzip.open(gz_out, "wb", compresslevel=9) as f_out:
        shutil.copyfileobj(f_in, f_out)

    # copy JS binding + types
    for ext in ["js", "d.ts"]:
        src = next(pkg_dir.glob(f"*.{ext}"), None)
        if src:
            shutil.copy2(src, out_dir / f"{name}.{ext}")

    # manifest
    manifest = {
        "module": name,
        "version": VERSION,
        "description": cfg["description"],
        "exports": cfg["exports"],
        "built_at": datetime.now(timezone.utc).isoformat(),
        "files": {
            "wasm": {
                "path": f"{name}.wasm",
                "size": wasm_out.stat().st_size,
                "sha256": _sha256(wasm_out),
            },
            "wasm_gz": {
                "path": f"{name}.wasm.gz",
                "size": gz_out.stat().st_size,
                "sha256": _sha256(gz_out),
            },
        },
    }
    with open(out_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    result["status"] = "ok"
    result["wasm_size"] = wasm_out.stat().st_size
    result["gz_size"] = gz_out.stat().st_size
    return result


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("  FIBEMATE WASM Release Builder")
    print(f"  Version: {VERSION}")
    print(f"  Output:  {DIST}")
    print("=" * 60)

    prereqs = check_prereqs()
    for tool, status in prereqs.items():
        print(f"  [{status}] {tool}")

    if any("❌" in v for v in prereqs.values()):
        print("\n⚠️  Missing prerequisites. Install with:")
        print("  cargo install wasm-pack")
        print("  rustup target add wasm32-unknown-unknown")
        if dry_run:
            return 0
        return 1

    if dry_run:
        print("\n  ✅ All prerequisites met (dry-run)")
        return 0

    print()
    for name, cfg in MODULES.items():
        print(f"  Building {name}...")
        result = build_module(name, cfg)
        if result["status"] == "ok":
            print(f"    ✅ {result['wasm_size']:,}B → gzip {result['gz_size']:,}B")
        elif result["status"] == "skipped":
            print(f"    ⬜ {result['reason']}")
        else:
            print(f"    ❌ {result.get('reason', result.get('stderr', 'unknown error'))}")

    # Module index
    index = {"version": VERSION, "built_at": datetime.now(timezone.utc).isoformat(), "modules": {}}
    for name in MODULES:
        manifest_path = DIST / name / "manifest.json"
        if manifest_path.exists():
            with open(manifest_path) as f:
                index["modules"][name] = json.load(f)
    with open(DIST / "index.json", "w") as f:
        json.dump(index, f, indent=2)

    print(f"\n  ✅ dist/wasm/index.json written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
