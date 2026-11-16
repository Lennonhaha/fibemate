#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
#
# build-release.sh - produce an immutable release directory from a commit.
#
# Why this exists: until 2026-11-16 "deploy" meant resetting a git checkout and
# letting /opt/fibemate-full drift by hand. Two trees meant two answers to "what is
# running", and the drift went unnoticed for 66 files (issue #507). A release is now
# a directory that contains everything the process needs, built only from the commit:
#
#   * code from `git archive` (never from a working tree, so local edits cannot leak)
#   * dependencies from `npm ci` against the lockfile
#   * the native addon from CI (the host does not compile: -march=native produced a
#     binary that SIGILL'd on the production CPU, issue #535)
#   * BUILD-MANIFEST.json: the commit plus a sha256 for every tracked file, so the
#     delivery gate can verify without a .git directory
#
# Usage:
#   scripts/build-release.sh --repo <git-repo> --commit <sha> --out <release-dir> \
#                            [--artifact <dir>] [--force]
#
# --artifact points at a directory holding mlkem.node, mlkem.node.sha256 and
# build-info.txt (what the native-build workflow uploads). Omit it to build a
# JS-only release; the health endpoint will then report backend "pure-js".
#
# Exit: 0 built and self-consistent, 1 build failed, 2 usage error.
set -uo pipefail

say() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "build-release: $*" >&2; exit 1; }

REPO=""; COMMIT=""; OUT=""; ARTIFACT=""; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --commit) COMMIT="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -n "$REPO" ] && [ -n "$COMMIT" ] && [ -n "$OUT" ] || die "usage: --repo <dir> --commit <sha> --out <dir> [--artifact <dir>] [--force]"

say "== 0. preconditions =="
[ -d "$REPO/.git" ] || die "$REPO is not a git repository"
COMMIT_SHA="$(git -C "$REPO" rev-parse --verify "$COMMIT^{commit}" 2>/dev/null)" || die "cannot resolve $COMMIT in $REPO"
if [ -e "$OUT" ] && [ "$(ls -A "$OUT" 2>/dev/null | wc -l)" -gt 0 ]; then
  [ "$FORCE" = 1 ] || die "$OUT is not empty (pass --force to replace it)"
  rm -rf "${OUT:?}"/* "${OUT:?}"/.[!.]* 2>/dev/null || true
fi
mkdir -p "$OUT"
if [ -n "$ARTIFACT" ]; then
  for f in mlkem.node mlkem.node.sha256 build-info.txt; do
    [ -f "$ARTIFACT/$f" ] || die "artifact is missing $f"
  done
  ART_COMMIT="$(sed -n 's/^commit: //p' "$ARTIFACT/build-info.txt" | head -1)"
  [ "$ART_COMMIT" = "$COMMIT_SHA" ] || die "artifact was built from ${ART_COMMIT:-unknown}, not $COMMIT_SHA"
  say "   artifact commit matches: $COMMIT_SHA"
fi

say "== 1. export the tree from the commit =="
git -C "$REPO" archive "$COMMIT_SHA" | tar -x -C "$OUT" || die "git archive failed"
say "   $(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1)"

say "== 2. npm ci --omit=dev =="
if [ -f "$OUT/package-lock.json" ]; then
  ( cd "$OUT" && npm ci --omit=dev --no-audit --no-fund ) || die "npm ci failed"
  say "   node_modules $(du -sh "$OUT/node_modules" | cut -f1)"
else
  die "no package-lock.json in the commit - refusing to install a floating dependency tree"
fi

if [ -n "$ARTIFACT" ]; then
  say "== 3. install the CI-built addon (never compiled here) =="
  rm -rf "$OUT/packages/pqc-kem/native/build"
  mkdir -p "$OUT/packages/pqc-kem/native/build/Release"
  cp "$ARTIFACT/mlkem.node" "$ARTIFACT/mlkem.node.sha256" "$ARTIFACT/build-info.txt" \
     "$OUT/packages/pqc-kem/native/build/Release/"
  ( cd "$OUT/packages/pqc-kem/native/build/Release" && sha256sum -c mlkem.node.sha256 ) || die "addon digest mismatch"
  say "   $(sha256sum "$OUT/packages/pqc-kem/native/build/Release/mlkem.node" | cut -d' ' -f1)"
else
  say "== 3. no artifact given: JS-only release (health will report backend pure-js) =="
fi

say "== 4. site assets that are generated, not committed =="
# www/docs/cbom-cyclonedx.json is served (three /docs/*.md pages link it) but cannot be
# committed: on the old tree it is a symlink with an absolute /opt/fibemate-repo path,
# which would break any other machine. A relative link inside the release needs no
# machine-specific knowledge, so build it here instead of teaching git about it.
if [ -f "$OUT/tools/cbom-cyclonedx.json" ]; then
  mkdir -p "$OUT/www/docs"
  ln -sfn ../../tools/cbom-cyclonedx.json "$OUT/www/docs/cbom-cyclonedx.json"
  [ -r "$OUT/www/docs/cbom-cyclonedx.json" ] || die "the generated cbom symlink does not resolve"
  say "   www/docs/cbom-cyclonedx.json -> $(readlink "$OUT/www/docs/cbom-cyclonedx.json") ($(stat -Lc%s "$OUT/www/docs/cbom-cyclonedx.json") B)"
else
  say "   WARN: tools/cbom-cyclonedx.json is absent from this commit; skipping the symlink"
fi

say "== 5. build manifest =="
node "$OUT/scripts/write-build-manifest.cjs" --repo "$REPO" --commit "$COMMIT_SHA" --out "$OUT" --verify \
  || die "manifest could not be written/verified"

say "== 6. summary =="
if [ -L "$OUT/www/www-docs" ]; then say "   www/www-docs -> $(readlink "$OUT/www/www-docs") (tracked symlink)"; fi
if [ -f "$OUT/www/crypto/lgv2/lookingglass_v2_bg.wasm" ]; then
  say "   lookingglass_v2_bg.wasm $(stat -c%s "$OUT/www/crypto/lgv2/lookingglass_v2_bg.wasm") B"
else
  say "   WARN: lookingglass_v2_bg.wasm absent - /bench/wasm-bench.html will fail to load it"
fi
say "BUILD OK: $OUT ($(du -sh "$OUT" | cut -f1))"
