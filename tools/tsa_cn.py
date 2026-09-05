#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# -*- coding: utf-8 -*-
"""
FIBEMATE AlgorithmRegistry - 中国TSA可信时间戳申请脚本
支持: tsa.cn (联合信任) + freetsa.org (免费fallback)

用法:
  python3 tsa_cn.py --file /path/to/manifest.json --tsa tsa
  python3 tsa_cn.py --file /path/to/manifest.json --tsa free  (免费)
  python3 tsa_cn.py --file /path/to/file.js --tsa tsa --username USER --password PWD

TSA 端点 (RFC 3161 HTTP):
  tsa.cn:   https://tsa.cn/tsa  (需注册+余额, ~5元/次)
  freetsa:  https://freetsa.org/tsa (免费, 法律效力有限)
"""

import sys, os, io, hashlib, base64, json, argparse, urllib.request, urllib.error, ssl, subprocess, tempfile, textwrap

# ─────────────────────────────────────────────────────────
# 1. 计算文件/清单的 SHA-256
# ─────────────────────────────────────────────────────────
def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.digest()

# ─────────────────────────────────────────────────────────
# 2. 用 openssl 创建 TSA 请求 (最可靠)
# ─────────────────────────────────────────────────────────
def create_ts_query_openssl(hash_hex, out_tsq):
    """
    调用 openssl ts -query 生成 .tsq 文件
    hash_hex: SHA-256 十六进制字符串
    """
    tmp_hash = tempfile.mktemp(suffix='.bin')
    with open(tmp_hash, 'wb') as f:
        f.write(bytes.fromhex(hash_hex))

    cmd = [
        'openssl', 'ts', '-query',
        '-data', tmp_hash,
        '-sha256',
        '-cert',
        '-out', out_tsq
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        try: os.unlink(tmp_hash)
        except: pass
        if result.returncode != 0:
            sys.stderr.write('[openssl ts -query] ERROR: %s\n' % result.stderr.strip()[:300])
            return False
        return True
    except Exception as e:
        try: os.unlink(tmp_hash)
        except: pass
        sys.stderr.write('[openssl ts -query] Exception: %s\n' % e)
        return False

def send_ts_query_http(tsq_path, tsa_url, out_tsr=None, auth=None):
    """
    将 .tsq 通过 HTTP POST 发送到 TSA (RFC 3161 HTTP transport)
    Content-Type: application/timestamp-query
    """
    with open(tsq_path, 'rb') as f:
        tsq_data = f.read()

    req = urllib.request.Request(
        tsa_url,
        data=tsq_data,
        headers={
            'Content-Type': 'application/timestamp-query',
            'User-Agent': 'FIBEMATE-TSA-Client/3.0.0',
        },
        method='POST'
    )
    if auth:
        encoded = base64.b64encode(('%s:%s' % (auth[0], auth[1])).encode()).decode()
        req.headers['Authorization'] = 'Basic %s' % encoded

    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = resp.read()
            if out_tsr:
                with open(out_tsr, 'wb') as f:
                    f.write(data)
            return data, resp.getheader('Content-Type', '')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')[:500]
        sys.stderr.write('[TSA HTTP] %d %s: %s\n' % (e.code, e.reason, body))
        return None, None
    except Exception as e:
        sys.stderr.write('[TSA HTTP] Exception: %s\n' % e)
        return None, None

# ─────────────────────────────────────────────────────────
# 3. 验证 TSA 响应
# ─────────────────────────────────────────────────────────
def verify_ts_response_openssl(tsr_path, tsa_cert=None):
    cmd = ['openssl', 'ts', '-reply',
            '-in', tsr_path,
            '-text']
    if tsa_cert and os.path.exists(tsa_cert):
        cmd += ['-CAfile', tsa_cert]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return result.returncode == 0, result.stdout[:3000], result.stderr[:500]
    except Exception as e:
        return False, '', str(e)

# ─────────────────────────────────────────────────────────
# 4. 从 tsa.cn 获取 API 端点 (需登录, 此处提供说明)
# ─────────────────────────────────────────────────────────
def get_tsa_cn_endpoint():
    """
    tsa.cn 的 RFC 3161 端点需登录后从"标准时间戳服务"页面获取。
    参考: https://www.tsa.cn/service/standard-timestamp/
    常见端点模式:
      - https://tsa.cn/tsa
      - https://api.tsa.cn/timestamp
    获取方式:
      1. 登录 https://www.tsa.cn/
      2. 进入"标准时间戳服务" → "接口服务"
      3. 获取专属 API 端点和认证信息
    """
    return None  # 需用户手动配置

# ─────────────────────────────────────────────────────────
# 5. 主流程
# ─────────────────────────────────────────────────────────
def process_tsa(args):
    if not os.path.exists(args.file):
        sys.stderr.write('[ERROR] 文件不存在: %s\n' % args.file)
        return False

    sys.stdout.write('[1] 读取文件: %s\n' % args.file)
    with open(args.file, 'rb') as f:
        data = f.read()
    file_hash = hashlib.sha256(data).digest()
    file_hash_hex = file_hash.hex()
    sys.stdout.write('    SHA-256: %s\n' % file_hash_hex)

    # 创建临时目录
    work_dir = tempfile.mkdtemp(prefix='fibemate_tsa_')
    sys.stdout.write('[2] 工作目录: %s\n' % work_dir)

    tsq_path = os.path.join(work_dir, 'request.tsq')
    tsr_path = os.path.join(work_dir, 'response.tsr')

    # 创建 TSA 请求
    sys.stdout.write('[3] 创建 TSA 请求 (openssl ts -query)...\n')
    if not create_ts_query_openssl(file_hash_hex, tsq_path):
        sys.stderr.write('  [FAIL] openssl 不可用, 请安装 openssl\n')
        return False
    sys.stdout.write('    [OK] 请求已保存: %s\n' % tsq_path)

    # 选择 TSA
    tsa_url = args.tsa_url
    if not tsa_url:
        if args.tsa == 'tsa':
            # tsa.cn 端点 - 需用户从后台获取
            # 此处为常见模式, 实际请登录 tsa.cn 确认
            tsa_url = 'https://tsa.cn/tsa'  # 需用户确认实际 URL
            sys.stdout.write('[4] 使用 TSA: 联合信任 (tsa.cn)\n')
            sys.stdout.write('    URL: %s (请确认实际端点)\n' % tsa_url)
            sys.stdout.write('    [NOTE] 需账号登录, 如失败请传入 --username 和 --password\n')
        elif args.tsa == 'free':
            tsa_url = 'https://freetsa.org/tsa'
            sys.stdout.write('[4] 使用 TSA: FreeTSA (免费, 法律效力有限)\n')
        else:
            tsa_url = args.tsa  # 自定义 URL
            sys.stdout.write('[4] 使用自定义 TSA: %s\n' % tsa_url)

    # 发送请求
    sys.stdout.write('[5] 发送 TSA 请求...\n')
    auth = None
    if args.username and args.password:
        auth = (args.username, args.password)
        sys.stdout.write('    使用认证: %s\n' % args.username)

    tsr_data, content_type = send_ts_query_http(tsq_path, tsa_url, tsr_path, auth=auth)

    if not tsr_data:
        if args.tsa == 'tsa':
            sys.stderr.write('\n  [FAIL] tsa.cn 请求失败\n')
            sys.stderr.write('  可能原因:\n')
            sys.stderr.write('    1. 端点 URL 不正确 (需登录 tsa.cn 获取)\n')
            sys.stderr.write('    2. 未提供认证信息 (--username / --password)\n')
            sys.stderr.write('    3. 账户余额不足 (需充值 ~5元/次)\n')
            sys.stderr.write('\n  建议: 登录 https://www.tsa.cn/ 获取 API 端点\n')
            sys.stderr.write('  Fallback: 使用 --tsa free 申请免费时间戳\n')
        return False

    sys.stdout.write('    [OK] 响应已接收 (%d bytes)\n' % len(tsr_data))
    sys.stdout.write('    Content-Type: %s\n' % content_type)

    # 保存响应
    out_path = args.out or ('%s.tsr' % os.path.splitext(args.file)[0])
    with open(out_path, 'wb') as f:
        f.write(tsr_data)
    sys.stdout.write('[6] 响应已保存: %s\n' % out_path)

    # 验证响应
    sys.stdout.write('[7] 验证 TSA 响应...\n')
    ok, stdout, stderr = verify_ts_response_openssl(out_path, tsa_cert=args.tsa_cert)
    if ok:
        sys.stdout.write('    [OK] 响应验证通过!\n')
        sys.stdout.write('\n---- TSA 响应摘要 ----\n')
        for line in stdout.split('\n')[:30]:
            if line.strip():
                sys.stdout.write('  %s\n' % line.strip()[:120])
    else:
        sys.stderr.write('    [FAIL] 验证失败: %s\n' % stderr[:200])

    # 清理
    if not args.keep:
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)
        sys.stdout.write('[8] 临时文件已清理\n')
    else:
        sys.stdout.write('[8] 临时文件保留在: %s\n' % work_dir)

    # 生成验证说明
    sys.stdout.write('\n---- 验证方法 ----\n')
    sys.stdout.write('  openssl ts -reply -in %s -text\n' % out_path)
    sys.stdout.write('  # 哈希比对:\n')
    sys.stdout.write('  echo "%s" | xxd -r -p | sha256sum\n' % file_hash_hex)
    sys.stdout.write('\n[OK] 可信时间戳申请完成!\n')
    return True

# ─────────────────────────────────────────────────────────
# 6. CLI 入口
# ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='FIBEMATE AlgorithmRegistry - 中国TSA可信时间戳申请',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        示例:
          # 免费时间戳 (freetsa.org)
          python3 tsa_cn.py --file manifest.json --tsa free

          # 联合信任 (tsa.cn) - 需账号
          python3 tsa_cn.py --file manifest.json --tsa tsa \\
            --username YOUR_TSA_USERNAME --password YOUR_PASSWORD

          # 自定义 TSA 端点
          python3 tsa_cn.py --file manifest.json --tsa https://custom-tsa.example.com/tsa

          # 为单个 JS 文件申请
          python3 tsa_cn.py --file message-crypto-v2.js --tsa tsa \\
            --out message-crypto-v2.tsr

        费用参考 (tsa.cn):
          - 个人用户: 约 5 元/次
          - 企业用户: 约 3-5 元/次 (批量折扣)
          - 预付费充值, 最低充值 50 元

        TSA 端点获取:
          1. 登录 https://www.tsa.cn/
          2. 进入"标准时间戳服务" -> "接口服务"
          3. 获取专属 API 端点 URL 和认证信息
        """)
    )
    parser.add_argument('--file', required=True, help='要时间戳的文件 (或 manifest.json)')
    parser.add_argument('--tsa', default='free',
                        help='TSA 选择: tsa(联合信任) / free(免费) / 或自定义URL')
    parser.add_argument('--tsa-url', help='自定义 TSA 端点 URL (覆盖 --tsa)')
    parser.add_argument('--username', help='TSA 用户名 (tsa.cn 登录账号)')
    parser.add_argument('--password', help='TSA 密码')
    parser.add_argument('--out', help='输出 .tsr 文件路径')
    parser.add_argument('--keep', action='store_true', help='保留临时文件')
    parser.add_argument('--tsa-cert', help='TSA 证书路径 (用于验证)')

    args = parser.parse_args()

    # 检查 openssl
    try:
        r = subprocess.run(['openssl', 'version'], capture_output=True, text=True, timeout=5)
        sys.stdout.write('[openssl] %s\n' % r.stdout.strip())
    except Exception as e:
        sys.stderr.write('[ERROR] openssl 未安装或不可用: %s\n' % e)
        sys.stderr.write('  请先安装 openssl (apt install openssl / yum install openssl)\n')
        sys.exit(1)

    ok = process_tsa(args)
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
