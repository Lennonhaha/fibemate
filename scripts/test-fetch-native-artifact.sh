#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# Negative-first tests for the credential-free artifact channel (issue #570).
#
# The channel's whole claim is: a deploy host that holds nothing can still fetch a known
# artifact, and when it cannot, it says so instead of substituting whatever is on disk.
# An exit code that is never exercised proves nothing, so every case below is a failure
# the script must produce on purpose, except the last one.
#
# The release base is overridden with FIBEMATE_RELEASE_BASE pointing at a file:// tree,
# which is the same URL shape the real channel uses (curl handles both).
#
# Usage: bash scripts/test-fetch-native-artifact.sh
# Exit:  0 all cases behaved as expected, 1 a case did not
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FETCH="$SCRIPT_DIR/fetch-native-artifact.sh"
KEY="0123456789ab"
NODE_MAJOR="22"
TAG="native-node${NODE_MAJOR}-${KEY}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BASE="$WORK/base"
# curl here may be the native Windows build (Git for Windows shells ahead of MSYS path
# translation), and it does not understand /tmp/... inside a URL. cygpath -m gives the
# C:/ form that both curl and file:// accept; on Linux this is a no-op.
if command -v cygpath >/dev/null 2>&1; then
  BASE_URL="file://$(cygpath -m "$BASE")"
else
  BASE_URL="file://$BASE"
fi
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "PASS $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; [ -n "${2:-}" ] && echo "     $2"; }

# Build a publishable tree exactly like the workflow does.
make_asset() {
  local dir="$BASE/$TAG"
  rm -rf "$BASE"; mkdir -p "$dir"
  printf 'fake native addon bytes\n' > "$dir/mlkem.node"
  ( cd "$dir" && sha256sum mlkem.node > mlkem.node.sha256 )
  {
    echo "file: mlkem.node"
    echo "bytes: $(stat -c %s "$dir/mlkem.node")"
    echo "commit: deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    echo "ref: refs/heads/main"
    echo "workflow_ref: refs/heads/main"
    echo "native_tree: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    echo "workflow_sha: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    echo "artifact_key: $KEY"
    echo "node: v22.0.0"
    echo "gcc: gcc (fake) 11.4.0"
    echo "glibc: ldd (fake) 2.35"
    echo "runner: ubuntu-22.04"
    echo "march: -march=x86-64-v3"
    echo "avx512_zmm_refs: 0"
  } > "$dir/build-info.txt"
}

run_fetch() {
  local dest="$1"; shift
  FIBEMATE_RELEASE_BASE="$BASE_URL" bash "$FETCH" --release --key "$KEY" \
    --node-major "$NODE_MAJOR" --dest "$dest" "$@" >"$WORK/out.txt" 2>"$WORK/err.txt"
  echo $?
}

DEST="$WORK/tree"
mkdir -p "$DEST"

# 1. nothing published: exit 2, a loud message, and no bytes placed.
make_asset; rm -rf "$BASE/$TAG"
rc=$(run_fetch "$DEST")
if [ "$rc" = "2" ] && grep -q "no published artifact" "$WORK/err.txt" && [ ! -f "$DEST/packages/pqc-kem/native/build/Release/mlkem.node" ]; then
  ok "missing release exits 2 and places nothing"
else
  bad "missing release exits 2 and places nothing" "rc=$rc $(head -2 "$WORK/err.txt" | tr '\n' ' ')"
fi

# 2. asset present but the bytes do not match the sidecar: exit 4, still nothing placed.
make_asset; printf 'tampered\n' > "$BASE/$TAG/mlkem.node"
rc=$(run_fetch "$DEST")
if [ "$rc" = "4" ] && grep -q "do not hash to the manifest" "$WORK/err.txt"; then
  ok "tampered bytes exit 4"
else
  bad "tampered bytes exit 4" "rc=$rc"
fi

# 3. bytes fine, but build-info claims a different build key: exit 3.
make_asset; sed -i "s/^artifact_key: .*/artifact_key: ffffffffffff/" "$BASE/$TAG/build-info.txt"
rc=$(run_fetch "$DEST")
if [ "$rc" = "3" ] && grep -q "artifact key is" "$WORK/err.txt"; then
  ok "key mismatch exits 3"
else
  bad "key mismatch exits 3" "rc=$rc $(head -2 "$WORK/err.txt" | tr '\n' ' ')"
fi

# 4. --release without --key is a usage error, not a guess: exit 1.
FIBEMATE_RELEASE_BASE="$BASE_URL" bash "$FETCH" --release --node-major "$NODE_MAJOR" \
  --dest "$DEST" >"$WORK/out.txt" 2>"$WORK/err.txt"
rc=$?
if [ "$rc" = "1" ] && grep -q -- "--release needs --key" "$WORK/err.txt"; then
  ok "--release without --key exits 1"
else
  bad "--release without --key exits 1" "rc=$rc"
fi

# 5. the honest path: published, verified, placed, and the sidecar still checks after install.
make_asset
rc=$(run_fetch "$DEST")
REL="$DEST/packages/pqc-kem/native/build/Release"
if [ "$rc" = "0" ] && [ -f "$REL/mlkem.node" ] && ( cd "$REL" && sha256sum -c mlkem.node.sha256 >/dev/null 2>&1 ) \
   && grep -q "channel: release $TAG (no credentials used)" "$WORK/out.txt"; then
  ok "published asset is fetched, verified and placed"
else
  bad "published asset is fetched, verified and placed" "rc=$rc $(head -3 "$WORK/out.txt" | tr '\n' ' ')"
fi

# 6. no Authorization header is ever sent: the script must not mention GH_TOKEN on this path.
if ! grep -q "GH_TOKEN is required" "$WORK/err.txt" && ! grep -qi "authorization" "$WORK/out.txt" "$WORK/err.txt"; then
  ok "the release path asks for no credential"
else
  bad "the release path asks for no credential" "a credential error appeared on the release path"
fi

echo
if [ "$FAIL" = "0" ]; then
  echo "all $PASS fetch cases behaved as expected"
  exit 0
fi
echo "$PASS passed, $FAIL failed"
exit 1
