#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# Fetch a CI-built native addon and verify it before it is allowed near a release tree.
#
#   bash scripts/fetch-native-artifact.sh --sha <commit> --dest <release-dir> \
#        [--run-id <id>] [--artifact-dir <dir>] [--node-major 22] [--artifact-commit <sha>] \
#        [--key <12hex>] [--native-tree <sha>] [--artifact-name <name>]
#
# --key selects the artifact by build inputs (native tree + workflow), not by commit:
# two commits that agree on both must accept the same bytes, and a deploy of a commit
# that did not touch native code must still find one. See scripts/native-artifact-key.cjs.
#
# What this script does: download, verify, copy.
# What this script does NOT do: compile. There is no npm, node-gyp or cc call in this file, and
# that is deliberate - the whole point of consuming a CI artifact is that the bytes deployed are
# the bytes that were built and attested, not a local rebuild that happens to look similar.
#
# The context: the addon is not reproducible yet (issue #533) and an artifact built with
# -march=native only runs on the CPU of the machine that built it (issue #534). Both are reasons
# to verify what arrived instead of assuming it.
#
# Exit codes
#   0  artifact fetched, verified and placed
#   1  usage error
#   2  could not reach the API / no matching artifact
#   3  provenance mismatch (build key, native tree or commit)
#   4  manifest mismatch (bytes do not hash to the manifest)
#   5  destination unusable
set -euo pipefail

SHA=""
DEST=""
RUN_ID=""
ARTIFACT_DIR=""
NODE_MAJOR=""
ARTIFACT_COMMIT=""
KEY=""
NATIVE_TREE_EXPECT=""
ARTIFACT_NAME=""
REPO="${REPO:-Lennonhaha/fibemate}"

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --sha) SHA="${2:-}"; shift 2 ;;
    --dest) DEST="${2:-}"; shift 2 ;;
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    --artifact-dir) ARTIFACT_DIR="${2:-}"; shift 2 ;;
    --node-major) NODE_MAJOR="${2:-}"; shift 2 ;;
    --artifact-commit) ARTIFACT_COMMIT="${2:-}"; shift 2 ;;
    --key) KEY="${2:-}"; shift 2 ;;
    --native-tree) NATIVE_TREE_EXPECT="${2:-}"; shift 2 ;;
    --artifact-name) ARTIFACT_NAME="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

[ -n "$DEST" ] || { echo "FAIL: --dest is required" >&2; exit 1; }
if [ -z "$SHA" ] && [ -z "$KEY" ] && [ -z "$ARTIFACT_NAME" ] && [ -z "$ARTIFACT_DIR" ]; then
  echo "FAIL: one of --sha, --key, --artifact-name or --artifact-dir is required" >&2
  exit 1
fi
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -Eq '^[0-9a-f]{12}$'; then
  echo "FAIL: --key must be 12 hex characters" >&2
  exit 1
fi
if [ -n "$NATIVE_TREE_EXPECT" ] && ! printf '%s' "$NATIVE_TREE_EXPECT" | grep -Eq '^[0-9a-f]{40,64}$'; then
  echo "FAIL: --native-tree must be a full object id" >&2
  exit 1
fi
[ -n "$NODE_MAJOR" ] || NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

api() {
  # gh when available (it carries auth and pagination), curl + token otherwise
  if command -v gh >/dev/null 2>&1; then
    gh api "$@"
  else
    : "${GH_TOKEN:?GH_TOKEN is required when gh is not installed}"
    curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/$1"
  fi
}

echo "[1/5] resolving the artifact (node$NODE_MAJOR${KEY:+, key $KEY}${SHA:+, sha $SHA})"
if [ -n "$ARTIFACT_DIR" ]; then
  echo "      offline mode: reading $ARTIFACT_DIR"
  mkdir -p "$WORK/artifact"
  cp -a "$ARTIFACT_DIR"/. "$WORK/artifact/"
else
  ART_ID=""
  if [ -n "$KEY" ] || [ -n "$ARTIFACT_NAME" ]; then
    # Exact-name lookup across the repository: the artifact name carries the build
    # key, so no run has to exist for this particular commit.
    [ -n "$ARTIFACT_NAME" ] || ARTIFACT_NAME="mlkem-node-ubuntu-22.04-node${NODE_MAJOR}-${KEY}"
    echo "      artifact name $ARTIFACT_NAME"
    ART_ID="$(api "repos/$REPO/actions/artifacts?name=$ARTIFACT_NAME&per_page=100" \
      | node -e "
        let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
          const want=process.argv[1];
          const list=JSON.parse(d).artifacts.filter(a=>!a.expired);
          list.sort((a,b)=>a.created_at<b.created_at?1:-1);
          if(!list.length){console.error('no unexpired artifact named '+want);process.exit(2)}
          console.log(list[0].id);
        });" "$ARTIFACT_NAME")" || { echo "FAIL: no artifact named $ARTIFACT_NAME" >&2; exit 2; }
  else
    if [ -z "$RUN_ID" ]; then
      RUN_ID="$(api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=50" \
        | node -e "
          let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
            const runs=JSON.parse(d).workflow_runs.filter(r=>r.path.includes('native-build.yml')&&r.conclusion==='success');
            runs.sort((a,b)=>a.created_at<b.created_at?1:-1);
            if(!runs.length){console.error('no successful native-build run for this commit');process.exit(2)}
            console.log(runs[0].id);
          });")" || { echo "FAIL: no run found for $SHA" >&2; exit 2; }
      echo "      run $RUN_ID"
    fi
    ART_ID="$(api "repos/$REPO/actions/runs/$RUN_ID/artifacts" \
      | node -e "
        let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
          const want='node'+process.argv[1];
          const list=JSON.parse(d).artifacts.filter(a=>a.name.includes(want));
          if(!list.length){console.error('no artifact for '+want+' in this run');process.exit(2)}
          console.log(list[0].id);
        });" "$NODE_MAJOR")" || { echo "FAIL: artifact not found" >&2; exit 2; }
  fi
  echo "      artifact $ART_ID"
  mkdir -p "$WORK/artifact"
  if command -v gh >/dev/null 2>&1; then
    gh api "repos/$REPO/actions/artifacts/$ART_ID/zip" > "$WORK/a.zip"
  else
    : "${GH_TOKEN:?GH_TOKEN is required}"
    curl -fsSL -H "Authorization: Bearer $GH_TOKEN" \
      "https://api.github.com/repos/$REPO/actions/artifacts/$ART_ID/zip" -o "$WORK/a.zip"
  fi
  ( cd "$WORK/artifact" && unzip -q ../a.zip )
fi

echo "[2/5] provenance"
for f in mlkem.node mlkem.node.sha256 build-info.txt; do
  [ -f "$WORK/artifact/$f" ] || { echo "FAIL: artifact is missing $f" >&2; exit 3; }
done
ART_COMMIT="$(sed -n 's/^commit: //p' "$WORK/artifact/build-info.txt")"
ART_KEY="$(sed -n 's/^artifact_key: //p' "$WORK/artifact/build-info.txt")"
ART_TREE="$(sed -n 's/^native_tree: //p' "$WORK/artifact/build-info.txt")"
if [ -n "$KEY" ]; then
  if [ "$ART_KEY" != "$KEY" ]; then
    echo "FAIL: artifact key is '${ART_KEY:-<absent>}', not $KEY" >&2
    echo "      the bytes were built from different native sources or different flags" >&2
    exit 3
  fi
  if [ -n "$NATIVE_TREE_EXPECT" ] && [ "$ART_TREE" != "$NATIVE_TREE_EXPECT" ]; then
    echo "FAIL: artifact native tree is '${ART_TREE:-<absent>}', not $NATIVE_TREE_EXPECT" >&2
    exit 3
  fi
  echo "      key $ART_KEY, native tree ${ART_TREE:0:12}"
else
  if [ -n "$SHA" ]; then
    EXPECT="${ARTIFACT_COMMIT:-$SHA}"
    if [ "$ART_COMMIT" != "$EXPECT" ]; then
      echo "FAIL: artifact was built from $ART_COMMIT, not $EXPECT" >&2
      echo "      if that is intentional (a native tree identical to another commit), pass --key" >&2
      exit 3
    fi
  else
    echo "      WARN: neither --sha nor --key given; provenance identity is not asserted" >&2
  fi
fi
echo "      commit $ART_COMMIT"
grep -E '^(bytes|node|gcc|glibc|runner|ref):' "$WORK/artifact/build-info.txt" | sed 's/^/      /'

echo "[3/5] manifest"
ACTUAL="$(sha256sum "$WORK/artifact/mlkem.node" | cut -d' ' -f1)"
EXPECTED_SHA="$(head -1 "$WORK/artifact/mlkem.node.sha256" | awk '{print $1}')"
if [ "$ACTUAL" != "$EXPECTED_SHA" ]; then
  echo "FAIL: bytes do not hash to the manifest" >&2
  echo "      manifest ${EXPECTED_SHA:0:12}  actual ${ACTUAL:0:12}" >&2
  exit 4
fi
echo "      ${ACTUAL:0:12} matches"

echo "[4/5] destination"
TARGET="$DEST/packages/pqc-kem/native/build/Release"
mkdir -p "$TARGET" || { echo "FAIL: cannot create $TARGET" >&2; exit 5; }
if [ -f "$TARGET/mlkem.node" ]; then
  OLD="$(sha256sum "$TARGET/mlkem.node" | cut -d' ' -f1)"
  if [ "$OLD" = "$ACTUAL" ]; then
    echo "      already in place (${OLD:0:12}); nothing to do"
  else
    echo "      replacing ${OLD:0:12} with ${ACTUAL:0:12}"
  fi
fi

echo "[5/5] placing"
install -m 0644 "$WORK/artifact/mlkem.node" "$TARGET/mlkem.node"
install -m 0644 "$WORK/artifact/mlkem.node.sha256" "$TARGET/mlkem.node.sha256"
install -m 0644 "$WORK/artifact/build-info.txt" "$TARGET/build-info.txt"
( cd "$TARGET" && sha256sum -c mlkem.node.sha256 )

echo
echo "ARTIFACT OK: ${ACTUAL:0:12} ($(stat -c %s "$TARGET/mlkem.node") B) -> $TARGET"
echo "             built from $ART_COMMIT on $(sed -n 's/^runner: //p' "$WORK/artifact/build-info.txt")"
