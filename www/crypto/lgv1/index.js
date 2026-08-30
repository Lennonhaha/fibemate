/**
 * LookingGlass — Depth-Multiplicative Trapdoor Hardness (DMTH) Framework
 * 
 * Integrated into FIBEMATE as an experimental research module.
 * Controlled by ENABLE_LOOKINGGLASS environment flag (default: false).
 * 
 * SECURITY MODEL (v2, 2026-06-26):
 *   The public key is a standard LWE instance. Attack complexity is bounded
 *   by standard LWE hardness (~n × log₂(q/σ) bits), NOT multiplied by depth.
 *   
 *   DMTH (Depth-Multiplicative Trapdoor Hardness) describes the trapdoor
 *   engineering sophistication: depth layers create structural obfuscation
 *   that an attacker must reverse-engineer even after recovering the LWE
 *   secret. This is a new class of "structural security" — not hardness
 *   amplification, but trapdoor concealment.
 * 
 * Exports:
 *   createLookingGlass(config) — instantiate with { n, depth, sigma, q }
 *   createTrapdoorSystem(config) — full trapdoor keygen/encrypt/decrypt
 */

'use strict';

const { TensorOps } = require('./core/tensor-ops');
const { MirrorLayer } = require('./core/mirror-layer');
const { InfiniteMirror } = require('./core/infinite-mirror');
const { TrapdoorGenerator } = require('./trapdoor/trapdoor-generator');

/**
 * Create a LookingGlass multi-layer mirror instance.
 * 
 * @param {Object} config
 * @param {number} config.n        - base dimension (default 8)
 * @param {number} config.depth    - number of layers (default 2)
 * @param {number} config.sigma    - Gaussian width (default 3)
 * @param {number} config.q        - modulus (default 3329)
 * @returns {InfiniteMirror}
 */
function createLookingGlass(config = {}) {
  const { n = 8, depth = 2, sigma = 3, q = 3329 } = config;
  return new InfiniteMirror({ n, depth, sigma, q });
}

/**
 * Create a full trapdoor encryption/decryption system.
 * 
 * @param {Object} config
 * @returns {{ keygen, encrypt, decrypt }}
 */
function createTrapdoorSystem(config = {}) {
  const { n = 8, depth = 2, sigma = 3, q = 3329 } = config;
  const trapdoor = new TrapdoorGenerator({ n, depth, sigma, q });
  return {
    keygen: () => trapdoor.generate(),
    encrypt: (pk, msg) => {
      // Encrypt: compute b = As + e, add message as MSB
      const m = pk.A.length;
      const e = Array.from({ length: m }, () =>
        TensorOps.mod(BigInt(Math.floor(TensorOps.gaussian(sigma) * 3)))
      );
      const msgPadded = msg.slice();
      // Scale message into high bits (q/2 encoding)
      const qHalf = BigInt(Math.floor(Number(q) / 2));
      const ct = pk.b.map((bv, i) =>
        TensorOps.mod(bv + e[i] + (msgPadded[i] ? qHalf : 0n))
      );
      return ct;
    },
    decrypt: (sk, ct) => trapdoor.decaps(ct, sk)
  };
}

/**
 * DMTH Trapdoor security estimation (CORRECTED 2026-06-26).
 * 
 * CRITICAL: This is TRAPDOOR complexity, NOT attack complexity.
 * The attacker sees a standard LWE instance with security ≈ n × log₂(q/σ).
 * The depth factor applies ONLY to trapdoor reverse-engineering difficulty,
 * not to computational hardness.
 * 
 * @param {number} n     - base LWE dimension
 * @param {number} depth - trapdoor nesting depth
 * @param {number} q     - modulus
 * @returns {number} DMTH trapdoor complexity estimate (bits)
 */
function estimateDMHSecurity(n, depth, q = 3329) {
  // NOTE: Renamed concept — this is DMTH, not DMH.
  // Retaining function name for backward compatibility.
  return depth * n * Math.log2(q) / 2;
}

/**
 * Standard LWE security estimate for the attacker's view.
 * The public key (A,b) is a standard LWE instance.
 * This is the actual computational security bound.
 * 
 * @param {number} n   - secret dimension
 * @param {number} q   - modulus
 * @param {number} sigma - noise width
 * @returns {number} Security in bits
 */
function estimateLWEAttackComplexity(n, q = 3329, sigma = 3) {
  // Conservative: ~n * log₂(q/σ) bits
  // BKZ with block size β needs to satisfy: β · n ≥ n²·log₂(q/σ)
  return n * Math.log2(q / sigma);
}

// Re-export core classes for direct usage
module.exports = {
  TensorOps,
  MirrorLayer,
  InfiniteMirror,
  TrapdoorGenerator,
  createLookingGlass,
  createTrapdoorSystem,
  estimateDMHSecurity,        // DMTH trapdoor complexity (legacy name)
  estimateLWEAttackComplexity  // Actual attack security bound
};
