#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# [DRAFT — 未提交，未进 FIBEMATE 主仓]
# FIBEMATE C-2 TLA+ 持续验证（G1 修复：K3 强不变式门禁化）
# ---------------------------------------------------------------
# 设计要点（基于实测，非记忆）：
#   - 不将 tla2tools.jar 提交进 git（避免污染历史 + 破坏可复现）
#   - 从官方 Release 钉版本下载（v1.7.4，仓库 tlaplus/tlaplus），
#     不用 latest（floating 引用会破坏"验证产物与代码事实绑定"
#     的方法论纪律 —— 正是 C-2 门禁接缝的反例）
#   - 只跑 C2.cfg 列出的 7 条不变式（TypeOK + K1~K5，含 K3/K3p 强形式）
#   - 不碰 L_Handshake liveness（G2 留研究线，见 C2.tla 作者自注
#     "Do not claim verified"）
#   - G3（re-run 触发）由 nightly 每次 checkout 当前 HEAD 自动满足：
#     任何改动 .tla/.cfg 的 PR 合入后，下一次 nightly 自然重跑，
#     无需 cache-key 技巧
#
# 前置：bash + java 17（GitHub Actions 用 actions/setup-java 钉 SHA）
# 调用：bash scripts/tla/c2-tlc-nightly.sh
# ---------------------------------------------------------------
set -uo pipefail   # 注意：不用 -e，因需在 java 非零退出时捕获 rc

TLA_DIR="${TLA_DIR:-docs/tla}"
MODEL="${MODEL:-C2}"
CFG="$TLA_DIR/$MODEL.cfg"
TLA="$TLA_DIR/$MODEL.tla"

# 钉版本，不用 latest（可复现性）。可用 env 覆盖做测试。
TLA2TOOLS_URL="${TLA2TOOLS_URL:-https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar}"
JAR="${TLA2TOOLS_JAR:-/tmp/tla2tools.jar}"
JAVA_OPTS="${JAVA_OPTS:--Xmx2g -XX:+UseParallelGC}"

# 0. 输入检查
[ -f "$CFG" ] || { echo "MISSING: $CFG"; exit 2; }
[ -f "$TLA" ] || { echo "MISSING: $TLA"; exit 2; }

# 1. 取 jar（若未提供则由 env 指定路径复用）
if [ ! -f "$JAR" ]; then
  echo "==> Downloading tla2tools.jar (pinned v1.7.4, repo tlaplus/tlaplus)"
  curl -fsSL "$TLA2TOOLS_URL" -o "$JAR"
fi

# 2. 跑 TLC（仅不变式，无 liveness —— 对应 G2 不在此 job）
echo "==> Running TLC on $MODEL (Spec + 7 invariants; liveness excluded per G2)"
java $JAVA_OPTS -jar "$JAR" -config "$CFG" -workers auto "$TLA" || rc=$?
rc=${rc:-0}
echo "==> TLC exit code: $rc"
# TLC 非 0 = 发现违反或异常 → 让 nightly 红
exit "$rc"
