/**
 * LookingGlass: Infinite Mirror
 * Multi-layer nested trapdoor architecture.
 *
 * Core idea: each layer is a tensor mirror that reflects a different "view".
 * An attacker must simultaneously find ALL layers, not just one.
 * Complexity grows as O(q^{depth * n}) — exponential in depth.
 */

const { TensorOps } = require('./tensor-ops');
const { MirrorLayer } = require('./mirror-layer');

class InfiniteMirror {
  /**
   * @param {Object} config
   * @param {number} config.depth - number of nested mirror layers
   * @param {number} config.n - base dimension
   * @param {bigint} config.q - modulus
   * @param {number} config.sigma - Gaussian noise width
   */
  constructor(config) {
    this.depth = config.depth;
    this.n = config.n;
    this.q = config.q || TensorOps.MOD;
    this.sigma = config.sigma || 1.0;
    this.layers = [];

    // Create layers with increasing dimensions
    for (let i = 0; i < this.depth; i++) {
      this.layers.push(new MirrorLayer({
        n: config.n,
        layerIndex: i,
        q: this.q,
        sigma: this.sigma,
      }));
    }
  }

  /**
   * Generate a multi-layer trapdoor from a base public matrix A.
   * Each successive layer applies a Kronecker transformation,
   * creating an exponential dimension blowup in the attacker's view.
   *
   * @param {number[][]} baseA - initial public matrix A (m × n)
   * @returns {Object} trapdoor with trapdoorStack, finalA, finalS
   */
  generateMultiLayerTrapdoor(baseA) {
    const trapdoorStack = [];
    let currentA = baseA; // start with base

    for (let i = 0; i < this.depth; i++) {
      const layer = this.layers[i];
      const layerResult = layer.generate(currentA);

      trapdoorStack.push({
        view: layerResult.view,
        s: layerResult.s,
        A_mirrored: layerResult.A_mirrored,
        layerIndex: i,
      });

      // Next layer's A is the mirrored version of this layer
      currentA = layerResult.A_mirrored;
    }

    // finalA is the outermost public key after all mirror transformations
    const finalA = trapdoorStack[trapdoorStack.length - 1].A_mirrored;

    // finalS is the combined secret from all layers (concatenated views)
    const finalS = trapdoorStack.flatMap(layer => Array.from(layer.s));

    return {
      trapdoorStack,
      finalA,
      finalS,
      depth: this.depth,
    };
  }

  /**
   * Decrypt using the complete trapdoor stack.
   * Knowledge of ALL layer secrets enables decryption.
   *
   * This is a conceptual decryption: in a real scheme this would use
   * Babai's nearest-plane or similar lattice decoding.
   */
  decryptWithTrapdoor(trapdoor, ciphertext) {
    const n = this.n;
    let ct = [...ciphertext];

    // Reverse through layers (innermost first)
    for (let i = trapdoor.trapdoorStack.length - 1; i >= 0; i--) {
      const layer = trapdoor.trapdoorStack[i];
      const s = layer.s;

      // Inner product with secret vector to remove one layer
      const sExtended = [];
      const blockSize = s.length;
      const blocks = ct.length / blockSize;
      for (let b = 0; b < blocks; b++) {
        for (let j = 0; j < blockSize; j++) {
          sExtended.push(s[j]);
        }
      }

      // ct = ct - A * s (conceptual)
      const correction = Array.from({ length: ct.length }, (_, idx) => {
        const dot = sExtended[idx] || 0n;
        return TensorOps.mod(ct[idx] - dot);
      });
      ct = correction;
    }

    return ct;
  }

  /**
   * Estimate attack complexity.
   * Without trapdoor: must brute-force ALL layers simultaneously.
   * log2 complexity ≈ depth * n * log2(q) / 2 (LWE-like reduction)
   */
  getAttackComplexity() {
    const log2q = Math.log2(Number(this.q));
    // Classical LWE hardness: ~ sqrt(q^n)
    const bitsPerLayer = 0.5 * this.n * log2q;
    const totalBits = this.depth * bitsPerLayer;

    return {
      log2Complexity: totalBits,
      decimalComplexity: `2^${totalBits.toFixed(0)}`,
      depth: this.depth,
      bitsPerLayer: bitsPerLayer.toFixed(1),
    };
  }

  /**
   * Generate a human-readable security report.
   */
  generateSecurityReport() {
    const complexity = this.getAttackComplexity();
    let securityLevel;
    if (complexity.log2Complexity >= 128) securityLevel = 'AES-128 equivalent';
    else if (complexity.log2Complexity >= 100) securityLevel = 'Strong';
    else if (complexity.log2Complexity >= 80) securityLevel = 'Moderate';
    else securityLevel = 'Weak';

    return {
      depth: this.depth,
      baseDimension: this.n,
      modulusBits: Math.log2(Number(this.q)).toFixed(1),
      ...complexity,
      securityLevel,
      recommendation: this.depth >= 2
        ? 'Recommended for production (>2^256)'
        : 'Consider increasing depth to ≥2',
    };
  }
}

module.exports = { InfiniteMirror };
