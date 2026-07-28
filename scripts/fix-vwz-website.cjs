// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// Fix VWZ transparency in index.html
const fs = require('fs');
const path = '/opt/fibemate-repo/www/index.html';
let html = fs.readFileSync(path, 'utf8');

// 1. TSR line: VWZ 148/148 �?�?VWZ 148/148 ⚠️ (已撤�?
html = html.replace(/VWZ 148\/148 �?, 'VWZ 148/148 ⚠️ (已撤�?');

// 2. Bottom timeline: vwz-challenge link �?withdrawn notice
html = html.replace(
  /<a href="\/vwz-challenge\/"[^>]*>VWZ 密码分析挑战�?�?\/a>/,
  '<span style="color:#646c78;">VWZ 已撤�?(eprint 2026/110618)</span>'
);

// 3. Bottom timeline: remove VWZ Rust/WASM benchmark claim
html = html.replace(
  / · VWZ Rust\/WASM 公钥压缩 \(全量�?2\.8KB, rank-1 理论�?468B, 7\/7\) · 浏览�?WASM 基准测速完�?,
  ' · 浏览�?WASM 基准测速完�?
);

fs.writeFileSync(path, html, 'utf8');
console.log('Done');
