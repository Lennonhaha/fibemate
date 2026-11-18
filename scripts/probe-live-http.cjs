#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// probe-live-http.cjs -- close the response layer of the nginx gate.
//
// check-nginx-drift.cjs proves the tracked file equals the live file. That is a
// text comparison: it cannot see whether nginx parsed the file, and it cannot
// see what the site actually answers. This probe covers the answer.
//
//   node scripts/probe-live-http.cjs --base https://fibemate.net
//       Positive: / and /health return 200, /mixnet/ and /mixnet/foo return 410.
//       Negative: the retired paths must show no upstream trace -- no redirect,
//       no proxy headers, no upstream error page. A 200 alone would not prove
//       the route is retired; it could be the old proxy silently back.
//
//   node scripts/probe-live-http.cjs --self-test
//       Drive the assertion function with synthetic responses and require it to
//       reject each known-bad shape. A gate that only ever sees good input is
//       an untested gate.
//
// Exit codes: 0 pass, 1 usage, 2 assertion failed, 3 network error.

'use strict';

const DEFAULT_BASE = 'https://fibemate.net';
const TIMEOUT_MS = 10000;

// Headers an upstream application or proxy would leave behind. nginx itself
// sends `server: nginx`; anything naming an app server means the request still
// reached one.
const UPSTREAM_HEADERS = ['x-powered-by', 'x-upstream', 'x-backend-server', 'x-express', 'x-served-by', 'via'];

// Bodies that mean the request was proxied to something that is not there, or
// to something that is still there.
const UPSTREAM_BODY_MARKERS = [
  'Cannot GET',
  'ECONNREFUSED',
  'Bad Gateway',
  'Gateway Time-out',
  'proxy_pass',
  'gunicorn',
  'uvicorn',
  'Express'
];

const CASES = [
  { path: '/', want: 200, kind: 'home' },
  { path: '/health', want: 200, kind: 'health' },
  { path: '/mixnet/', want: 410, kind: 'retired' },
  { path: '/mixnet/foo', want: 410, kind: 'retired' }
];

const RETIRED_FORBIDDEN_STATUS = [200, 201, 204, 301, 302, 303, 307, 308, 502, 503, 504];

function header(headers, name) {
  const v = headers[name];
  return v === undefined || v === null ? '' : String(v);
}

// Pure: given a case and a finished response shape, return a list of checks.
// Every check is { name, ok, detail }, so the caller can print the actual value
// that failed instead of just "assertion failed".
function evaluate(spec, res) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  add(`${spec.path} status`, res.status === spec.want, `want ${spec.want}, got ${res.status}`);

  if (spec.kind === 'retired') {
    add(`${spec.path} is not proxying`, !RETIRED_FORBIDDEN_STATUS.includes(res.status), `got ${res.status}`);

    const location = header(res.headers, 'location');
    add(`${spec.path} has no Location`, location === '', location ? `Location: ${location}` : 'absent');

    for (const h of UPSTREAM_HEADERS) {
      const v = header(res.headers, h);
      add(`${spec.path} has no ${h}`, v === '', v ? `${h}: ${v}` : 'absent');
    }

    const server = header(res.headers, 'server').toLowerCase();
    add(`${spec.path} is served by nginx`, server === '' || server === 'nginx', server || 'absent');

    const hit = UPSTREAM_BODY_MARKERS.find((m) => res.body.includes(m));
    add(`${spec.path} body has no upstream trace`, hit === undefined, hit === undefined ? 'clean' : `found "${hit}"`);

    add(`${spec.path} body is not empty`, res.body.length > 0, `${res.body.length} bytes`);
  }

  if (spec.kind === 'health') {
    const type = header(res.headers, 'content-type');
    add('/health is JSON', type.includes('application/json'), type || 'absent');
    let status = '';
    try {
      status = String(JSON.parse(res.body).status || '');
    } catch (e) {
      status = '(unparsable)';
    }
    add('/health reports status ok', status === 'ok', status || '(missing)');
  }

  return checks;
}

async function fetchShaped(url) {
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'fibemate-http-probe/1' }
  });
  const body = await res.text();
  const headers = {};
  for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
  return { status: res.status, headers, body };
}

function report(label, checks) {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.name} (${c.detail})`);
  console.log(`  ${label}: ${failed.length === 0 ? 'ok' : failed.length + ' failed'}`);
  return failed.length;
}

const SELF_TEST = [
  {
    name: 'good retired route',
    spec: { path: '/mixnet/', want: 410, kind: 'retired' },
    res: { status: 410, headers: { server: 'nginx', 'content-type': 'text/html' }, body: '<html><title>410 Gone</title></html>' },
    expect: 0
  },
  {
    name: 'retired route leaking an app header',
    spec: { path: '/mixnet/', want: 410, kind: 'retired' },
    res: { status: 410, headers: { server: 'nginx', 'x-powered-by': 'Express' }, body: 'gone' },
    expect: 1
  },
  {
    name: 'retired route silently redirecting',
    spec: { path: '/mixnet/', want: 410, kind: 'retired' },
    res: { status: 302, headers: { server: 'nginx', location: 'https://example.invalid/mixnet' }, body: '' },
    expect: 4
  },
  {
    name: 'old proxy answering 200 again',
    spec: { path: '/mixnet/', want: 410, kind: 'retired' },
    res: { status: 200, headers: { server: 'nginx' }, body: 'Cannot GET /mixnet/' },
    expect: 3
  },
  {
    name: 'upstream down, nginx 502 page',
    spec: { path: '/mixnet/', want: 410, kind: 'retired' },
    res: { status: 502, headers: { server: 'nginx' }, body: '<center><h1>502 Bad Gateway</h1></center>' },
    expect: 3
  },
  {
    name: 'home ok',
    spec: { path: '/', want: 200, kind: 'home' },
    res: { status: 200, headers: { server: 'nginx' }, body: '<html></html>' },
    expect: 0
  },
  {
    name: 'health ok',
    spec: { path: '/health', want: 200, kind: 'health' },
    res: { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"status":"ok"}' },
    expect: 0
  },
  {
    name: 'health degraded',
    spec: { path: '/health', want: 200, kind: 'health' },
    res: { status: 200, headers: { 'content-type': 'application/json' }, body: '{"status":"degraded"}' },
    expect: 1
  }
];

function selfTest() {
  let bad = 0;
  for (const t of SELF_TEST) {
    const failed = evaluate(t.spec, t.res).filter((c) => !c.ok).length;
    const ok = failed === t.expect;
    if (!ok) bad += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} self-test "${t.name}" -> ${failed} failing check(s), expected ${t.expect}`);
  }
  console.log(`self-test: ${SELF_TEST.length - bad}/${SELF_TEST.length} behaved as expected`);
  return bad === 0 ? 0 : 1;
}

async function main(argv) {
  const opts = { base: DEFAULT_BASE, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--self-test') opts.selfTest = true;
    else if (a === '--base') opts.base = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('usage: probe-live-http.cjs [--base <url>] [--self-test]');
      return 0;
    } else {
      console.error('unknown argument: ' + a);
      return 1;
    }
  }

  if (opts.selfTest) return selfTest();

  let failedTotal = 0;
  for (const spec of CASES) {
    const url = opts.base.replace(/\/+$/, '') + spec.path;
    let res;
    try {
      res = await fetchShaped(url);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      console.log(`  FAIL ${url} unreachable (${msg})`);
      return 3;
    }
    console.log(`${url}`);
    failedTotal += report(spec.path, evaluate(spec, res));
  }
  console.log(`probe: ${failedTotal === 0 ? 'all checks passed' : failedTotal + ' check(s) failed'}`);
  return failedTotal === 0 ? 0 : 2;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
