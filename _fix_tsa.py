import re

H1 = '4e2f4bef677578b4c019b1c177ca7c34eba45ce5017166f9e6a948957b05bc9f'
H2 = '14cfcdbc8cecb70201c56661b4785e34ab1d22714fdd8e079589bc7b708bda04'
H3 = '5df297037ac1951f0511a16bd4a6842fb8753f42b788260a4edd14baa29f40ce'
H4 = '230a631865ba0ec04f1400fe765786a79938fc555233e00a01be28025a051b2f'
H5 = '77217b718824e0ac35f25cceae2ae7094929586b6f2e0be4dff26924e98f666e'

NEW_TSA = f'''    <!-- Trusted Timestamp (RFC 3161) -->
    <div class="timestamp-proof" style="max-width: 900px; margin: 2rem auto 0; padding: 1.5rem 2rem; background: rgba(0,212,170,0.05); border: 1px solid rgba(0,212,170,0.2); border-radius: 8px; text-align: left;">
        <p style="margin: 0 0 0.5rem; font-size: 0.75rem; color: #00d4aa; letter-spacing: 2px; text-transform: uppercase;">Trusted Timestamp / RFC 3161</p>
        <p style="margin: 0 0 0.8rem; font-size: 0.85rem; color: #c9d1d9;">
            FibeMate 核心模块已通过 <a href="https://www.tsa.cn/verify" target="_blank" rel="noopener" style="color: #00d4aa;">tsa.cn</a> 完成可信时间戳存证，SHA-256 可独立验证。
        </p>

        <p style="margin: 0 0 0.3rem; font-size: 0.88rem; color: #e8f0f8;">
            <strong style="color:#00d4aa;">2026-05-23 00:49 CST</strong> &#8212; Crypto Core
        </p>
        <table style="margin: 0 0 0.8rem 0; font-size: 0.78rem; color: #a0b8c8; border-collapse: collapse; width: 100%;">
            <tr>
                <td style="padding: 2px 8px 2px 0; vertical-align: top; white-space: nowrap;">message-crypto-v2.js</td>
                <td style="padding: 2px 0; font-family: monospace; font-size: 0.68rem; color: #505860; word-break: break-all;">{H1}</td>
            </tr>
            <tr>
                <td style="padding: 2px 8px 2px 0; vertical-align: top; white-space: nowrap;">sm2-browser.js</td>
                <td style="padding: 2px 0; font-family: monospace; font-size: 0.68rem; color: #505860; word-break: break-all;">{H3}</td>
            </tr>
            <tr>
                <td style="padding: 2px 8px 2px 0; vertical-align: top; white-space: nowrap;">sm2-browser.bundle.js</td>
                <td style="padding: 2px 0; font-family: monospace; font-size: 0.68rem; color: #505860; word-break: break-all;">{H2}</td>
            </tr>
        </table>

        <p style="margin: 0 0 0.3rem; font-size: 0.88rem; color: #e8f0f8;">
            <strong style="color:#00d4aa;">2026-05-23 01:18 CST</strong> &#8212; Application Backend
        </p>
        <table style="margin: 0 0 0.5rem 0; font-size: 0.78rem; color: #a0b8c8; border-collapse: collapse; width: 100%;">
            <tr>
                <td style="padding: 2px 8px 2px 0; vertical-align: top; white-space: nowrap;">index.js</td>
                <td style="padding: 2px 0; font-family: monospace; font-size: 0.68rem; color: #505860; word-break: break-all;">{H4}</td>
            </tr>
            <tr>
                <td style="padding: 2px 8px 2px 0; vertical-align: top; white-space: nowrap;">jwt-helper.js</td>
                <td style="padding: 2px 0; font-family: monospace; font-size: 0.68rem; color: #505860; word-break: break-all;">{H5}</td>
            </tr>
        </table>

        <p style="margin: 0.5rem 0 0; font-size: 0.8rem; color: #646c78; line-height: 1.5;">
            代码待审计后开源。本项目为独立技术研究，不涉及商业运营。
        </p>
    </div>'''

# Read index.html
with open('/opt/fibemate-full/www/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the old TSA section bounds
# Start: "<!-- Trusted Timestamp (RFC 3161)"
start = html.find('<!-- Trusted Timestamp (RFC 3161)')
# End: the </div> before the <script> tag that follows
# Find the "pending" line that's in the old section
pending = html.find('pending timestamp authority signature', start)
# Find the two closing </div> tags after it
end1 = html.find('</div>', pending)
end2 = html.find('</div>', end1 + 6)
old = html[start:end2 + 6]

# Replace
html2 = html.replace(old, NEW_TSA)

# Backup and write
import shutil
shutil.copy('/opt/fibemate-full/www/index.html', '/opt/fibemate-full/www/index.html.bak5')

with open('/opt/fibemate-full/www/index.html', 'w', encoding='utf-8') as f:
    f.write(html2)

print('OK: TSA section replaced')

# Also add a compact footer note near ICP
# Find the ICP line
icp_pos = html2.find('ICP')
icp_line_start = html2.rfind('\n', 0, icp_pos) + 1
icp_line_end = html2.find('\n', icp_pos)
icp_line = html2[icp_line_start:icp_line_end]
print(f'ICP line: {icp_line.strip()[:120]}')

# Add TSA cert note after ICP if not already there
if 'tsa.cn' not in icp_line.lower():
    tsa_tag = ' <span class="tsa-cert" style="color: #00d4aa; margin-left: 1em;">TSA RFC 3161  tsa.cn/verify</span>'
    new_line = icp_line.strip() + tsa_tag
    html3 = html2.replace(icp_line.strip(), new_line)
    with open('/opt/fibemate-full/www/index.html', 'w', encoding='utf-8') as f:
        f.write(html3)
    print('OK: TSA tag added near ICP')

import subprocess
r = subprocess.run(['nginx', '-s', 'reload'], capture_output=True, text=True)
print(f'nginx reload: {r.stdout} {r.stderr}')