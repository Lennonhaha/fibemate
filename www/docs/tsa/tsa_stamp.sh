#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# Usage: tsa_stamp.sh <display_name> <sha256_hex> <size_bytes>

DIR="/opt/fibemate-full/docs/tsa/2026-06-08"
mkdir -p "$DIR"
cd "$DIR"

NAME="$1"
SHA256="$2"
SIZE="$3"
TS="$(date -Iseconds)"
SAFE_NAME="$(echo "$NAME" | tr '/:' '__')"

echo "$SHA256" | xxd -r -p > /tmp/tsa_digest.bin
openssl ts -query -data /tmp/tsa_digest.bin -no_nonce -sha256 -cert -out "${SAFE_NAME}.tsq"

TSA_OK=0
for attempt in 1 2 3; do
    if curl -s -H "Content-Type: application/timestamp-query" \
        --data-binary "@${SAFE_NAME}.tsq" \
        "https://freetsa.org/tsr" -o "${SAFE_NAME}.tsr" 2>/dev/null; then
        if openssl ts -reply -in "${SAFE_NAME}.tsr" -text >/dev/null 2>&1; then
            echo "TSA OK: $NAME"
            TSA_OK=1
            break
        fi
    fi
    echo "Retry $attempt for $NAME..."
    sleep 2
done

if [ "$TSA_OK" -ne 1 ]; then
    echo "FAILED: $NAME after 3 retries"
    exit 1
fi

MANIFEST="${DIR}/timestamp-manifest.json"
if [ ! -f "$MANIFEST" ]; then
    echo "[" > "$MANIFEST"
else
    sed -i '$ s/]$//' "$MANIFEST"
    echo "," >> "$MANIFEST"
fi

cat >> "$MANIFEST" <<EOF
  {
    "file": "$NAME",
    "size": $SIZE,
    "sha256": "$SHA256",
    "tsa": "FreeTSA",
    "timestamp": "$TS"
  }
]
EOF

echo "Manifest updated: $(wc -l < "$MANIFEST") lines"
rm -f /tmp/tsa_digest.bin
