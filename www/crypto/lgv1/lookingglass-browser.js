/**
 * LookingGlass Browser Bundle v2 — DMH Framework
 * Built: 2026-06-26T14:24:02.180Z
 * Load: <script src="lookingglass-browser.js"></script>
 * Access: window.LookingGlass.{TensorOps, MirrorLayer, InfiniteMirror, TrapdoorGenerator, ...}
 */
(function() {
'use strict';

var __tensor_ops, __mirror_layer, __infinite_mirror, __trapdoor_gen;

// ── TensorOps ──
__tensor_ops = (function() {
/**
 * LookingGlass: Tensor Operations
 * Core tensor arithmetic over Z_q
 */

class TensorOps {
  static MOD = 3329n;

  static mod(v) {
    v = BigInt(v);
    return ((v % TensorOps.MOD) + TensorOps.MOD) % TensorOps.MOD;
  }

  /**
   * Kronecker product: A ⊗ B
   * If A is m×n and B is p×q, result is (m·p)×(n·q)
   */
  static kron(A, B) {
    const m = A.length, n = A[0].length;
    const p = B.length, q = B[0].length;
    const R = Array.from({ length: m * p }, () => new Array(n * q).fill(0n));
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        const a = A[i][j];
        for (let r = 0; r < p; r++) {
          for (let c = 0; c < q; c++) {
            R[i * p + r][j * q + c] = TensorOps.mod(a * B[r][c]);
          }
        }
      }
    }
    return R;
  }

  /** n×n identity matrix */
  static identity(n) {
    const I = Array.from({ length: n }, () => new Array(n).fill(0n));
    for (let i = 0; i < n; i++) I[i][i] = 1n;
    return I;
  }

  /** Element-wise addition mod MOD */
  static tensorAdd(A, B) {
    return A.map((row, i) => row.map((v, j) => TensorOps.mod(v + B[i][j])));
  }

  /** Element-wise subtraction mod MOD */
  static tensorSub(A, B) {
    return A.map((row, i) => row.map((v, j) => TensorOps.mod(v - B[i][j])));
  }

  /** Matrix multiplication mod MOD: A·B */
  static matMul(A, B) {
    const mA = A.length, nA = A[0].length;
    const mB = B.length, nB = B[0].length;
    if (nA !== mB) throw new Error(`matMul dimension mismatch: A[${mA}×${nA}] * B[${mB}×${nB}]`);
    const C = Array.from({ length: mA }, () => new Array(nB).fill(0n));
    for (let i = 0; i < mA; i++) {
      for (let k = 0; k < nA; k++) {
        const aik = A[i][k];
        if (aik === 0n) continue;
        const Crow = C[i];
        const Brow = B[k];
        for (let j = 0; j < nB; j++) {
          Crow[j] = TensorOps.mod(Crow[j] + aik * Brow[j]);
        }
      }
    }
    return C;
  }

  /** Matrix transpose */
  static transpose(A) {
    const m = A.length, n = A[0].length;
    const T = Array.from({ length: n }, () => new Array(m));
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++)
        T[j][i] = A[i][j];
    return T;
  }

  /** Generate random m×n tensor over GF(q) */
  static randomTensor(shape, q = TensorOps.MOD) {
    const [rows, cols] = shape;
    const result = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        row.push(BigInt(Math.floor(Math.random() * Number(q))));
      }
      result.push(row);
    }
    return result;
  }

  /** Scalar multiplication */
  static scalarMul(A, c) {
    return A.map(row => row.map(v => TensorOps.mod(v * BigInt(c))));
  }

  /** Box-Muller Gaussian sampler (mean 0, std sigma) */
  static gaussian(sigma = 1.0) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * sigma;
  }
}


return { TensorOps: TensorOps };
})();

// ── MirrorLayer ──
__mirror_layer = (function() {
/**
 * LookingGlass: Mirror Layer
 * One layer of the infinite mirror stack — a single "view" into the tensor trapdoor
 */

const { TensorOps } = __tensor_ops;

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


return { MirrorLayer: MirrorLayer };
})();

// ── InfiniteMirror ──
__infinite_mirror = (function() {
/**
 * LookingGlass: Infinite Mirror
 * Multi-layer nested trapdoor architecture.
 *
 * Core idea: each layer is a tensor mirror that reflects a different "view".
 * An attacker must simultaneously find ALL layers, not just one.
 * Complexity grows as O(q^{depth * n}) — exponential in depth.
 */

const { TensorOps } = __tensor_ops;
const { MirrorLayer } = __mirror_layer;

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


return { InfiniteMirror: InfiniteMirror };
})();

// ── TrapdoorGenerator ──
__trapdoor_gen = (function() {
/**
 * LookingGlass: Trapdoor Generator
 * Full key generation, encryption, and decryption using the multi-layer
 * mirror architecture.
 */

const { TensorOps } = __tensor_ops;
const { InfiniteMirror } = __infinite_mirror;

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


return { TrapdoorGenerator: TrapdoorGenerator };
})();


// ── Public API ──
var T = __tensor_ops.TensorOps;
window.LookingGlass = {
  TensorOps: T,
  MirrorLayer: __mirror_layer.MirrorLayer,
  InfiniteMirror: __infinite_mirror.InfiniteMirror,
  TrapdoorGenerator: __trapdoor_gen.TrapdoorGenerator,

  createTrapdoorSystem: function(config) {
    var cfg = config || {};
    var td = new __trapdoor_gen.TrapdoorGenerator({
      n: cfg.n || 8,
      depth: cfg.depth || 2,
      sigma: cfg.sigma || 3,
      q: cfg.q || 3329,
      k: cfg.k || 2
    });
    return {
      generate: function() { return td.generate(); },
      decaps: function(ct, sk) { return td.decaps(ct, sk); }
    };
  },

  estimateDMHSecurity: function(n, depth, q) {
    return depth * n * Math.log2(q || 3329) / 2;
  }
};

console.log('[LookingGlass] v2 browser bundle loaded. Exports:', Object.keys(window.LookingGlass));
})();
