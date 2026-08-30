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

module.exports = { TensorOps };
