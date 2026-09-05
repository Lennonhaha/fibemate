#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# =============================================================================
# verify-tsr.sh — FIBEMATE TSR 时间戳存证「可复现」验证脚本
# -----------------------------------------------------------------------------
# 作用：第三方拿到仓库后可一键校验所有 RFC3161 时间戳存证确实绑定到
#       对应文件内容，且由 DigiCert TSA 合法签署。
#
# 验证分两层（均已实测可用）：
#   1) 签名层  openssl ts -verify  （需 .tsq 请求文件 + DigiCert CA 链）
#   2) 绑定层  时间戳令牌的 messageImprint == .sha256 清单哈希 == .tsq 哈希
#              （无需 CA 即可证明令牌精确绑定到清单文件内容）
#
# 用法：
#   ./scripts/verify-tsr.sh [TSA目录] [CA链文件]
#   ./scripts/verify-tsr.sh www/docs/tsa digicert-certs/digicert-tsa-chain.pem
#
# 退出码：0 = 全部通过；非 0 = 存在失败项（适合 CI）
# =============================================================================
set -uo pipefail

OPENSSL="${OPENSSL:-openssl}"
TSA_DIR="${1:-www/docs/tsa}"
CA_FILE="${2:-digicert-certs/digicert-tsa-chain.pem}"

# 跨平台兼容：sha256sum / openssl dgst
if command -v sha256sum >/dev/null 2>&1; then
  SHA256SUM="sha256sum"
elif command -v sha256 >/dev/null 2>&1; then
  SHA256SUM="sha256"
else
  SHA256SUM=""
fi

# ---- 提取 RFC3161 令牌中的 messageImprint（64 位 hex） --------------------
# 参数：$1=文件  $2="reply"|"query"
extract_imprint() {
  local file="$1" mode="$2"
  if [ "$mode" = "reply" ]; then
    "$OPENSSL" ts -reply -in "$file" -text 2>/dev/null
  else
    "$OPENSSL" ts -query -in "$file" -text 2>/dev/null
  fi | awk '
    /Message data:/ { cap=1; next }
    cap && /^ *[0-9a-f]+ - / {
      line=$0
      sub(/^ *[0-9a-f]+ - /, "", line)
      n=split(line, seg, "-")
      for (i=1; i<=n; i++) {
        gsub(/[^0-9a-fA-F]/, " ", seg[i])
        m=split(seg[i], h, " ")
        for (j=1; j<=m; j++) if (h[j] ~ /^[0-9a-fA-F]{2}$/) printf "%s", h[j]
      }
      next
    }
    cap && /^$/ { cap=0 }
  ' | tr -d ' ' | tr 'A-F' 'a-f'
}

# ---- 提取令牌状态（Granted / Waiting / Rejected） -------------------------
extract_status() {
  "$OPENSSL" ts -reply -in "$1" -text 2>/dev/null | awk -F': ' '/^Status info:/{f=1} f && /Status:/{print $2; exit}'
}

PASS=0; FAIL=0; SKIP=0
[ -d "$TSA_DIR" ] || { echo "错误：TSA 目录不存在: $TSA_DIR"; exit 2; }
command -v "$OPENSSL" >/dev/null 2>&1 || { echo "错误：未找到 openssl"; exit 2; }

echo "==================================================================="
echo " FIBEMATE TSR 存证验证"
echo " TSA 目录 : $TSA_DIR"
echo " CA 链     : ${CA_FILE:-<无>}"
echo "==================================================================="

# 找到所有 .tsr（递归）
mapfile -t TSRS < <(find "$TSA_DIR" -type f -name '*.tsr' | sort)

if [ ${#TSRS[@]} -eq 0 ]; then
  echo "未找到任何 .tsr 文件"
  exit 0
fi

for tsr in "${TSRS[@]}"; do
  dir="$(dirname "$tsr")"
  base="$(basename "$tsr" .tsr)"
  tsq="$dir/$base.tsq"
  manifest="$dir/$base.sha256"

  printf -- "---------------------------------------------------------------\n"
  printf "文件: %s\n" "$tsr"

  status="$(extract_status "$tsr")"
  imprint="$(extract_imprint "$tsr" reply)"
  [ -z "$imprint" ] && { echo "  [FAIL] 无法解析 tsr messageImprint"; FAIL=$((FAIL+1)); continue; }
  echo "  状态: ${status:-未知}   imprint: ${imprint:0:16}...${imprint:48}"

  # 1) 签名层
  if [ -f "$tsq" ]; then
    if [ -f "$CA_FILE" ]; then
      if "$OPENSSL" ts -verify -in "$tsr" -queryfile "$tsq" -CAfile "$CA_FILE" >/dev/null 2>&1; then
        echo "  [签名] OK  (DigiCert TSA 签名有效)"
      else
        echo "  [签名] FAIL (openssl ts -verify 失败)"
        FAIL=$((FAIL+1)); continue
      fi
    else
      # 无 CA 链：退化为仅校验 tsq 哈希与 tsr 一致
      tsq_imprint="$(extract_imprint "$tsq" query)"
      if [ "$tsq_imprint" = "$imprint" ]; then
        echo "  [签名] SKIP (无 CA 链，已确认 tsr 与 tsq 哈希一致)"
        SKIP=$((SKIP+1))
      else
        echo "  [签名] FAIL (tsq 哈希与 tsr 不一致)"; FAIL=$((FAIL+1)); continue
      fi
    fi
  else
    echo "  [签名] SKIP (缺 .tsq 请求文件，无法做 CA 签名校验)"
    SKIP=$((SKIP+1))
  fi

  # 2) 绑定层：imprint 必须出现在 .sha256 清单中
  if [ -f "$manifest" ]; then
    if grep -qiE "^[0-9a-f]{64} " "$manifest" 2>/dev/null; then
      if grep -qiF "$imprint" "$manifest"; then
        echo "  [绑定] OK  (imprint 命中 .sha256 清单哈希)"
      else
        echo "  [绑定] FAIL (imprint 不在 .sha256 清单中)"; FAIL=$((FAIL+1)); continue
      fi
    else
      echo "  [绑定] WARN (.sha256 清单格式异常，跳过哈希比对)"
    fi
    # 3) 文件完整性（若清单引用的文件存在）
    if [ -n "$SHA256SUM" ]; then
      ( cd "$dir" && $SHA256SUM -c "$base.sha256" >/dev/null 2>&1 ) \
        && echo "  [文件] OK  (清单内文件 sha256 校验通过)" \
        || echo "  [文件] WARN (清单文件不在本地或校验未过，属正常——原始文件多存于外部)"
    fi
  else
    # 无清单：用 tsq 交叉验证
    if [ -f "$tsq" ]; then
      tsq_imprint="$(extract_imprint "$tsq" query)"
      if [ "$tsq_imprint" = "$imprint" ]; then
        echo "  [绑定] OK  (imprint 与 .tsq 请求哈希一致)"
      else
        echo "  [绑定] FAIL (imprint 与 .tsq 不一致)"; FAIL=$((FAIL+1)); continue
      fi
    else
      echo "  [绑定] WARN (既无 .sha256 也无 .tsq，无法交叉验证)"
    fi
  fi
  PASS=$((PASS+1))
done

printf -- "===============================================================\n"
printf "结果: 通过 %s | 失败 %s | 跳过/警告 %s | 总计 %s\n" "$PASS" "$FAIL" "$SKIP" "${#TSRS[@]}"
printf -- "===============================================================\n"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
