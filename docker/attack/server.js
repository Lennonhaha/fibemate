// SPDX-License-Identifier: GPL-3.0-only
// FIBEMATE PQC Attack — 本地攻防沙盒 API 服务器（仅供本地研究）
// 设计文档: docs/product-designs/08-pqc-docker.md §3
'use strict';
const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*'); // 本地沙盒，无外部暴露

  if (req.url === '/health') {
    return res.end(JSON.stringify({ status: 'ok', service: 'PQC Attack Sandbox', mode: 'local-research-only' }));
  }
  if (req.url.startsWith('/vwz')) {
    return res.end(JSON.stringify({ target: 'VWZ signature challenge', k: 8, note: 'See /app/vwz/' }));
  }
  if (req.url.startsWith('/lgv2')) {
    return res.end(JSON.stringify({ target: 'LookingGlass v2.2 WASM', note: 'Extract matrix M from the WASM binary' }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[pqc-attack] Listening on ${PORT} (local research sandbox)`);
});
