// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/index.js — public ML-DSA (FIPS 204) API
//
// This entry used to wrap an eval()'d bundle read from ../../../www/noble-pq-bundle/ml-dsa.js.
// That made the package unusable outside this repository: the tarball installed fine and then
// threw ENOENT on the first import. It also meant the published API was a different
// implementation than src/core, so "the package works" and "the tests pass" were unrelated
// claims. This file is now a thin adapter over src/core — no fs, no eval, no network.
//
// API surface is unchanged on purpose (noble-style, used by tests and the fuzz harness):
//   keygen(seed?)            -> { publicKey, secretKey }        (Uint8Array)
//   sign(msg, secretKey, o?) -> Uint8Array                      (signature bytes)
//   verify(sig, msg, pk, o?) -> boolean
//   name, params
// opts supported: { context, extraEntropy }. extraEntropy semantics follow noble:
//   omitted / false -> deterministic, rnd = 0^32
//   true            -> hedged, 32 bytes from the system CSPRNG
//   Uint8Array(32)  -> hedged with caller-supplied rnd
// externalMu is rejected rather than silently ignored (this core does not implement it).

import { keygen as coreKeygen } from './core/keygen.js';
import { sign as coreSign } from './core/sign.js';
import { verify as coreVerify } from './core/verify.js';
import { encodePK, encodeSK, encodeSig, decodeSK } from './core/encode.js';
import { MLDSA_PARAMS } from './core/params.js';
import { randomBytes } from '@noble/hashes/utils.js';

function isU8(v) {
  return v instanceof Uint8Array;
}

function parseOpts(opts, where) {
  if (opts === undefined || opts === null) return { ctx: new Uint8Array(0), rnd: null };
  if (typeof opts !== 'object') {
    throw new TypeError(`${where}: opts must be an object, got ${typeof opts}`);
  }
  if (opts.externalMu !== undefined) {
    throw new RangeError(`${where}: externalMu is not supported by this implementation`);
  }
  const ctx = opts.context === undefined ? new Uint8Array(0) : opts.context;
  if (!isU8(ctx)) {
    throw new TypeError(`${where}: context must be a Uint8Array, got ${typeof ctx}`);
  }
  if (ctx.length > 255) {
    throw new RangeError(`${where}: context must be at most 255 bytes, got ${ctx.length}`);
  }

  // Hedged vs deterministic. `null` means rnd = 0^32 inside core sign().
  let rnd = null;
  const ee = opts.extraEntropy;
  if (ee === true) {
    rnd = randomBytes(32);
  } else if (ee instanceof Uint8Array) {
    if (ee.length !== 32) {
      throw new RangeError(`${where}: extraEntropy must be 32 bytes, got ${ee.length}`);
    }
    rnd = ee;
  } else if (ee !== undefined && ee !== false) {
    throw new TypeError(`${where}: extraEntropy must be a boolean or a 32-byte Uint8Array`);
  }
  return { ctx, rnd };
}

function createAPI(paramSet) {
  const params = MLDSA_PARAMS[paramSet];
  if (!params) throw new Error(`unknown parameter set: ${paramSet}`);

  return {
    name: paramSet,
    params,

    keygen(seed) {
      if (seed !== undefined && (!isU8(seed) || seed.length !== 32)) {
        const got = isU8(seed) ? `${seed.length} bytes` : typeof seed;
        throw new TypeError(`keygen: seed must be a 32-byte Uint8Array when provided, got ${got}`);
      }
      const { pk, sk } = coreKeygen(paramSet, seed);
      return {
        publicKey: encodePK(pk, paramSet),
        secretKey: encodeSK(sk, paramSet),
      };
    },

    sign(msg, secretKey, opts) {
      if (!isU8(msg)) {
        throw new TypeError(`sign: message must be a Uint8Array, got ${typeof msg}`);
      }
      if (!isU8(secretKey)) {
        throw new TypeError(`sign: secretKey must be a Uint8Array, got ${typeof secretKey}`);
      }
      const { ctx, rnd } = parseOpts(opts, 'sign');
      // decodeSK() rejects any length other than the exact one for this parameter set.
      const sk = decodeSK(secretKey, paramSet);
      return encodeSig(coreSign(sk, msg, ctx, paramSet, rnd), paramSet);
    },

    verify(signature, msg, publicKey, opts) {
      // Malformed *inputs* are a false verdict, not an exception: callers routinely
      // pass attacker-controlled bytes here. Malformed *options* are a programming
      // error and do throw (via parseOpts).
      if (!isU8(signature) || !isU8(msg) || !isU8(publicKey)) return false;
      const { ctx } = parseOpts(opts, 'verify');
      return coreVerify(publicKey, msg, signature, ctx, paramSet);
    },
  };
}

export const ml_dsa44 = createAPI('ML-DSA-44');
export const ml_dsa65 = createAPI('ML-DSA-65');
export const ml_dsa87 = createAPI('ML-DSA-87');

export default { ml_dsa44, ml_dsa65, ml_dsa87 };
