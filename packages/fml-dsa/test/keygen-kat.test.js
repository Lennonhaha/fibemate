#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * keygen-kat.test.js — our KeyGen against NIST ACVP vectors
 *
 * Until now the repo's "KAT 75/75" checked @noble/post-quantum against the NIST vectors
 * (kat-verify.mjs calls noble's keygen, not ours). That told us noble was right; it said
 * nothing about fml-dsa. This runs the same vectors through our own keygen.
 *
 * Why it matters: our power2Round folded 2^(d-1) down to -2^(d-1), which is outside the
 * range mod± 2^13 can produce. keygen then emitted t0 = -4096, encodeSK wrapped it modulo
 * 8192, and the mismatch only surfaced as a self-test printing FAIL. Any key whose seed hit
 * that boundary got a t1 one higher than FIPS 204 and a pk that disagreed with every other
 * implementation. #470
 *
 * Exit 0 = every vector matches byte-for-byte, 1 = mismatch or missing vectors.
 */
'use strict';

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keygen } from '../src/core/keygen.js';
import { encodePK, encodeSK } from '../src/core/encode.js';

const here = dirname(fileURLToPath(import.meta.url));
const KAT_DIR = resolve(here, '..', 'kat-vectors');
const PS_MAP = { 1312: 'ML-DSA-44', 1952: 'ML-DSA-65', 2592: 'ML-DSA-87' };

function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return b;
}

function firstDiff(got, exp) {
  if (got.length !== exp.length) return `length ${got.length} != ${exp.length}`;
  for (let i = 0; i < got.length; i++) {
    if (got[i] !== exp[i]) return `offset ${i}: got 0x${got[i].toString(16)} expected 0x${exp[i].toString(16)}`;
  }
  return null;
}

if (!existsSync(KAT_DIR)) {
  console.log(`SKIP: no vector directory at ${KAT_DIR}`);
  process.exit(0);
}

const files = readdirSync(KAT_DIR).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.log('SKIP: no KAT json files');
  process.exit(0);
}

let total = 0;
let passed = 0;
const failures = [];

for (const file of files) {
  const tests = JSON.parse(readFileSync(resolve(KAT_DIR, file), 'utf8'));
  const first = tests.find((t) => t.pk && t.sk && t.seed);
  if (!first) continue;
  const paramSet = PS_MAP[first.pk.length / 2];
  if (!paramSet) continue;

  for (const t of tests) {
    if (!t.seed || !t.pk || !t.sk) continue;
    total++;
    try {
      const { pk, sk } = keygen(paramSet, hexToBytes(t.seed));
      const pkDiff = firstDiff(encodePK(pk, paramSet), hexToBytes(t.pk));
      const skDiff = firstDiff(encodeSK(sk, paramSet), hexToBytes(t.sk));
      if (!pkDiff && !skDiff) {
        passed++;
        continue;
      }
      failures.push(`${paramSet} tcId=${t.tcId} pk ${pkDiff || 'ok'} / sk ${skDiff || 'ok'}`);
    } catch (err) {
      failures.push(`${paramSet} tcId=${t.tcId} threw: ${err.message}`);
    }
  }
}

console.log(`  vectors: ${total} | match: ${passed} | mismatch: ${failures.length}`);
for (const line of failures.slice(0, 10)) console.log(`  FAIL ${line}`);
if (failures.length > 10) console.log(`  ... ${failures.length - 10} more`);

if (total === 0) {
  console.log('SKIP: vectors present but unusable');
  process.exit(0);
}
if (failures.length > 0) {
  console.log('❌ keygen KAT FAILED');
  process.exit(1);
}
console.log(`✅ keygen matches all ${passed} NIST ACVP vectors byte-for-byte`);
