/**
 * LookingGlass: Mirror Layer
 * One layer of the infinite mirror stack — a single "view" into the tensor trapdoor
 */

const { TensorOps } = require('./tensor-ops');

class MirrorLayer {
  /**
   * @param {Object} config
   * @param {number} config.n - base dimension
   * @param {number} config.layerIndex - 0-based depth index
   * @param {bigint} config.q - modulus
   * @param {number} config.sigma - Gaussian width
   */
  constructor(config) {
    this.n = config.n * (config.layerIndex + 1); // dimension grows with depth
    this.layerIndex = config.layerIndex;
    this.q = config.q || TensorOps.MOD;
    this.sigma = config.sigma || 1.0;
    this.view = null;     // public "mirror" matrix A_i
    this.s = null;        // secret vector
    this.A_mirrored = null; // mirrored (Kronecker-transformed) public key
  }

  /**
   * Generate this layer's trapdoor view:
   *   A_view = kron(view_i, I) + ∆A
   * where view_i is a random matrix and ∆A encodes the secret.
   */
  generate(baseA) {
    const m = baseA.length;
    const n = baseA[0].length;

    // Generate the secret short vector s for this layer
    this.s = Array.from({ length: n }, () =>
      TensorOps.mod(BigInt(Math.floor(TensorOps.gaussian(this.sigma) * 3)))
    );

    // The public view is a random (m × n) matrix
    this.view = TensorOps.randomTensor([m, n], this.q);

    // The "mirrored" version: Kronecker product with RANDOM full-rank matrix
    // A_mirrored = kron(view, R), doubling dimensions
    // Using random R (not I₂) to avoid the 50%-zero structural artifact
    const k = 2; // expansion factor
    const R = TensorOps.randomTensor([k, k], this.q);
    this.A_mirrored = TensorOps.kron(this.view, R);

    // Scale up to match final dimension
    const outRows = this.A_mirrored.length;
    const outCols = this.A_mirrored[0].length;

    return {
      view: this.view,
      s: this.s,
      A_mirrored: this.A_mirrored,
      dimensions: { m: outRows, n: outCols },
      layerIndex: this.layerIndex,
    };
  }
}

module.exports = { MirrorLayer };
