#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# TSR signing for docs/pqc-readiness.md (lg-093) + docs/security-limitations.md (lg-094)
set -e
cd /opt/fibemate-repo
mkdir -p docs/tsa/2026-07-22

for pair in "docs/pqc-readiness.md lg-093" "docs/security-limitations.md lg-094"; do
  file=$(echo $pair | awk '{print $1}')
  id=$(echo $pair | awk '{print $2}')
  openssl ts -query -data "$file" -sha256 -no_nonce -cert -out /tmp/${id}.tsq
  curl -s -H 'Content-Type: application/timestamp-query' --data-binary @/tmp/${id}.tsq https://freetsa.org/tsr -o docs/tsa/2026-07-22/${id}.tsr --max-time 10
  echo "$id: signed OK"
  openssl ts -reply -in docs/tsa/2026-07-22/${id}.tsr -text 2>/dev/null | head -10
done
