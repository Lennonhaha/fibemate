/**
 * LookingGlass: Trapdoor Generator
 * Full key generation, encryption, and decryption using the multi-layer
 * mirror architecture.
 */

const { TensorOps } = require('../core/tensor-ops');
const { InfiniteMirror } = require('../core/infinite-mirror');

class TrapdoorGenerator {
  /**
   * @param {Object} config
   * @param {number} config.n - base LWE dimension
   * @param {bigint} config.q - modulus
   * @param {number} config.sigma - Gaussian width
   * @param {number} config.depth - mirror nesting depth
   * @param {number} config.k - tensor expansion factor (default 2)
   */
  constructor(config) {
    this.n = config.n;
    this.q = config.q || TensorOps.MOD;
    this.sigma = config.sigma || 1.0;
    this.depth = config.depth;
    this.k = config.k || 2;
    this.mirror = new InfiniteMirror({
      depth: this.depth,
      n: this.n,
      q: this.q,
      sigma: this.sigma,
    });
  }

  /**
   * Generate a complete key pair.
   *
   * Public key: (A, b) where b = A·s + e (LWE sample)
   * Private key: (s, R) where R is the trapdoor matrix
   * Tensor key: A_tensor (Kronecker-expanded public matrix)
   */
  generate() {
    // 1. Sample secret s (short vector)
    const s = Array.from({ length: this.n }, () =>
      TensorOps.mod(BigInt(Math.floor(TensorOps.gaussian(this.sigma) * 3)))
    );

    // 2. Generate public matrix A (m × n) where m = n * k
    const m = this.n * this.k;
    const A = TensorOps.randomTensor([m, this.n], this.q);

    // 3. Generate noise vector e
    const e = Array.from({ length: m }, () =>
      TensorOps.mod(BigInt(Math.floor(TensorOps.gaussian(this.sigma) * 3)))
    );

    // 4. Compute b = A·s + e (LWE sample)
    const As = TensorOps.matMul(A, s.map(v => [v])).map(r => r[0]);
    const b = As.map((v, i) => TensorOps.mod(v + e[i]));

    // 5. Generate multi-layer trapdoor from A
    // In a real scheme, the trapdoor R is the product of individual layer matrices
    const trapdoor = this.mirror.generateMultiLayerTrapdoor(A);

    // 6. Tensor-expanded public key (Kronecker product with random R)
    // Using random R (not I₂) to avoid 50%-zero structural artifact
    const R = TensorOps.randomTensor([this.k, this.k], this.q);
    const A_tensor = TensorOps.kron(A, R);

    // 7. Security assessment
    const complexity = this.mirror.getAttackComplexity();
    const bitsPerLayer = this.n * Math.log2(Number(this.q)) / 2;
    const totalSecurity = (bitsPerLayer * (this.depth + 1)).toFixed(1);

    return {
      publicKey: { A, b },
      privateKey: { s, R: trapdoor.trapdoorStack, trapdoorStack: trapdoor.trapdoorStack },
      tensorKey: { A_tensor, depth: this.depth + 1 },
      securityReport: {
        complexity,
        baseLWE: bitsPerLayer.toFixed(1),
        totalSecurity,
        depth: this.depth,
      },
    };
  }

  /**
   * Decrypt/decapsulate using the trapdoor.
   * Uses the mirror stack to peel layers.
   */
  decaps(ciphertext, privateKey) {
    const trapdoor = {
      trapdoorStack: privateKey.trapdoorStack || privateKey.R,
    };
    return this.mirror.decryptWithTrapdoor(trapdoor, ciphertext);
  }
}

module.exports = { TrapdoorGenerator };
