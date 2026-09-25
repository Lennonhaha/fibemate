# SPDX-License-Identifier: GPL-3.0-only
# ClusterFuzzLite Docker image for FIBEMATE PQC fuzzing
# Based on the OSS-Fuzz recommended Node.js environment

FROM gcr.io/oss-fuzz-base/base-builder-nodejs:latest

COPY . $SRC/fibemate

WORKDIR $SRC/fibemate

# Install production dependencies only (fuzz harness imports the package)
RUN npm ci --ignore-scripts --omit=dev

# Copy fuzz harnesses
COPY fuzz/ $SRC/fibemate/fuzz/

# Copy the generator tool (for reference)
COPY tools/fuzz-harness-generator/ $SRC/fibemate/tools/fuzz-harness-generator/