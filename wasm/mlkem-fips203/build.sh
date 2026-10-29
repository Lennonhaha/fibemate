#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# Rebuild the FIPS 203 ML-KEM-768 WebAssembly artifact from source.
#
# Reproducibility requirements (pinned on purpose, see README):
#   rustc      1.97.1
#   target     wasm32-unknown-unknown (rust-std component)
#   wasm-bindgen CLI + crate both 0.2.126  (the bindgen schema must match exactly)
#   libcrux-ml-kem =0.0.10
#
# Usage:  ./build.sh            # build into www/crypto/wasm/mlkem-fips
#         OUT=/tmp/out ./build.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${OUT:-$REPO/www/crypto/wasm/mlkem-fips}"
# Keep cargo's target dir out of the repo: a 3-digit MB build tree is not a source artifact.
TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/fibemate-mlkem-wasm-target}"

echo "== toolchain =="
rustc --version
wasm-bindgen --version
if ! rustc --print target-libdir --target wasm32-unknown-unknown >/dev/null 2>&1; then
  echo "ERROR: wasm32-unknown-unknown std not installed" >&2
  exit 2
fi

echo "== build =="
CARGO_TARGET_DIR="$TARGET_DIR" cargo build --manifest-path "$HERE/Cargo.toml" \
  --release --target wasm32-unknown-unknown

WASM="$TARGET_DIR/wasm32-unknown-unknown/release/mlkem_fips203_wasm.wasm"
test -f "$WASM" || { echo "ERROR: wasm not produced at $WASM" >&2; exit 3; }

mkdir -p "$OUT"
wasm-bindgen --target web --out-dir "$OUT" --out-name mlkem_fips "$WASM"

# The generated glue has no licence header; the repo's spdx gate requires one on
# every tracked source file (.js and .d.ts). Keep it here, not as a hand edit, so
# that a rebuild keeps the gate green. The .wasm bytes are unaffected.
for f in mlkem_fips.js mlkem_fips.d.ts; do
  if ! head -n 1 "$OUT/$f" | grep -q 'SPDX-License-Identifier'; then
    printf '// SPDX-License-Identifier: GPL-3.0-only\n' | cat - "$OUT/$f" > "$OUT/$f.tmp"
    mv "$OUT/$f.tmp" "$OUT/$f"
  fi
done

echo "== artifacts =="
ls -l "$OUT"
sha256sum "$OUT"/*
