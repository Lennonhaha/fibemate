#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// scripts/verify-release.cjs
//
// Answers one question about a published package: is this exact version really
// available to a consumer right now, and is the bytes-on-the-wire what CI built?
//
// Written after fml-dsa@0.1.0 went through three states in three minutes:
// absent, a 0.0.0-stage placeholder, then the real version. Every naive check
// during that window produced a confident wrong answer, so the checks below are
// ordered the way the registry actually behaves:
//
//   1. the packument exists                          (HTTP 200)
//   2. dist-tags.latest points at the version asked for
//   3. GET /{name}/{version} exists                  (propagation lags step 1)
//   4. the tarball is downloadable
//   5. sha512 of the downloaded bytes == dist.integrity
//   6. attestations carry SLSA provenance
//
// Steps 1-4 retry for --wait-seconds (default 180) because the registry has a
// processing window between "publish succeeded" and "installable". A 404 inside
// that window is not a failure, it is a "not yet", so the checker waits instead
// of turning a propagation delay into an incident.
//
// Tarball fetches append a cache-busting query. A negative 404 for a tarball URL
// can be cached at the edge, so the plain URL keeps answering 404 for minutes
// after the object exists; the query makes the edge see a new key.
//
// Exit codes: 0 verified, 1 failed, 2 could not verify (network/auth), 3 usage.
//
// Usage:
//   node scripts/verify-release.cjs --package fml-dsa --version 0.1.0
//   node scripts/verify-release.cjs --package fml-dsa --version 0.1.0 --json
//   node scripts/verify-release.cjs --package fml-dsa --version 9.9.9 --wait-seconds 0

'use strict';

const crypto = require('crypto');

const REGISTRY = process.env.NPM_REGISTRY_OVERRIDE || 'https://registry.npmjs.org';

function parseArgs(argv) {
  const out = { waitSeconds: 180, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--package') out.pkg = argv[++i];
    else if (a === '--version') out.version = argv[++i];
    else if (a === '--wait-seconds') out.waitSeconds = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(3);
    }
  }
  return out;
}

class Unverifiable extends Error {}

async function get(url, { parse = 'json', timeoutMs = 20000, allow404 = true } = {}) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  } catch (e) {
    throw new Unverifiable(`${url} -> ${e.name === 'TimeoutError' ? 'timeout' : e.message}`);
  }
  if (res.status === 404 && allow404) return { status: 404 };
  if (res.status === 429 || res.status >= 500) {
    throw new Unverifiable(`${url} -> HTTP ${res.status} (rate limit or upstream error)`);
  }
  if (!res.ok) return { status: res.status, body: await res.text().catch(() => '') };
  if (parse === 'bytes') {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: buf };
  }
  return { status: res.status, json: await res.json() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry only the propagation-sensitive steps. A 404 here means "the publish may
// still be processing", not "the package is broken".
async function withPropagationWindow(fn, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  let last;
  for (;;) {
    last = await fn();
    if (last && last.status === 200) return last;
    if (Date.now() >= deadline) return last;
    await sleep(10000);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.pkg || !args.version) {
    console.error('usage: node scripts/verify-release.cjs --package <name> --version <x.y.z> [--wait-seconds N] [--json]');
    process.exit(3);
  }

  const { pkg, version } = args;
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  try {
    const doc = await withPropagationWindow(() => get(`${REGISTRY}/${encodeURIComponent(pkg)}`), args.waitSeconds);
    add('packument exists', doc.status === 200, `HTTP ${doc.status}`);
    if (doc.status !== 200) return finish(checks, args, 'packument missing after waiting');

    const tags = doc.json['dist-tags'] || {};
    add('dist-tags.latest', tags.latest === version, `latest=${tags.latest || '(none)'} expected=${version}`);

    const vdoc = await withPropagationWindow(
      () => get(`${REGISTRY}/${encodeURIComponent(pkg)}/${encodeURIComponent(version)}`),
      args.waitSeconds,
    );
    add('version document exists', vdoc.status === 200, `HTTP ${vdoc.status}`);
    if (vdoc.status !== 200) return finish(checks, args, 'version missing after waiting');

    const dist = vdoc.json.dist || {};
    const tarballUrl = dist.tarball;
    const bust = `${tarballUrl}${tarballUrl.includes('?') ? '&' : '?'}cachebust=${Date.now()}`;
    const tar = await withPropagationWindow(() => get(bust, { parse: 'bytes' }), args.waitSeconds);
    add('tarball downloadable', tar.status === 200 && tar.bytes.length > 0, tar.status === 200 ? `${tar.bytes.length} bytes` : `HTTP ${tar.status}`);
    if (tar.status !== 200) return finish(checks, args, 'tarball missing after waiting');

    // The only check that ties the published bytes to what CI built. Everything
    // above can be true of a package whose tarball was swapped after upload.
    const digest = 'sha512-' + crypto.createHash('sha512').update(tar.bytes).digest('base64');
    add('tarball matches dist.integrity', digest === dist.integrity, `${digest.slice(0, 24)}… vs ${String(dist.integrity).slice(0, 24)}…`);

    const att = await get(`${REGISTRY}/-/npm/v1/attestations/${encodeURIComponent(pkg)}@${encodeURIComponent(version)}`, { allow404: true });
    const list = att.status === 200 ? att.json.attestations || [] : [];
    const hasProvenance = list.some((a) => /slsa\.dev\/provenance/.test(a.predicateType || ''));
    add('attestations present', list.length > 0, `${list.length} attestation(s)`);
    add('SLSA provenance present', hasProvenance, hasProvenance ? 'slsa.dev/provenance' : 'missing');

    const failed = checks.filter((c) => !c.ok);
    return finish(checks, args, failed.length ? `${failed.length} check(s) failed` : null);
  } catch (e) {
    if (e instanceof Unverifiable) {
      checks.push({ name: 'network', ok: null, detail: e.message });
      return finish(checks, args, 'could not verify: ' + e.message, 2);
    }
    throw e;
  }
}

function finish(checks, args, error, code) {
  const failed = checks.filter((c) => c.ok === false);
  const unknown = checks.filter((c) => c.ok === null);
  const exit = code !== undefined ? code : failed.length ? 1 : unknown.length ? 2 : 0;

  if (args.json) {
    console.log(JSON.stringify({ package: args.pkg, version: args.version, ok: exit === 0, exit, checks }, null, 2));
  } else {
    console.log(`verify-release ${args.pkg}@${args.version}`);
    for (const c of checks) {
      const mark = c.ok === true ? 'PASS' : c.ok === false ? 'FAIL' : 'UNKNOWN';
      console.log(`  ${mark.padEnd(8)} ${c.name.padEnd(32)} ${c.detail}`);
    }
    if (error) console.log(`\n${exit === 2 ? 'UNVERIFIED' : 'FAILED'}: ${error}`);
    else console.log('\nVERIFIED');
  }
  process.exit(exit);
}

main().catch((e) => {
  console.error('verify-release crashed:', e && e.stack ? e.stack : e);
  process.exit(2);
});
