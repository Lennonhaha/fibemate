#!/bin/bash
# run.sh — 一键执行 LG v2.2 攻击实验全流程
#
# Target: LG v2.2 7-layer wreath-product finite group obfuscation
# Branch: experimental/vwz-lg (DO NOT merge to main)
# Usage: ./run.sh [--angr] [--block-size=48] [--count=10000]
#
# Steps:
#   1. collect-samples.py — 生成/采集映射样本
#   2. fit-mapping.py     — 拟合置换映射表
#   3. deobfuscate.py     — 批量离线去混淆 + roundtrip 验证
#   4. angr-branch-enum.py — WASM 结构分析 (可选 --angr 启用符号执行)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ANG=""
BSIZE=48
COUNT=10000
SEED=0xCAFE1234
DEPTH=7

# 解析参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        --angr) ANG="--angr" ;;
        --block-size=*) BSIZE="${1#*=}" ;;
        --count=*) COUNT="${1#*=}" ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
    shift
done

echo "============================================"
echo " LG v2.2 Attack Experiment Suite"
echo " Target: 7-layer finite group obfuscation"
echo "============================================"
echo "Block size: $BSIZE"
echo "Sample count: $COUNT"
echo "Angr: ${ANG:-OFF}"
echo ""

# ---- Step 1 ----
echo "[1/4] Collect samples..."
python3 collect-samples.py \
    --count "$COUNT" \
    --block-size "$BSIZE" \
    --output lg-samples.json \
    --seed 42

# ---- Step 2 ----
echo ""
echo "[2/4] Fit mapping table..."
python3 fit-mapping.py \
    --input lg-samples.json \
    --output lg-mapping-table.json

# ---- Step 3 ----
echo ""
echo "[3/4] Verify deobfuscation roundtrip..."
ORIGINAL="orig-$RANDOM.bin"
OBFUSCATED="obf-$RANDOM.bin"
RECOVERED="rec-$RANDOM.bin"

python3 -c "
import json, random, sys
sys.path.insert(0, '.')
from collect_samples import simulate_lg_confuse

plain = bytes(random.randint(0,255) for _ in range(512))
with open('$ORIGINAL', 'wb') as f: f.write(plain)
obf = simulate_lg_confuse(plain, $SEED, $DEPTH)
with open('$OBFUSCATED', 'wb') as f: f.write(obf)
print(f'Generated: plain={len(plain)}B, obf={len(obf)}B')
"

python3 deobfuscate.py \
    --mapping lg-mapping-table.json \
    --seed "$SEED" \
    --depth "$DEPTH" \
    --input "$OBFUSCATED" \
    --output "$RECOVERED" \
    --original "$ORIGINAL" \
    --fallback identity

rm -f "$ORIGINAL" "$OBFUSCATED" "$RECOVERED"

# ---- Step 4 ----
echo ""
echo "[4/4] WASM branch analysis..."
WASM_PATH="../../www/crypto/lgv2/lookingglass_v2_bg.wasm"
if [ -f "$WASM_PATH" ]; then
    python3 angr-branch-enum.py \
        --wasm "$WASM_PATH" \
        --output lg-branch-report.json \
        $ANG
else
    echo "SKIPPED: WASM not found at $WASM_PATH"
    echo "Run 'python3 angr-branch-enum.py --help' for standalone usage."
fi

echo ""
echo "============================================"
echo "All steps complete."
echo "Outputs:"
echo "  lg-samples.json         — 映射样本 ($(wc -c < lg-samples.json) bytes)"
echo "  lg-mapping-table.json   — 置换映射表 ($(wc -c < lg-mapping-table.json) bytes)"
echo "  lg-branch-report.json   — 分支分析报告"
echo "============================================"
