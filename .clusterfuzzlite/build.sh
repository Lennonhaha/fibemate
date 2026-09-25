#!/bin/bash -e
# SPDX-License-Identifier: GPL-3.0-only
# ClusterFuzzLite build script for FIBEMATE PQC fuzz harnesses

# Build fuzzers
FUZZERS=(harness-pqc-kem-generateKeypair \
         harness-pqc-kem-encapsulate \
         harness-pqc-kem-decapsulate \
         harness-pqc-kem-compress \
         harness-pqc-kem-decompress \
         harness-pqc-kem-byteEncode \
         harness-pqc-kem-byteDecode \
         harness-pqc-kem-modAdd \
         harness-pqc-kem-modSub \
         harness-pqc-kem-modMul \
         harness-pqc-kem-sha3_256 \
         harness-pqc-kem-sha3_512 \
         harness-pqc-kem-shake128 \
         harness-pqc-kem-shake256)

for FUZZER in "${FUZZERS[@]}"; do
  # Copy harness to outfuzz (no compilation needed for JS)
  cp "$SRC/fibemate/fuzz/${FUZZER}.js" "$OUT/${FUZZER}.js"
done

# Copy package and node_modules (runtime dependency)
cp -r "$SRC/fibemate/packages" "$OUT/"
cp "$SRC/fibemate/package.json" "$OUT/"
cp -r "$SRC/fibemate/node_modules/@jazzer.js" "$OUT/node_modules/" 2>/dev/null || true