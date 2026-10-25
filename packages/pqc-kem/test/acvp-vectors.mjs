#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * acvp-vectors.mjs — rebuild the ML-KEM ACVP vector files from NIST's repository.
 *
 * The vectors are committed (test/vectors/mlkem-*.json), so tests and CI never need
 * network access. Run this only when you intend to refresh them; the blob SHAs are
 * pinned so a refresh is an explicit, reviewable commit rather than silent drift.
 *
 *   node test/acvp-vectors.mjs            # write the files
 *   node test/acvp-vectors.mjs --check    # compare with committed files, write nothing
 *
 * Source: usnistgov/ACVP-Server, gen-val/json-files/ML-KEM-*-FIPS203/
 * Uses the GitHub API (gh CLI) because raw.githubusercontent.com is not reachable
 * from every network this project is developed on; a plain HTTPS fallback is kept
 * for environments without gh.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, 'vectors');
const CHECK = process.argv.includes('--check');
const REPO = 'usnistgov/ACVP-Server';
const REF = 'master';

const SOURCES = {
  keygen: {
    file: 'mlkem-keygen.json',
    prompt: { path: 'gen-val/json-files/ML-KEM-keyGen-FIPS203/prompt.json', sha: '0d701155b53e0da51cfffebd81abc6deb5be4878' },
    expected: { path: 'gen-val/json-files/ML-KEM-keyGen-FIPS203/expectedResults.json', sha: '883e318345b68382d09df05530c5209f4e509d54' },
  },
  encapdecap: {
    file: 'mlkem-encapdecap.json',
    prompt: { path: 'gen-val/json-files/ML-KEM-encapDecap-FIPS203/prompt.json', sha: 'a83226e0214b68a36f1519b45e70d6a307e6dc66' },
    expected: { path: 'gen-val/json-files/ML-KEM-encapDecap-FIPS203/expectedResults.json', sha: '4e8d43e59d1f2d66512e8d725572ea9877f723ef' },
  },
};

async function fetchBlob(sha, path) {
  try {
    const out = execFileSync('gh', ['api', `repos/${REPO}/git/blobs/${sha}`, '--jq', '.content'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return Buffer.from(out.replace(/\s/g, ''), 'base64');
  } catch (e) {
    const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cannot fetch ${path}: gh failed (${e.message.slice(0, 60)}) and HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

function provenance(src, promptBytes, expectedBytes) {
  return {
    source: `https://github.com/${REPO}/tree/${REF}/gen-val/json-files`,
    retrieved: new Date().toISOString().slice(0, 10),
    files: [
      { path: src.prompt.path, blob_sha: src.prompt.sha, bytes: promptBytes.length, sha256: createHash('sha256').update(promptBytes).digest('hex') },
      { path: src.expected.path, blob_sha: src.expected.sha, bytes: expectedBytes.length, sha256: createHash('sha256').update(expectedBytes).digest('hex') },
    ],
    note: 'Trimmed to the fields the tests consume; blob_sha identifies the upstream file, sha256 the bytes fetched here.',
  };
}

function buildKeygen(prompt, expected) {
  const expByTc = new Map();
  for (const g of expected.testGroups) for (const t of g.tests) expByTc.set(t.tcId, t);
  const groups = prompt.testGroups.map(g => ({
    tgId: g.tgId,
    parameterSet: g.parameterSet,
    testType: g.testType,
    tests: g.tests.map(t => {
      const e = expByTc.get(t.tcId);
      if (!e) throw new Error(`keyGen tcId ${t.tcId} has no expected result`);
      return { tcId: t.tcId, d: t.d, z: t.z, ek: e.ek, dk: e.dk };
    }),
  }));
  return groups;
}

function buildEncapDecap(prompt, expected) {
  const expByTc = new Map();
  for (const g of expected.testGroups) for (const t of g.tests) expByTc.set(`${g.tgId}:${t.tcId}`, t);
  const groups = prompt.testGroups.map(g => ({
    tgId: g.tgId,
    parameterSet: g.parameterSet,
    function: g.function,
    tests: g.tests.map(t => {
      const e = expByTc.get(`${g.tgId}:${t.tcId}`);
      if (!e) throw new Error(`${g.function} tcId ${t.tcId} has no expected result`);
      const out = { tcId: t.tcId };
      if (t.ek) out.ek = t.ek;
      if (t.dk) out.dk = t.dk;
      if (t.m) out.m = t.m;
      if (t.c) out.c = t.c;
      if (e.c !== undefined) out.expectedC = e.c;
      if (e.k !== undefined) out.expectedK = e.k;
      if (e.testPassed !== undefined) out.expectedTestPassed = e.testPassed;
      return out;
    }),
  }));
  return groups;
}

async function build() {
  const results = {};
  for (const [key, src] of Object.entries(SOURCES)) {
    const promptBytes = await fetchBlob(src.prompt.sha, src.prompt.path);
    const expectedBytes = await fetchBlob(src.expected.sha, src.expected.path);
    const prompt = JSON.parse(promptBytes.toString('utf8'));
    const expected = JSON.parse(expectedBytes.toString('utf8'));
    const groups = key === 'keygen' ? buildKeygen(prompt, expected) : buildEncapDecap(prompt, expected);
    results[key] = {
      provenance: provenance(src, promptBytes, expectedBytes),
      groups,
      total: groups.reduce((n, g) => n + g.tests.length, 0),
    };
    console.log(`${key}: ${groups.length} groups, ${results[key].total} cases, from ${src.prompt.path}`);
  }
  return results;
}

function write(result, file, payload) {
  const text = JSON.stringify(payload, null, 1) + '\n';
  if (CHECK) {
    if (!existsSync(file)) { console.log(`MISSING ${file}`); return false; }
    const same = readFileSync(file, 'utf8') === text;
    console.log(`${same ? 'same' : 'DIFFERS'} ${file}`);
    return same;
  }
  writeFileSync(file, text, 'utf8');
  console.log(`wrote ${file} (${Buffer.byteLength(text)} bytes)`);
  return true;
}

(async () => {
  if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
  const built = await build();
  let ok = true;
  for (const [key, src] of Object.entries(SOURCES)) ok = write(`${key}`, resolve(OUT_DIR, src.file), built[key]) && ok;
  if (CHECK && !ok) process.exit(1);
})();
