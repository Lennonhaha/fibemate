#!/bin/bash
# SM2 TVLA Stress-Gradient Scanner
# Runs masked TVLA at progressive N, analyzes |t| vs sample-size trend
set -euo pipefail

SCRIPT=/opt/fibemate-repo/scripts/tvla/tvla_sm2_v3_masked.js
CWD=/opt/fibemate-full
SIZES=(500 2000 5000)
THRESH=4.5

echo "======================================================================"
echo "  SM2 TVLA Stress-Gradient  |  N=[ ${SIZES[*]} ]  |  threshold |t|≤${THRESH}"
echo "======================================================================"

# Phase 1: run TVLA at each N, capture |t| values
declare -A T

for N in "${SIZES[@]}"; do
    echo "" >&2
    echo "── N=$N ──" >&2
    t0=$(date +%s)
    out=$(cd "$CWD" && node "$SCRIPT" "$N" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "ERROR: TVLA script failed for N=$N" >&2
        exit 1
    fi
    # Parse lines like: "  PASS  [BigInt] genKey        |t|=  1.20  fix=..."
    while IFS= read -r line; do
        if [[ "$line" =~ ^[[:space:]]*(PASS|FAIL)[[:space:]]+ ]]; then
            # Extract name = text between PASS/FAIL and |t|=
            rest="${line#*[[:space:]]}"
            rest="${rest#*[[:space:]]}"
            name="${rest%% \|t\|=*}"
            name=$(echo "$name" | sed 's/[[:space:]]*$//')
            tv=$(echo "$line" | sed -n 's/.*|t|= *\([0-9.]*\).*/\1/p')
            safe=$(echo "$name" | tr ' ' '_')
            T["${safe}__${N}"]="$tv"
            status=$(echo "$line" | grep -q "^[[:space:]]*FAIL" && echo "FAIL" || echo "PASS")
            printf "  %-4s %-26s |t|= %s\n" "$status" "$name" "$tv"
        fi
    done <<< "$out"
    t1=$(date +%s)
    echo "  [${t1}-${t0} = $((t1-t0))s]" >&2
done

# Phase 2: trend analysis & report
echo ""
echo "======================================================================"
echo "  Trend Analysis  (|t| vs √N regression, R² = goodness-of-fit)"
echo "======================================================================"

clean=0
susp=0

for op_name in "[BigInt] genKey" "[BigInt] sign" "[BigInt] verify" "[BigInt] encrypt" "[BigInt] decrypt"; do
    safe=$(echo "$op_name" | tr ' ' '_')
    vals=()
    for N in "${SIZES[@]}"; do
        v="${T["${safe}__${N}"]:-0}"
        vals+=("$v")
    done

    # Skip if all N/A
    if [ "$(echo "${vals[@]}" | tr ' ' '\n' | grep -cv 'N/A')" -eq 0 ]; then
        continue
    fi

    # Compute trend: linear regression |t| = α + β·√N
    # Using awk for floating point
    read -r slope r2 intercept <<< $(awk -v thresh="$THRESH" '
    BEGIN {
        sizes[1]='${SIZES[0]}'; sizes[2]='${SIZES[1]}'; sizes[3]='${SIZES[2]}'
        vals[1]='${vals[0]}'; vals[2]='${vals[1]}'; vals[3]='${vals[2]}'
        n=3; sx=0; sy=0; sxy=0; sx2=0
        for(i=1;i<=n;i++) {
            r=sqrt(sizes[i])
            sx += r; sy += vals[i]
            sxy += r*vals[i]; sx2 += r*r
        }
        slope = (n*sxy - sx*sy) / (n*sx2 - sx*sx)
        inter = (sy - slope*sx) / n
        ssr=0; sst=0; ym=sy/n
        for(i=1;i<=n;i++) {
            r=sqrt(sizes[i])
            pred = inter + slope*r
            ssr += (vals[i]-pred)^2; sst += (vals[i]-ym)^2
        }
        r2 = (sst>0) ? 1 - ssr/sst : 0
        printf "%.6f %.6f %.6f\n", slope, r2, inter
    }')

    # Display
    echo ""
    echo "  $op_name"
    echo "  --------------------------------------------------"
    for i in "${!SIZES[@]}"; do
        N=${SIZES[$i]}
        tval=${vals[$i]}
        bar_len=$(awk "BEGIN { printf \"%d\", int($tval * 5 + 0.5) }")
        bar_len=$((bar_len > 40 ? 40 : bar_len))
        bar=$(printf '%*s' "$bar_len" | tr ' ' '█')
        pass="✅"
        pass_str="$(awk "BEGIN { if($tval > $THRESH) print \"❌\"; else print \"✅\" }")"
        printf "  N=%-6s |t|= %6.2f  %s %s\n" "$N" "$tval" "$pass_str" "$bar"
    done

    # Classify
    r2_f=$(awk "BEGIN { printf \"%.3f\", $r2 }")
    slope_f=$(awk "BEGIN { printf \"%.4f\", $slope }")
    if [ "$(awk "BEGIN { print ($r2 < 0.3) }")" = "1" ]; then
        cls="noise     (R² too low)"
    elif [ "$(awk "BEGIN { print ($slope < 0.05) }")" = "1" ]; then
        cls="clean     (flat — no timing leak)"
    elif [ "$(awk "BEGIN { print ($slope < 0.2) }")" = "1" ]; then
        cls="marginal  (weak trend — likely noise)"
    elif [ "$(awk "BEGIN { print ($slope < 1.0) }")" = "1" ]; then
        cls="suspicious (moderate signal)"
    else
        cls="⚠ LEAK    (strong N-dependence)"
    fi

    ic="✅"
    [[ "$cls" == *"LEAK"* ]] && ic="❌"
    [[ "$cls" == *"suspicious"* ]] && ic="⚠️"
    printf "  β=%-8s R²=%-6s → %s %s\n" "$slope_f" "$r2_f" "$ic" "$cls"

    # Threshold crossing estimate
    cross=$(awk -v inter="$intercept" -v slope="$slope" -v t="$THRESH" '
    BEGIN {
        if(slope>0){rc=(t-inter)/slope; if(rc>0) printf "%d", int(rc*rc+0.5)}
    }')
    if [ -n "$cross" ] && [ "$cross" -gt 0 ] 2>/dev/null; then
        printf "  ⚠ threshold (|t|>%.1f) crosses at N≈%s\n" "$THRESH" "$cross"
    fi

    max_t=$(printf '%s\n' "${vals[@]}" | sort -rn | head -1)
    if [ "$(awk "BEGIN { print ($max_t > $THRESH) }")" = "1" ]; then
        printf "  ❌ max|t|=%.2f > %.1f\n" "$max_t" "$THRESH"
    fi

    if [[ "$cls" == *"clean"* ]] || [[ "$cls" == *"noise"* ]]; then
        ((clean++))
    else
        ((susp++))
    fi
done

echo ""
echo "======================================================================"
total=$((clean + susp))
echo "  Summary: $clean clean / $susp suspicious  ($total operations)"
if [ "$susp" -eq 0 ]; then
    echo "  ✅ ALL CLEAN — No sample-size-dependent timing leakage detected"
fi
echo "======================================================================"
