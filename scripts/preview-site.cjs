#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * preview-site.cjs - zero-dependency static server for the www/ tree.
 *
 * Why this exists: www/package.json advertised `npm start` -> `node
 * src/server-main.js`, but that file was removed when the ZK auth server was
 * retired. The script therefore failed 100% of the time while looking like a
 * working entry point: a green-looking `package.json` around a missing file.
 * Either the claim or the file has to go. This is the file.
 *
 * Production is nginx. This server is only for local preview, and it exists so
 * that `npm start` is true without adding a dependency (express/serve/http-server)
 * to a directory whose dependencies are otherwise unused.
 *
 * Usage:
 *   node scripts/preview-site.cjs [--root www] [--port 8080] [--host 127.0.0.1]
 *   node scripts/preview-site.cjs --selftest      # start, probe, exit 0/1
 *
 * Exit codes: 0 ok, 1 selftest failed, 2 usage/IO error.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ts': 'text/plain; charset=utf-8',
};

function parseArgs(argv) {
  const out = { root: 'www', port: 8080, host: '127.0.0.1', selftest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--selftest') out.selftest = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--host') out.host = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else {
      process.stderr.write('unknown argument: ' + a + '\n');
      out.bad = true;
    }
  }
  return out;
}

function resolveInside(root, urlPath) {
  // Decode, strip query, then compare the resolved path against the root with a
  // separator-aware prefix test. String prefix tests alone accept /www-evil as
  // a child of /www, so the trailing separator matters.
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch (err) {
    return null;
  }
  if (decoded.indexOf('\0') !== -1) return null;
  const target = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && target.indexOf(rootWithSep) !== 0) return null;
  return target;
}

function createServer(root) {
  const realRoot = fs.realpathSync(root);
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('method not allowed\n');
      return;
    }
    let target = resolveInside(realRoot, url.parse(req.url).pathname || '/');
    if (target === null) {
      res.writeHead(403);
      res.end('forbidden\n');
      return;
    }
    let stat;
    try {
      stat = fs.statSync(target);
      if (stat.isDirectory()) {
        target = path.join(target, 'index.html');
        stat = fs.statSync(target);
      }
    } catch (err) {
      res.writeHead(404);
      res.end('not found\n');
      return;
    }
    // Symlinks that escape the root are refused after realpath, not before:
    // the check has to run on the file that will actually be read.
    if (fs.realpathSync(target).indexOf(realRoot + path.sep) !== 0) {
      res.writeHead(403);
      res.end('forbidden\n');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(target).pipe(res);
  });
}

function get(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

async function selftest(root) {
  const server = createServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const fails = [];
  try {
    const index = await get(port, '/index.html');
    const want = fs.readFileSync(path.join(root, 'index.html'));
    if (index.status !== 200) fails.push('/index.html status ' + index.status);
    else if (!index.body.equals(want)) fails.push('/index.html body differs (' + index.body.length + ' vs ' + want.length + ' B)');

    const binary = await get(port, '/favicon.ico');
    if (binary.status !== 200) fails.push('favicon.ico status ' + binary.status);
    else if (binary.body.length !== fs.statSync(path.join(root, 'favicon.ico')).size) {
      fails.push('favicon.ico length ' + binary.body.length);
    }

    const slash = await get(port, '/');
    if (slash.status !== 200) fails.push('/ status ' + slash.status);

    // A traversal probe has to name a file that exists ONLY outside the root.
    // /../package.json is useless here because www/package.json exists too; the
    // path normalises to /package.json and a 200 proves nothing either way.
    const traversal = await get(port, '/../scripts/check-live.cjs');
    if (traversal.status !== 404 && traversal.status !== 403) fails.push('traversal status ' + traversal.status);
    const encoded = await get(port, '/%2e%2e/scripts/check-live.cjs');
    if (encoded.status !== 404 && encoded.status !== 403) fails.push('encoded traversal status ' + encoded.status);

    const missing = await get(port, '/definitely-not-here-' + Date.now());
    if (missing.status !== 404) fails.push('missing status ' + missing.status);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  if (fails.length) {
    process.stdout.write('[FAIL] preview selftest: ' + fails.join('; ') + '\n');
    return 1;
  }
  process.stdout.write('[PASS] preview selftest: index 200 byte-identical, favicon 200, / 200, traversal refused, 404 for missing\n');
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.bad) {
    process.stdout.write('usage: node scripts/preview-site.cjs [--root www] [--port 8080] [--host 127.0.0.1] [--selftest]\n');
    return opts.bad ? 2 : 0;
  }
  const root = path.resolve(process.cwd(), opts.root);
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    process.stderr.write('not a site root (no index.html): ' + root + '\n');
    return 2;
  }
  if (opts.selftest) return selftest(root);
  const server = createServer(root);
  server.listen(opts.port, opts.host, () => {
    process.stdout.write('serving ' + root + ' at http://' + opts.host + ':' + opts.port + '/\n');
  });
  return null;
}

main().then((code) => {
  if (code !== null) process.exit(code);
});
