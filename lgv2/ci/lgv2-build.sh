#!/bin/bash
# LG v2.1 → v3.0 统一构建脚本
# 用法: ./lgv2-build.sh [c|rust|wasm|all]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_LOG="$ROOT_DIR/ci/build.log"
PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

mkdir -p "$(dirname "$BUILD_LOG")"

echo "=== LG v2.1 → v3.0 Build ===" | tee "$BUILD_LOG"
echo "Root: $ROOT_DIR" | tee -a "$BUILD_LOG"
echo "" | tee -a "$BUILD_LOG"

# ---- C Library ----
build_c() {
    echo "--- [C] Building liblgv2.so ---" | tee -a "$BUILD_LOG"
    cd "$ROOT_DIR/c" && make clean all >> "$BUILD_LOG" 2>&1
    if [ -f liblgv2.so ]; then
        ok "C: liblgv2.so built ($(stat -c%s liblgv2.so) bytes)"
    else
        fail "C: liblgv2.so NOT found"
        return 1
    fi

    echo "--- [C] Running tests ---" | tee -a "$BUILD_LOG"
    # Build and run test
    gcc -O2 -Wall -DTEST_LGV2 -o test_lgv2 lgv2_confuse.c >> "$BUILD_LOG" 2>&1
    if ./test_lgv2 >> "$BUILD_LOG" 2>&1; then
        ok "C: all tests passed"
    else
        fail "C: some tests failed"
    fi
}

# ---- Rust Library ----
build_rust() {
    echo "--- [Rust] cargo build --release ---" | tee -a "$BUILD_LOG"
    cd "$ROOT_DIR/rust"
    cargo build --release >> "$BUILD_LOG" 2>&1
    if [ -f target/release/liblgv2.a ] || [ -f target/release/liblgv2.dll ] || [ -f target/release/liblgv2.so ]; then
        ok "Rust: release build successful"
    else
        fail "Rust: build failed"
        return 1
    fi

    echo "--- [Rust] cargo test ---" | tee -a "$BUILD_LOG"
    if cargo test >> "$BUILD_LOG" 2>&1; then
        ok "Rust: all tests passed"
    else
        fail "Rust: some tests failed"
    fi
}

# ---- WASM Build ----
build_wasm() {
    echo "--- [WASM] wasm-pack build ---" | tee -a "$BUILD_LOG"
    cd "$ROOT_DIR/rust"

    if ! command -v wasm-pack &>/dev/null; then
        echo "  wasm-pack not found, installing..." | tee -a "$BUILD_LOG"
        curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh >> "$BUILD_LOG" 2>&1
    fi

    wasm-pack build --target web --out-dir "$ROOT_DIR/wasm" >> "$BUILD_LOG" 2>&1
    if [ -f "$ROOT_DIR/wasm/lgv2_bg.wasm" ]; then
        ok "WASM: lgv2_bg.wasm built ($(stat -c%s "$ROOT_DIR/wasm/lgv2_bg.wasm") bytes)"
    else
        fail "WASM: lgv2_bg.wasm NOT found"
        return 1
    fi
}

# ---- Main ----
TARGET="${1:-all}"

case "$TARGET" in
    c)    build_c ;;
    rust) build_rust ;;
    wasm) build_wasm ;;
    all)
        build_c || true
        build_rust || true
        build_wasm || true
        ;;
    *)
        echo "Usage: $0 [c|rust|wasm|all]"
        exit 1
        ;;
esac

echo "" | tee -a "$BUILD_LOG"
echo "=== Result: $PASS passed, $FAIL failed ===" | tee -a "$BUILD_LOG"
exit $FAIL
