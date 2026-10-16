// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * Shared helpers for the ML-KEM-768 interoperability harness (P2.2).
 *
 * Everything here is deterministic on purpose: the whole point of the harness
 * is that a stranger can run one command and get the same report hash.
 *
 * Determinism rules encoded here:
 *   - per-round key seeds are derived from a master seed (sha3-256), never from
 *     wall-clock time or OS entropy;
 *   - the RNG dispatcher (below) is the ONLY sanctioned way to feed fixed
 *     randomness to the implementation under test;
 *   - the KAT reader returns fields verbatim, no normalisation.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

export const OURS_PATH = path.join(REPO_ROOT, 'packages', 'pqc-kem', 'src', 'ml-kem-768.js');
export const OQS_GEN_C = path.join(REPO_ROOT, 'scripts', 'oqs_gen.c');
export const KAT_PATH = path.join(
  REPO_ROOT, 'packages', 'pqc-kem', 'test', 'kat', 'mlkem-768-KAT.rsp',
);

/** FIPS 203 ML-KEM-768 byte sizes. */
export const EXPECT = { seed: 32, m: 32, ek: 1184, dk: 2400, ct: 1088, ss: 32 };

/** Canonical FIPS 203 dk = dkPKE(1152) || ek(1184) || H(ek)(32) || z(32). */
export const DK_LAYOUT = { dkPKE: 1152, ek: 1184, hash: 32, z: 32 };

/**
 * Master seed used when the caller does not pass --seed.
 * Fixed constant => run-to-run and machine-to-machine identical reports.
 */
export const DEFAULT_MASTER_SEED = '00'.repeat(32);

export const hex = (b) => Buffer.from(b).toString('hex');
export const unhex = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
export const isHex = (s, bytes) =>
  typeof s === 'string' && /^[0-9a-fA-F]*$/.test(s) && s.length === bytes * 2;
export const sha3_256 = (b) => crypto.createHash('sha3-256').update(b).digest();
export const sha3_512 = (b) => crypto.createHash('sha3-512').update(b).digest();
export const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** Deterministic 32-byte seed for (label, round) derived from the master seed. */
export function deriveSeed(masterHex, label, round) {
  const idx = Buffer.alloc(4);
  idx.writeUInt32BE(round >>> 0);
  return sha3_256(Buffer.concat([unhex(masterHex), Buffer.from(label, 'utf8'), idx]));
}

/** Deterministic (d, z) pair of a given round; FIPS 203 keygen consumes d then z. */
export function deriveDZ(masterHex, round) {
  const d = deriveSeed(masterHex, 'd', round);
  const z = deriveSeed(masterHex, 'z', round);
  return { d, z };
}

/**
 * RNG dispatcher.
 *
 * The implementation under test reads randomness from
 * `crypto.getRandomValues` resolved against the *global* webcrypto object
 * (see packages/pqc-kem/src/ml-kem-768.js generateKeypair(): `crypto.getRandomValues(...)`).
 * On Node, `globalThis.crypto` is a getter-only accessor, so replacing the whole
 * object silently does nothing -- but `getRandomValues` is inherited from the
 * Crypto prototype, and the instance is extensible, so shadowing the *method*
 * works and is the only path that actually reaches the implementation.
 *
 * When no deterministic chunks are queued the dispatcher delegates to the real
 * webcrypto call, so ordinary (non-deterministic) legs keep working.
 */
export function createRngDispatcher() {
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('globalThis.crypto.getRandomValues unavailable (need Node >= 19)');
  }
  const target = globalThis.crypto;
  const real = target.getRandomValues.bind(target);
  let chunks = null;
  let calls = 0;

  target.getRandomValues = (buf) => {
    if (!chunks) return real(buf);
    calls += 1;
    const next = chunks.shift();
    if (!next) throw new Error('rng dispatcher: out of deterministic chunks');
    if (next.length !== buf.length) {
      throw new Error(`rng dispatcher: chunk length ${next.length} != requested ${buf.length}`);
    }
    buf.set(next);
    return buf;
  };

  return {
    /** Queue deterministic chunks; returns a token with consumed()/left(). */
    use(list) {
      chunks = list.map((c) => Uint8Array.from(c));
      calls = 0;
      const token = {
        get calls() { return calls; },
        get left() { return chunks ? chunks.length : 0; },
        get consumed() { return calls > 0; },
      };
      return token;
    },
    end() { chunks = null; },
    restore() { target.getRandomValues = real; },
    isPatched() { return target.getRandomValues !== real; },
  };
}

/**
 * Read the NIST-style .rsp vector file. Returns blocks in file order with the
 * raw hex strings untouched (no trimming of field content, only of line ends).
 */
export function parseKat(text) {
  const blocks = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(\w+)\s*=\s*(\S+)\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'count') {
      cur = { count: Number(value) };
      blocks.push(cur);
    } else if (cur) {
      cur[key] = value;
    }
  }
  return blocks;
}

/** Load the FIBEMATE ML-KEM-768 implementation (CommonJS) from this ESM runner. */
export function loadOurs() {
  return createRequire(import.meta.url)(OURS_PATH);
}
