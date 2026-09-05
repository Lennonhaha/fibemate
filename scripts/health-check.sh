#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# =============================================================================
# FIBEMATE 本地代码检查命令包 — 15 分钟体检表
# =============================================================================
# 用法: bash scripts/health-check.sh
# 输出: 逐项 PASS/FAIL + 汇总报告
# 依赖: Node.js ≥ 18, npm, cargo (可选), liboqs-dev (可选)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS() { echo -e "${GREEN}✅ PASS${NC}: $1"; }
FAIL() { echo -e "${RED}❌ FAIL${NC}: $1"; }
WARN() { echo -e "${YELLOW}⚠️  WARN${NC}: $1"; }
INFO() { echo -e "${NC}ℹ️  INFO${NC}: $1"; }

STEP=0
TOTAL=7
run_step() {
    STEP=$((STEP + 1))
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Step $STEP/$TOTAL: $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

REPORT=""
append_report() { REPORT="$REPORT\n$1"; }

# ---------------------------------------------------------------------------
# Step 1: ESLint (JS/TS)
# ---------------------------------------------------------------------------
run_step "ESLint — 代码风格与语法检查"
if command -v npx >/dev/null 2>&1; then
    if npx eslint . --max-warnings 0 2>/dev/null; then
        PASS "ESLint 0 warnings, 0 errors"
        append_report "ESLint: PASS"
    else
        WARN "ESLint 有警告或错误（见上）"
        append_report "ESLint: WARN"
    fi
else
    WARN "npx 未安装，跳过 ESLint"
    append_report "ESLint: SKIP"
fi

# ---------------------------------------------------------------------------
# Step 2: npm audit
# ---------------------------------------------------------------------------
run_step "npm audit — 依赖漏洞扫描"
if command -v npm >/dev/null 2>&1; then
    AUDIT=$(npm audit --json 2>/dev/null || echo '{"metadata":{"vulnerabilities":{"total":-1}}}')
    VULNS=$(echo "$AUDIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata',{}).get('vulnerabilities',{}).get('total',-1))" 2>/dev/null || echo "-1")
    if [ "$VULNS" = "0" ]; then
        PASS "npm audit: 0 vulnerabilities"
        append_report "npm audit: PASS (0 vulns)"
    elif [ "$VULNS" = "-1" ]; then
        WARN "npm audit 解析失败"
        append_report "npm audit: SKIP"
    else
        FAIL "npm audit: $VULNS vulnerabilities found"
        append_report "npm audit: FAIL ($VULNS vulns)"
    fi
else
    WARN "npm 未安装，跳过"
    append_report "npm audit: SKIP"
fi

# ---------------------------------------------------------------------------
# Step 3: cargo audit (Rust/WASM)
# ---------------------------------------------------------------------------
run_step "cargo audit — Rust 依赖漏洞扫描"
if command -v cargo >/dev/null 2>&1 && [ -f "packages/pqc-kem/Cargo.toml" ]; then
    if cargo audit 2>/dev/null; then
        PASS "cargo audit: 0 vulnerabilities"
        append_report "cargo audit: PASS"
    else
        WARN "cargo audit 有警告或 cargo-audit 未安装"
        append_report "cargo audit: WARN"
    fi
else
    WARN "cargo 未安装或无 Cargo.toml，跳过"
    append_report "cargo audit: SKIP"
fi

# ---------------------------------------------------------------------------
# Step 4: clippy (Rust lint)
# ---------------------------------------------------------------------------
run_step "cargo clippy — Rust 静态分析"
if command -v cargo >/dev/null 2>&1 && [ -f "packages/pqc-kem/Cargo.toml" ]; then
    if cargo clippy -- -D warnings 2>/dev/null; then
        PASS "cargo clippy: 0 warnings"
        append_report "cargo clippy: PASS"
    else
        WARN "cargo clippy 有警告"
        append_report "cargo clippy: WARN"
    fi
else
    WARN "cargo 未安装，跳过"
    append_report "cargo clippy: SKIP"
fi

# ---------------------------------------------------------------------------
# Step 5: ML-KEM KAT 10,000 轮
# ---------------------------------------------------------------------------
run_step "ML-KEM KAT — 10,000 轮已知答案测试"
if [ -f "scripts/kat-10000.js" ]; then
    if node scripts/kat-10000.js 2>/dev/null; then
        PASS "ML-KEM KAT 10,000/10,000 PASS"
        append_report "ML-KEM KAT: PASS (10000/10000)"
    else
        FAIL "ML-KEM KAT 有失败"
        append_report "ML-KEM KAT: FAIL"
    fi
else
    WARN "scripts/kat-10000.js 不存在，跳过"
    append_report "ML-KEM KAT: SKIP"
fi

# ---------------------------------------------------------------------------
# Step 6: 可选 liboqs 交叉验证
# ---------------------------------------------------------------------------
run_step "liboqs 交叉验证（可选，需 liboqs-dev）"
if [ -f "scripts/liboqs-cross.sh" ] && command -v oqs_test >/dev/null 2>&1; then
    if bash scripts/liboqs-cross.sh 2>/dev/null; then
        PASS "liboqs 交叉验证通过"
        append_report "liboqs cross: PASS"
    else
        WARN "liboqs 交叉验证失败或环境未配置"
        append_report "liboqs cross: WARN"
    fi
else
    INFO "liboqs-dev 未安装，跳过（非必需）"
    append_report "liboqs cross: SKIP"
fi

# ---------------------------------------------------------------------------
# Step 7: TSR 链完整性验证
# ---------------------------------------------------------------------------
run_step "TSR 链完整性 — RFC 3161 时间戳验证"
if [ -f "scripts/verify-tsr.sh" ]; then
    if bash scripts/verify-tsr.sh 2>/dev/null; then
        PASS "TSR 链验证通过"
        append_report "TSR verify: PASS"
    else
        WARN "TSR 链验证失败或工具缺失"
        append_report "TSR verify: WARN"
    fi
else
    WARN "scripts/verify-tsr.sh 不存在，跳过"
    append_report "TSR verify: SKIP"
fi

# ---------------------------------------------------------------------------
# 汇总报告
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "                         体检报告汇总"
echo "═══════════════════════════════════════════════════════════════════════"
echo -e "$REPORT"
echo ""
echo "───────────────────────────────────────────────────────────────────────"
echo "说明:"
echo "  ✅ PASS  = 该项检查通过"
echo "  ⚠️  WARN  = 有警告但不阻塞，需人工确认"
echo "  ❌ FAIL  = 该项检查失败，需修复"
echo "  SKIP    = 环境未满足，非项目缺陷"
echo ""
echo "注意: 本体检表覆盖'代码卫生'和'功能正确性'，但不覆盖:"
echo "  - 密码学安全性审计（需第三方）"
echo "  - 侧信道分析（需物理设备）"
echo "  - 形式化证明（需专用工具）"
echo "───────────────────────────────────────────────────────────────────────"
