#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Insert countdown banner into www/index.html, after <body> tag."""
import re, datetime

with open('/opt/fibemate-repo/www/index.html', 'r') as f:
    content = f.read()

launch_date = datetime.date(2026, 8, 31)
today = datetime.date.today()
days_left = (launch_date - today).days

banner = f'''<div class="countdown-banner">
  <span class="countdown-icon">&#x1F513;</span>
  <span>FIBEMATE v3.3.0 opensource <strong>2026-08-31</strong> &mdash; <strong>{days_left}</strong> days away</span>
  <span>· <a href="https://github.com/Lennonhaha/fibemate">GitHub</a></span>
  <span>· <a href="/docs/launch-announcement-2026-08-31.html">Announcement</a></span>
</div>
'''

# Insert after body tag
body_tag = '<body>'
banner_css = '''<style>
.countdown-banner {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #e2e8f0;
  text-align: center;
  padding: 10px 16px;
  font-size: 14px;
  border-bottom: 2px solid var(--primary, #00E5C3);
  letter-spacing: 0.3px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.countdown-banner a {
  color: #00E5C3;
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1px dotted #00E5C3;
}
.countdown-banner a:hover {
  color: #00ffd5;
  border-bottom-style: solid;
}
.countdown-banner .countdown-icon {
  font-size: 16px;
  margin-right: 4px;
}
.countdown-banner strong {
  color: #00E5C3;
}
</style>
'''

content = content.replace(body_tag, body_tag + '\n' + banner_css + '\n' + banner)

with open('/opt/fibemate-repo/www/index.html', 'w') as f:
    f.write(content)

print(f'Banner inserted: {days_left} days until 2026-08-31')
