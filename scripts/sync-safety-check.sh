#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# =============================================================================
# FIBEMATE 性能补丁接入 — 软硬件同步保全检查
# 用法: bash scripts/sync-safety-check.sh
# 目的: 确保性能基准/门禁补丁不破坏软硬字节流对齐契约
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS() { echo -e "${GREEN}✅ PASS${NC}: $1"; }
FAIL() { echo -e "${RED}❌ FAIL${NC}: $1"; exit 1; }
WARN() { echo -e "${YELLOW}⚠️  WARN${NC}: $1"; }

echo "═══════════════════════════════════════════════════════════════════════"
echo "  FIBEMATE 性能补丁 — 软硬件同步保全检查"
echo "═══════════════════════════════════════════════════════════════════════"

# ---------------------------------------------------------------------------
# 检查 1: bench 脚本不得修改 seed 注入接口
# ---------------------------------------------------------------------------
echo ""
echo "检查 1/6: bench 脚本不得修改 seed 注入接口..."
if grep -rE "(seed\s*=|setSeed|injectSeed|fromFile.*seed)" scripts/bench-*.js 2>/dev/null; then
    FAIL "bench 脚本检测到 seed 注入修改 — 会破坏软硬同步"
else
    PASS "bench 脚本未修改 seed 注入"
fi

# ---------------------------------------------------------------------------
# 检查 2: bench 脚本不得改字节序/编码
# ---------------------------------------------------------------------------
echo ""
echo "检查 2/6: bench 脚本不得修改字节序或编码..."
if grep -rE "(endian|byteOrder|swap16|reverse.*byte|littleEndian|bigEndian)" scripts/bench-*.js 2>/dev/null; then
    FAIL "bench 脚本检测到字节序修改 — 会破坏软硬同步"
else
    PASS "bench 脚本未修改字节序"
fi

# ---------------------------------------------------------------------------
# 检查 3: RTL cycle_cnt 必须仅 debug 用途
# ---------------------------------------------------------------------------
echo ""
echo "检查 3/6: RTL cycle_cnt 必须仅 debug 用途..."
if [ -f "fpga/rtl/kem_top.v" ]; then
    if grep -E "cycle_cnt" fpga/rtl/kem_top.v | grep -vE "(mark_debug|ila_probe|debug_o|//.*debug)" >/dev/null 2>&1; then
        FAIL "cycle_cnt 可能参与非 debug 逻辑 — 会破坏 RTL 语义"
    else
        PASS "cycle_cnt 仅用于 debug/ILA"
    fi
else
    WARN "fpga/rtl/kem_top.v 不存在，跳过 RTL 检查"
fi

# ---------------------------------------------------------------------------
# 检查 4: KAT 对照必须字节级（不能只比 ss 或 return code）
# ---------------------------------------------------------------------------
echo ""
echo "检查 4/6: KAT/交叉验证必须字节级对照..."
if grep -rE "assert\(.*rc\s*===|assert\(.*return|assertEqual.*ss\b" scripts/*.js scripts/*.sh 2>/dev/null | grep -v "Buffer.equals\|deepStrictEqual\|bytesEqual" >/dev/null; then
    WARN "检测到非字节级对照（可能只比 return code 或 ss）— 建议改为 Buffer.equals"
else
    PASS "KAT 对照为字节级"
fi

# ---------------------------------------------------------------------------
# 检查 5: 算法代码未被修改（packages/pqc-kem 和 rtl/ 的 git diff）
# ---------------------------------------------------------------------------
echo ""
echo "检查 5/6: 算法核心代码未被修改..."
if git diff --name-only HEAD | grep -E "^packages/pqc-kem/src/.*\.(js|c|h)$" >/dev/null 2>&1; then
    FAIL "packages/pqc-kem 算法代码被修改 — 需重新跑 KAT 字节对照"
else
    PASS "packages/pqc-kem 算法代码未修改"
fi

if git diff --name-only HEAD | grep -E "^fpga/rtl/.*\.v$" >/dev/null 2>&1; then
    WARN "fpga/rtl 有修改 — 需确认是否仅加 debug 计数器"
else
    PASS "fpga/rtl 未修改"
fi

# ---------------------------------------------------------------------------
# 检查 6: perf-diff 阈值合理（不超过 50%）
# ---------------------------------------------------------------------------
echo ""
echo "检查 6/6: perf-diff 退化阈值设置合理..."
if [ -f "scripts/perf-diff.js" ]; then
    if grep -E "threshold.*[5-9][0-9]|HARD_FAIL.*[5-9]" scripts/perf-diff.js >/dev/null 2>&1; then
        WARN "perf-diff 阈值偏高（>50%）— 可能漏检严重退化"
    else
        PASS "perf-diff 阈值设置合理（≤50%）"
    fi
else
    WARN "scripts/perf-diff.js 不存在，跳过"
fi

# ---------------------------------------------------------------------------
# 汇总
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  保全检查完成"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "说明: 以上检查确保性能补丁不破坏软硬同步契约。"
echo "  • 种子注入不变 → A 矩阵不变 → pk/ct 字节流不变"
echo "  • 字节序不变 → 软件拼字节 = FPGA 拼字节"
echo "  • cycle_cnt 仅 debug → RTL 行为不变"
echo "  • KAT 字节级对照 → 任何漂移立即发现"
echo ""
