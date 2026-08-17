#!/bin/bash
# LG v2.4 看门狗 TSR 存证脚本 v2（2026-08-17）
# 重新编号 lg-105 ~ lg-108（lg-101 已被 phase0 txt 占用，跳过）
set -u

DIR="/opt/fibemate-full/docs/tsa/2026-08-17-lg-v24-watchdog"
mkdir -p "$DIR"
cd "$DIR"

MANIFEST="$DIR/timestamp-manifest.json"

ITEMS=(
  "lg-105-defense.rs|4F592A92639A0C77E8387F112D40C010B410DA9D5818A8B75E3FFD4D2F19D860|33364"
  "lg-106-vm.rs|0F94C9D381838E6696DFCC948651E46A83394103FB951165C8AFEAD9E5765309|49410"
  "lg-107-lgv2_3.wasm|3BCDD4F7C5E8D01A86C1C2060459816505DF93D14E7516E60A1F6CA9261F8934|109809"
  "lg-108-watchdog-wasm-verify.md|4AA3910FDC35B190E9D9CFFBBBD70EF4C2D67BE2D8E16ED2D30EE83281C513D0|4505"
)

TS="$(date -Iseconds)"
echo "[" > "$MANIFEST"

IDX=0
for item in "${ITEMS[@]}"; do
  NAME="${item%%|*}"
  REST="${item#*|}"
  SHA256="${REST%%|*}"
  SIZE="${REST##*|}"
  SAFE_NAME="$(echo "$NAME" | tr '/:' '__')"

  echo ">>> [$((IDX+1))/4] $NAME"
  echo "$SHA256" | xxd -r -p > /tmp/tsa_digest.bin
  openssl ts -query -data /tmp/tsa_digest.bin -no_nonce -sha256 -cert -out "${SAFE_NAME}.tsq" 2>/dev/null
  TSA_OK=0
  for attempt in 1 2 3; do
    if curl -s -H "Content-Type: application/timestamp-query" --data-binary "@${SAFE_NAME}.tsq" "https://freetsa.org/tsr" -o "${SAFE_NAME}.tsr" 2>/dev/null; then
      if openssl ts -reply -in "${SAFE_NAME}.tsr" -text >/dev/null 2>&1; then
        echo "  ✅ TSA OK"
        TSA_OK=1
        break
      fi
    fi
    sleep 2
  done
  if [ "$TSA_OK" -ne 1 ]; then echo "  ✗ FAILED"; IDX=$((IDX+1)); continue; fi

  if [ $IDX -gt 0 ]; then echo "," >> "$MANIFEST"; fi
  cat >> "$MANIFEST" <<EOF
  {
    "file": "$NAME",
    "size": $SIZE,
    "sha256": "$SHA256",
    "tsa": "FreeTSA",
    "timestamp": "$TS"
  }
EOF
  IDX=$((IDX+1))
done
echo "]" >> "$MANIFEST"
echo ""
ls -la "$DIR"
rm -f /tmp/tsa_digest.bin
