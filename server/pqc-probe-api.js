/**
 * PQC Probe API Server — lightweight Node.js HTTP bridge
 *
 * Runs on localhost:9004 (only reachable via nginx reverse proxy).
 * Accepts GET /api/v1/probe?target=host:port and delegates to pqc-detector.
 */
'use strict';

const http = require('http');
const url = require('url');
const { probe } = require('./pqc-detector');

const PORT = process.env.PORT || 9004;
const ALLOWED_ORIGINS = ['https://fibemate.net'];
const MAX_TARGETS = 5;

// ─── Simple JSON error ──────────────────────────────────────────────────────
function errorJson(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

// ─── CORS ────────────────────────────────────────────────────────────────────
function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ─── Health ──────────────────────────────────────────────────────────────────
function handleHealth(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    node: process.version,
  }));
}

// ─── Probe single target ─────────────────────────────────────────────────────
async function handleProbe(reqUrl, res) {
  const target = (reqUrl.searchParams.get('target') || '').trim();
  if (!target) return errorJson(res, 400, 'Missing "target" parameter (e.g. ?target=fibemate.net:443)');

  // Basic validation: strip protocol, allow host[:port]
  const cleaned = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const parts = cleaned.split(':');
  const hostname = parts[0];
  const port = parseInt(parts[1], 10) || 443;

  if (!hostname || hostname.length < 3) return errorJson(res, 400, 'Invalid hostname');

  try {
    const result = await probe(hostname, port);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    errorJson(res, 502, `Probe failed: ${err.message}`);
  }
}

// ─── Probe batch ─────────────────────────────────────────────────────────────
async function handleProbeBatch(reqUrl, res) {
  const targetsRaw = reqUrl.searchParams.get('targets');
  if (!targetsRaw) return errorJson(res, 400, 'Missing "targets" parameter (comma-separated)');

  const targets = targetsRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_TARGETS);
  if (targets.length === 0) return errorJson(res, 400, 'No valid targets');

  const results = [];
  for (const t of targets) {
    const cleaned = t.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const parts = cleaned.split(':');
    const hostname = parts[0];
    const port = parseInt(parts[1], 10) || 443;
    try {
      const r = await probe(hostname, port);
      results.push(r);
    } catch (err) {
      results.push({ endpoint: cleaned, error: err.message });
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ count: results.length, results }));
}

// ─── Predefined endpoints ────────────────────────────────────────────────────
const PREDEFINED = {
  'fibemate':   'fibemate.net:443',
  'cloudflare': 'cloudflare.com:443',
};

async function handlePredefined(reqUrl, res) {
  const name = reqUrl.searchParams.get('name');
  const target = PREDEFINED[name];
  if (!target) return errorJson(res, 400, `Unknown predefined endpoint. Available: ${Object.keys(PREDEFINED).join(', ')}`);

  const cleaned = target.replace(/^https?:\/\//, '');
  const parts = cleaned.split(':');
  try {
    const result = await probe(parts[0], parseInt(parts[1], 10) || 443);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    errorJson(res, 502, `Predefined probe failed: ${err.message}`);
  }
}

// ─── Main server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCors(req, res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const reqUrl = new url.URL(req.url, 'http://localhost');
  const path = reqUrl.pathname;

  if (req.method === 'GET' && path === '/health') return handleHealth(res);
  if (req.method === 'GET' && path === '/api/v1/probe') return handleProbe(reqUrl, res);
  if (req.method === 'GET' && path === '/api/v1/probe/batch') return handleProbeBatch(reqUrl, res);
  if (req.method === 'GET' && path === '/api/v1/probe/predefined') return handlePredefined(reqUrl, res);

  // 404
  errorJson(res, 404, 'Not found. Try /health, /api/v1/probe?target=host:port');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[PQC Probe API] listening on http://127.0.0.1:${PORT}`);
  console.log(`  GET /health`);
  console.log(`  GET /api/v1/probe?target=host:port`);
  console.log(`  GET /api/v1/probe/batch?targets=host1,host2`);
  console.log(`  GET /api/v1/probe/predefined?name=fibemate|cloudflare`);
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
