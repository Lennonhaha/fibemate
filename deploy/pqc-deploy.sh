#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# =============================================================================
# pqc-deploy.sh — 平台层 PQC 封装部署 (带版本门禁, 防生产事故)
#
# 设计原则: 先探测, 不满足条件绝不改生产配置。
#   OpenSSL < 3.5 或 nginx 链接库不含 ML-KEM → 打印诊断并退出(不修改任何文件)
#   OpenSSL >= 3.5 且 nginx -t 通过        → 备份 → 应用 → reload → 实测协商
#
# 用法:
#   bash deploy/pqc-deploy.sh --check          # 仅检查环境就绪度 (安全)
#   bash deploy/pqc-deploy.sh --apply          # 应用混合 TLS 配置 (需 --check 通过)
#   bash deploy/pqc-deploy.sh --rollback       # 回滚到备份
#
# 注意: 此脚本以仓库模板为源, 部署到 /etc/nginx/sites-enabled/。
#       服务器当前 OpenSSL 3.0.13 (2026-09-06) → --apply 会被门禁拦截, 属预期行为。
# =============================================================================
set -euo pipefail

SITE="${SITE:-fibemate.net}"
TEMPLATE="$(dirname "$0")/pqc-nginx-hybrid.conf.example"
NGINX_AVAILABLE="/etc/nginx/sites-available/${SITE}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SITE}"
BACKUP_SUFFIX=".bak-pqc-$(date +%Y%m%d-%H%M%S)"

echo "==> [1/5] 检查 nginx 链接的 OpenSSL 版本"
NGINX_SSL="$(nginx -V 2>&1 | grep -o 'built with OpenSSL[^)]*' || true)"
echo "    nginx: $(nginx -v 2>&1) | ${NGINX_SSL:-未知}"
if ! echo "${NGINX_SSL}" | grep -qE 'OpenSSL 3\.[5-9]'; then
    echo ""
    echo "!! 门禁拦截: nginx 链接的 OpenSSL 低于 3.5 (无 ML-KEM 混合组支持)"
    echo "   X25519MLKEM768 需要 OpenSSL 3.5+。当前配置会导致 nginx emerg 拒启:"
    echo "   SSL_CTX_set1_curves_list() failed: group 'X25519MLKEM768' cannot be set"
    echo ""
    echo "   升级路径 (任选):"
    echo "     A. 系统 OpenSSL 升级到 3.5+ (apt 需第三方源/自编译, 动系统库有风险)"
    echo "     B. 使用含 PQ 的 nginx 构建 (如 GetPageSpeed 仓库)"
    echo "     C. 暂缓平台层 PQ, 保持应用层混合 KEX (路径 C-2, 已上线)"
    echo ""
    echo "    参考: docs/pqc-readiness.md 路径 A 状态 + deploy/pqc-nginx-hybrid.conf.example 头部说明"
    exit 3
fi
echo "    [OK] OpenSSL >= 3.5, 支持混合组"

echo "==> [2/5] 检查 OpenSSL 是否认识 X25519MLKEM768"
if ! openssl list -tls-groups 2>/dev/null | grep -qi 'mlkem'; then
    echo "!! 门禁拦截: openssl list -tls-groups 无 ML-KEM 组"
    exit 3
fi
echo "    [OK] ML-KEM 组可用"

if [ "${1:-}" = "--check" ]; then
    echo ""
    echo "==> 环境就绪度检查通过。可执行: bash deploy/pqc-deploy.sh --apply"
    exit 0
fi

if [ "${1:-}" = "--rollback" ]; then
    echo "==> [回滚] 恢复最近备份"
    LATEST="$(ls -t "${NGINX_ENABLED}".bak-pqc-* 2>/dev/null | head -1 || true)"
    if [ -z "$LATEST" ]; then
        echo "!! 无 pqc 备份可回滚"
        exit 1
    fi
    cp "$LATEST" "$NGINX_ENABLED"
    nginx -t && nginx -s reload
    echo "    [OK] 已回滚到 $LATEST"
    exit 0
fi

if [ "${1:-}" != "--apply" ]; then
    echo "用法: bash deploy/pqc-deploy.sh [--check|--apply|--rollback]"
    exit 1
fi

echo "==> [3/5] 备份当前配置"
if [ ! -f "${NGINX_ENABLED}" ]; then
    echo "!! 找不到 ${NGINX_ENABLED} (确认 SITE 变量或站点名)"
    exit 1
fi
cp "${NGINX_ENABLED}" "${NGINX_ENABLED}${BACKUP_SUFFIX}"
echo "    备份: ${NGINX_ENABLED}${BACKUP_SUFFIX}"

echo "==> [4/5] 应用混合 TLS 模板"
if [ ! -f "$TEMPLATE" ]; then
    echo "!! 模板不存在: $TEMPLATE"
    exit 1
fi
# 模板是 .example (含大量注释), 部署时仅提取 server 块配置。
# 生产建议: 基于模板手写精简版 (去注释) 后放入 sites-available。
cp "$TEMPLATE" "${NGINX_AVAILABLE}.pqc-hybrid"
echo "    模板已复制到 ${NGINX_AVAILABLE}.pqc-hybrid"
echo "    !! 注意: 模板含注释, 请先人工精简为纯配置再启用。"
echo "    安全起见脚本不自动替换 sites-enabled (防误伤), 由运维确认后手动:"
echo "      cp ${NGINX_AVAILABLE}.pqc-hybrid ${NGINX_ENABLED}  # 精简后"

echo "==> [5/5] 验证指引"
echo "    nginx -t && nginx -s reload"
echo "    openssl s_client -connect ${SITE}:443 -tls1_3 -groups X25519MLKEM768 -servername ${SITE} 2>&1 | grep -i negotiated"
echo "    期望输出: Negotiated group: X25519MLKEM768"
echo ""
echo "完成 (半自动: 最后两步由运维确认执行)"
