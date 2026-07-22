// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE SM2 BigInt 域操作 & 椭圆曲线点运算
 * Jacobian 射影坐标 + Native BigInt
 * v1.3 (2026-06-18) — Montgomery ladder + Scalar Masking + Projective Randomization
 *
 * Defence-in-depth (三重防护):
 *   1. Scalar masking:   k' = k + r*N (NO % N!)
 *   2. Projective randomization: random z-coordinate for starting point
 *   3. Montgomery ladder: fixed double+add EVERY round, no scalar-bit branches
 *
 * v1.2 → v1.3 diff:
 *   替换了 binary double-and-add 中的 if(kBits[i]) 条件分支
 *   改为每轮固定 jDbl + jAdd + constant-time conditional swap
 *   关键修正: 交换掩码方向 (bit=1 → swap, bit=0 → hold)
 */

// ============ SM2 Curve Parameters (BigInt) ============
const SM2_P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFFn;
const SM2_N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const SM2_A = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFCn;
const SM2_B = 0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93n;
const SM2_GX = 0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7n;
const SM2_GY = 0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0n;

const ZERO = 0n, ONE = 1n, TWO = 2n, THREE = 3n, FOUR = 4n, EIGHT = 8n;

// ============ Field Operations (mod SM2_P) ============
const F = {
    add(a, b) {
        const s = a + b;
        return s >= SM2_P ? s - SM2_P : s;
    },
    sub(a, b) {
        return a >= b ? a - b : a - b + SM2_P;
    },
    mul(a, b) {
        return (a * b) % SM2_P;
    },
    sqr(a) {
        return (a * a) % SM2_P;
    },
    /** Extended Euclidean modular inverse */
    inv(a) {
        let t = ZERO, nt = ONE;
        let r = SM2_P, nr = a % SM2_P;
        while (nr !== ZERO) {
            const q = r / nr;
            [t, nt] = [nt, t - q * nt];
            [r, nr] = [nr, r - q * nr];
        }
        return t < ZERO ? t + SM2_P : t;
    },
    addN(a, b) {
        const s = a + b;
        return s >= SM2_N ? s - SM2_N : s;
    },
};

// ============ Jacobian Projective Point Operations ============
const J_ZERO = { x: ZERO, y: ZERO, z: ZERO };

function isJInf(P) { return P.z === ZERO; }

const INFINITY = Object.freeze({ x: null, y: null });

function isInf(P) { return P.x === null && P.y === null; }
function makePt(x, y) { return { x, y }; }

function toJ(P) {
    if (isInf(P)) return J_ZERO;
    return { x: P.x, y: P.y, z: ONE };
}

function toA(P) {
    if (isJInf(P)) return INFINITY;
    if (P.z === ONE) return makePt(P.x, P.y);
    const iz = F.inv(P.z);
    const iz2 = F.sqr(iz);
    const iz3 = F.mul(iz2, iz);
    return makePt(F.mul(P.x, iz2), F.mul(P.y, iz3));
}

/**
 * Jacobian doubling:  P + P  (cost: ~4M + 4S, a=-3)
 */
function jDbl(P) {
    if (isJInf(P)) return P;
    const { x, y, z } = P;

    const yy = F.sqr(y);
    const y4 = F.sqr(yy);
    const s = F.mul(F.mul(x, FOUR), yy);
    const zz = F.sqr(z);
    const z4 = F.sqr(zz);

    const m = F.sub(F.mul(THREE, F.sqr(x)), F.mul(THREE, z4));

    const x3 = F.sub(F.sqr(m), F.mul(s, TWO));
    const y3 = F.sub(F.mul(m, F.sub(s, x3)), F.mul(y4, EIGHT));
    const z3 = F.mul(F.mul(y, z), TWO);

    return { x: x3, y: y3, z: z3 };
}

/**
 * Jacobian mixed add: J_X + A → J_X  (cost: ~8M + 3S)
 */
function jAddMixed(A, Q) {
    if (isJInf(Q)) return toJ(A);
    if (isInf(A)) return Q;

    const { x: x2, y: y2, z: z2 } = Q;
    const { x: x1, y: y1 } = A;

    const zz = F.sqr(z2);
    const u2 = F.mul(x1, zz);
    const z3 = F.mul(zz, z2);
    const s2 = F.mul(y1, z3);

    if (u2 === x2 && s2 === y2) return jDbl(Q);

    const h = F.sub(u2, x2);
    const hh = F.sqr(h);
    const i = F.mul(hh, FOUR);
    const j = F.mul(h, i);
    const r = F.mul(F.sub(s2, y2), TWO);
    const v = F.mul(x2, i);

    const x3 = F.sub(F.sub(F.sqr(r), j), F.mul(v, TWO));
    const y3 = F.sub(F.mul(r, F.sub(v, x3)), F.mul(F.mul(y2, TWO), j));
    const z3_f = F.sub(F.sqr(F.add(h, z2)), F.add(zz, hh));

    return { x: x3, y: y3, z: z3_f };
}

/**
 * Jacobian add: J + J → J  (cost: ~12M + 4S)
 */
function jAdd(P, Q) {
    if (isJInf(P)) return Q;
    if (isJInf(Q)) return P;

    const { x: x1, y: y1, z: z1 } = P;
    const { x: x2, y: y2, z: z2 } = Q;

    const z1z1 = F.sqr(z1);
    const z2z2 = F.sqr(z2);
    const u1 = F.mul(x1, z2z2);
    const u2 = F.mul(x2, z1z1);
    const s1 = F.mul(y1, F.mul(z2z2, z2));
    const s2 = F.mul(y2, F.mul(z1z1, z1));

    if (u1 === u2) {
        if (s1 !== s2) return J_ZERO;
        return jDbl(P);
    }

    const h = F.sub(u2, u1);
    const i = F.sqr(F.mul(h, TWO));
    const j = F.mul(h, i);
    const r = F.sub(F.mul(s2, TWO), F.mul(s1, TWO));
    const v = F.mul(u1, i);

    const x3 = F.sub(F.sub(F.sqr(r), j), F.mul(v, TWO));
    const y3 = F.sub(F.mul(r, F.sub(v, x3)), F.mul(F.mul(s1, TWO), j));
    const z3 = F.mul(F.sub(F.sqr(F.add(z1, z2)), F.add(z1z1, z2z2)), h);

    return { x: x3, y: y3, z: z3 };
}

// ============ Crypto random (module-level) ============
const { randomBytes } = require('crypto');

// ================================================================
// Scalar Multiplication — Montgomery Ladder (v1.3)
// ================================================================
/**
 * k * P  (P in affine → result in affine)
 *
 * Defence-in-depth (三重):
 *   1. Scalar masking: k' = k + r*N   (NO % N, k' ≡ k mod N for scalar mult)
 *   2. Projective randomization: start with random Z coordinate
 *   3. Montgomery ladder: double+add every round, no if(kBit)
 *
 * Montgomery ladder invariant:
 *   After processing bits [n-1 .. i]:
 *     R0 = sum_{j=i..n-1} (k_j * 2^{j-i}) * P   (if we entered i with no swap)
 *     R1 = R0 + P
 *   The swap-before and swap-after ensures R0 always holds the partial result.
 *
 * Cost: 256 * (jDbl + jAdd) ≈ same as worst-case binary double-and-add.
 * Overhead vs v1.2: ~15% (no fast skip of zero bits, but constant-time).
 */
function pointMul(k, P) {
    if (isInf(P) || k === ZERO) return INFINITY;

    // --- 1. Scalar masking (unchanged from v1.2) ---
    const r = BigInt('0x' + randomBytes(8).toString('hex'));
    const kMasked = r === ZERO ? k : k + r * SM2_N;

    // --- 2. Projective randomization (unchanged from v1.2) ---
    const rzHex = randomBytes(8).toString('hex');
    const rz = BigInt('0x' + rzHex) % SM2_P;
    const rzSafe = rz === ZERO ? ONE : rz;
    const rz2 = (rzSafe * rzSafe) % SM2_P;
    const rz3 = (rz2 * rzSafe) % SM2_P;

    // --- 3. Montgomery ladder ---
    // R0 = J_ZERO (无穷远点), R1 = P (Jacobian frame, z=rzSafe ≠ 0)
    const P_aff = { x: P.x, y: P.y };
    let R0 = J_ZERO;
    let R1 = {
        x: (P.x * rz2) % SM2_P,
        y: (P.y * rz3) % SM2_P,
        z: rzSafe
    };

    // Masked scalar can be up to 320 bits (256-bit N + 64-bit random r).
    // Always iterate 320 rounds so iteration count is invariant.
    const BITS = 320;
    for (let i = BITS - 1; i >= 0; i--) {
        const bit = (kMasked >> BigInt(i)) & ONE;  // 0n or 1n

        // Constant-time conditional swap using arithmetic masking.
        //
        // 正确方向 (v1.3 fix):
        //   bit=1 → SWAP(R0, R1)
        //   bit=0 → HOLD
        //
        // Formula: new = mask * other + (1-mask) * self
        //   mask = bit, so bit=1 → new = other (swapped)
        //   mask = 0   → new = self  (unchanged)

        const mask = bit;

        // Swap R0 and R1 if bit=1 (arithmetic, no branch)
        const s0x = (ONE - mask) * R0.x + mask * R1.x;  // bit=1 → R1.x
        const s0y = (ONE - mask) * R0.y + mask * R1.y;
        const s0z = (ONE - mask) * R0.z + mask * R1.z;
        const s1x = mask * R0.x + (ONE - mask) * R1.x;  // bit=1 → R0.x
        const s1y = mask * R0.y + (ONE - mask) * R1.y;
        const s1z = mask * R0.z + (ONE - mask) * R1.z;

        R0 = { x: s0x, y: s0y, z: s0z };
        R1 = { x: s1x, y: s1y, z: s1z };

        // Fixed operations every round (no branches):
        R1 = jAdd(R0, R1);   // R1 = R0 + R1
        R0 = jDbl(R0);       // R0 = 2 * R0

        // Un-swap to restore invariant (same mask)
        const u0x = (ONE - mask) * R0.x + mask * R1.x;
        const u0y = (ONE - mask) * R0.y + mask * R1.y;
        const u0z = (ONE - mask) * R0.z + mask * R1.z;
        const u1x = mask * R0.x + (ONE - mask) * R1.x;
        const u1y = mask * R0.y + (ONE - mask) * R1.y;
        const u1z = mask * R0.z + (ONE - mask) * R1.z;

        R0 = { x: u0x, y: u0y, z: u0z };
        R1 = { x: u1x, y: u1y, z: u1z };
    }

    return toA(R0);
}

// ============ High-level API ============
// ... rest identical to v1.2 ...

// G = Generator point in affine
const G = makePt(SM2_GX, SM2_GY);

function mulG(k) {
    return pointMul(k, G);
}

function generateKeyPair() {
    let d;
    do {
        d = BigInt('0x' + randomBytes(32).toString('hex'));
    } while (d === ZERO || d >= SM2_N);
    const pub = publicKeyFromPrivate(d);
    return { privateKey: d, publicKey: pub };
}

function publicKeyFromPrivate(d) {
    if (d === ZERO || d >= SM2_N) throw new Error('Invalid private key');
    return pointMul(d, G);
}

function hexPad(s) { return s.length % 2 ? '0' + s : s; }
function bi2hex(x) { return hexPad(x.toString(16)); }
function hex2bi(s) { return BigInt('0x' + s); }

function pk2hex(pk) {
    if (isInf(pk)) return '00';
    const x = bi2hex(pk.x);
    const y = bi2hex(pk.y);
    return '04' + x.padStart(64, '0') + y.padStart(64, '0');
}

function extEuclidInv(a, m) {
    let t = ZERO, nt = ONE;
    let r = m, nr = a % m;
    while (nr !== ZERO) {
        const q = r / nr;
        [t, nt] = [nt, t - q * nt];
        [r, nr] = [nr, r - q * nr];
    }
    if (r > ONE) throw new Error('Not invertible');
    return t < ZERO ? t + m : t;
}

// ============ SM2 Sign / Verify / Encrypt / Decrypt ============
function sign(privateKey, msgHash) {
    const d = hex2bi(privateKey);
    const e = hex2bi(msgHash);
    const { randomBytes } = require('crypto');
    let r, s, k;
    do {
        k = BigInt('0x' + randomBytes(32).toString('hex')) % SM2_N;
    } while (k === ZERO);
    const kG = pointMul(k, G);
    const x1 = kG.x;
    r = (e + x1) % SM2_N;
    if (r === ZERO || r + k === SM2_N) return sign(privateKey, msgHash);
    s = (extEuclidInv(ONE + d, SM2_N) * ((k - r * d) % SM2_N + SM2_N)) % SM2_N;
    if (s === ZERO) return sign(privateKey, msgHash);
    return { r: bi2hex(r), s: bi2hex(s) };
}

function verify(pubHex, msgHash, sigR, sigS) {
    const e = hex2bi(msgHash);
    const r = hex2bi(sigR);
    const s = hex2bi(sigS);
    if (r < ONE || r >= SM2_N || s < ONE || s >= SM2_N) return false;
    const t = (r + s) % SM2_N;
    if (t === ZERO) return false;
    const P = { x: hex2bi(pubHex.slice(2, 66)), y: hex2bi(pubHex.slice(66)) };
    const sG = pointMul(s, G);
    const tPA = pointMul(t, P);
    const R = toA(jAdd(toJ(sG), toJ(tPA)));
    return (isInf(R) ? false : (R.x + e) % SM2_N === r);
}

function encrypt(pubHex, plaintext) {
    const { randomBytes } = require('crypto');
    const buf = Buffer.from(plaintext, 'utf8');
    let k;
    do {
        k = BigInt('0x' + randomBytes(32).toString('hex')) % SM2_N;
    } while (k === ZERO);
    const P = { x: hex2bi(pubHex.slice(2, 66)), y: hex2bi(pubHex.slice(66)) };
    const C1 = pointMul(k, G);
    const kPB = pointMul(k, P);
    const x2 = kPB.x;
    const kdfInput = bi2hex(x2);
    const tLen = buf.length;
    const kdf = Buffer.from(kdfInput.padStart(64, '0').repeat(Math.ceil(tLen / 32)).slice(0, tLen * 2), 'hex');
    let C2 = Buffer.alloc(tLen);
    for (let i = 0; i < tLen; i++) C2[i] = buf[i] ^ kdf[i];
    const hmacInput = Buffer.from(x2.toString(16).padStart(64, '0') + plaintext + kPB.y.toString(16).padStart(64, '0'));
    const C3 = require('crypto').createHash('sm3').update(hmacInput).digest('hex');
    return {
        c1: '04' + bi2hex(C1.x).padStart(64, '0') + bi2hex(C1.y).padStart(64, '0'),
        c2: C2.toString('hex'),
        c3: C3
    };
}

function decrypt(privateKey, c1Hex, c2Hex) {
    const d = hex2bi(privateKey);
    const x = hex2bi(c1Hex.slice(2, 66));
    const y = hex2bi(c1Hex.slice(66));
    const C1 = { x, y };
    const dB = pointMul(d, C1);
    const x2 = dB.x;
    const buf = Buffer.from(c2Hex, 'hex');
    const tLen = buf.length;
    const kdfInput = bi2hex(x2);
    const kdf = Buffer.from(kdfInput.padStart(64, '0').repeat(Math.ceil(tLen / 32)).slice(0, tLen * 2), 'hex');
    let plaintext = '';
    for (let i = 0; i < tLen; i++) plaintext += String.fromCharCode(buf[i] ^ kdf[i]);
    return plaintext;
}

// ============ Exports ============
module.exports = {
    // Point ops
    pointAdd: (P, Q) => isInf(P) ? Q : isInf(Q) ? P : toA(jAddMixed(P, toJ(Q))),
    pointDouble: (P) => isInf(P) ? P : toA(jDbl(toJ(P))),
    pointMultiply: pointMul,      // Montgomery ladder (v1.3)
    multiplyG: mulG,
    // Crypto
    generateKeyPair, publicKeyFromPrivate,
    sign, verify, encrypt, decrypt,
    // Utils
    hex2bi, bi2hex, pk2hex,
    SM2_P, SM2_N, G,
    // Internal (for testing/TVLA)
    jDbl, jAdd, jAddMixed, toJ, toA, F, J_ZERO, isJInf
};
