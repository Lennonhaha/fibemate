H1 = '4e2f4bef677578b4c019b1c177ca7c34eba45ce5017166f9e6a948957b05bc9f'
H2 = '14cfcdbc8cecb70201c56661b4785e34ab1d22714fdd8e079589bc7b708bda04'
H3 = '5df297037ac1951f0511a16bd4a6842fb8753f42b788260a4edd14baa29f40ce'
H4 = '230a631865ba0ec04f1400fe765786a79938fc555233e00a01be28025a051b2f'
H5 = '77217b718824e0ac35f25cceae2ae7094929586b6f2e0be4dff26924e98f666e'

NEW = '''    <!-- Trusted Timestamp (RFC 3161) -->
    <div class="timestamp-proof" style="max-width: 900px; margin: 2rem auto 0; padding: 1.5rem 2rem; background: rgba(0,212,170,0.05); border: 1px solid rgba(0,212,170,0.2); border-radius: 8px; text-align: left;">
        <p style="margin: 0 0 0.5rem; font-size: 0.75rem; color: #00d4aa; letter-spacing: 2px; text-transform: uppercase;">Trusted Timestamp / RFC 3161</p>
        <p style="margin: 0 0 1rem; font-size: 0.85rem; color: #c9d1d9;">
            <a href="https://www.tsa.cn/verify" target="_blank" rel="noopener" style="color: #00d4aa;">tsa.cn/verify</a> &mdash; 以下文件已通过可信时间戳存证，SHA-256 可独立验证
        </p>
        <p style="margin: 0 0 0.3rem; font-size: 0.85rem; color: #e8f0f8;"><strong style="color:#00d4aa;">2026-05-23 00:49 CST</strong> &mdash; Crypto Core</p>
        <table style="margin: 0 0 0.8rem 0; font-size: 0.75rem; color: #8b949e; border-collapse: collapse; width: 100%%;">
            <tr><td style="padding:1px 8px 1px 0; white-space:nowrap;">message-crypto-v2.js</td><td style="padding:1px 0; font-family:monospace; font-size:0.65rem;">%s</td></tr>
            <tr><td style="padding:1px 8px 1px 0; white-space:nowrap;">sm2-browser.js</td><td style="padding:1px 0; font-family:monospace; font-size:0.65rem;">%s</td></tr>
            <tr><td style="padding:1px 8px 1px 0; white-space:nowrap;">sm2-browser.bundle.js</td><td style="padding:1px 0; font-family:monospace; font-size:0.65rem;">%s</td></tr>
        </table>
        <p style="margin: 0 0 0.3rem; font-size: 0.85rem; color: #e8f0f8;"><strong style="color:#00d4aa;">2026-05-23 01:18 CST</strong> &mdash; Application Backend</p>
        <table style="margin: 0 0 0.5rem 0; font-size: 0.75rem; color: #8b949e; border-collapse: collapse; width: 100%%;">
            <tr><td style="padding:1px 8px 1px 0; white-space:nowrap;">index.js</td><td style="padding:1px 0; font-family:monospace; font-size:0.65rem;">%s</td></tr>
            <tr><td style="padding:1px 8px 1px 0; white-space:nowrap;">jwt-helper.js</td><td style="padding:1px 0; font-family:monospace; font-size:0.65rem;">%s</td></tr>
        </table>
        <p style="margin: 0.5rem 0 0; font-size: 0.8rem; color: #646c78;">代码待审计后开源 | 独立技术研究 | 无商业运营</p>
    </div>''' % (H1, H3, H2, H4, H5)

path = '/opt/fibemate-full/www/index.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Find "<!-- Trusted Timestamp" and the matching closing block
start = html.find('<!-- Trusted Timestamp (RFC 3161)')
if start < 0:
    print('ERROR: start not found')
    exit(1)

# Find the pending line
pend = html.find('pending timestamp authority signature', start)
if pend < 0:
    print('ERROR: pending not found')
    exit(1)

# Find two closing </div> tags after the pending line
d1 = html.find('</div>', pend)
d2 = html.find('</div>', d1 + 6)
end = d2 + 6

old = html[start:end]
html2 = html.replace(old, NEW)

import shutil
shutil.copy(path, path + '.bak6')
with open(path, 'w', encoding='utf-8') as f:
    f.write(html2)

print(len(html2), 'bytes OK')

import os
os.system('nginx -s reload 2>&1')