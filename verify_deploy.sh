#!/bin/bash
cd /opt/fibemate-full/www
for f in main.js zk-snarks.js session-manager.js legacy-crypto-bridge.js ml-kem-hybrid-integration.js; do
  echo -n "$f: "
  node -c "$f" && echo "OK" || echo "FAIL"
done
echo "==="
curl -sk https://fibemate.net/health
echo
curl -sk https://fibemate.net/api/mlkem/test