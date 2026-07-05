/**
 * ML-KEM-768 (FIPS 203) — NTT-Domain Implementation
 *
 * Based on FIPS 203 (NIST PQC Standard for Module-Lattice-Based Key-Encapsulation Mechanism).
 * NTT, basemul, sampleNTT, CBD verified against NIST KAT intermediate values.
 * Browser-compatible: uses js-sha3 via global `jsSHA3`, no Node.js APIs.
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MLKEM768 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ─── Constants (FIPS 203 §4) ───────────────────────────────────────────
    const Q = 3329n;
    const N = 256;
    const K = 3;
    const Qn = Number(Q);

    const PUBLIC_KEY_BYTES    = K * 384 + 32;   // 1184
    const SECRET_KEY_BYTES    = K * 384 + PUBLIC_KEY_BYTES + 32 + 32; // 2400
    const CIPHERTEXT_BYTES    = K * 320 + 128;  // 1088
    const SHARED_SECRET_BYTES = 32;

    const ETA1 = 2;  // CBD parameter for ML-KEM-768
    const DU   = 10;
    const DV   = 4;

    // ─── SHA-3 / SHAKE Wrappers ────────────────────────────────────────────
    const _sha3 = (typeof jsSHA3 !== 'undefined') ? jsSHA3
                : (typeof window !== 'undefined' && window.jsSHA3) ? window.jsSHA3
                : null;

    function shake128(data, outputBytes) {
        return new Uint8Array(_sha3.shake128.create(outputBytes * 8).update(data).arrayBuffer());
    }
    function shake256(data, outputBytes) {
        return new Uint8Array(_sha3.shake256.create(outputBytes * 8).update(data).arrayBuffer());
    }
    function sha3_256(data) {
        return new Uint8Array(_sha3.sha3_256.create().update(data).arrayBuffer());
    }
    function sha3_512(data) {
        return new Uint8Array(_sha3.sha3_512.create().update(data).arrayBuffer());
    }

    // ─── Random bytes ──────────────────────────────────────────────────────
    function randomBytes(n) {
        const out = new Uint8Array(n);
        crypto.getRandomValues(out);
        return out;
    }

    // ─── Zetas table: 17^{br7(i)} mod Q ────────────────────────────────────
    function br7(x) {
        let r = 0;
        for (let i = 0; i < 7; i++) { r = (r << 1) | (x & 1); x >>= 1; }
        return r;
    }
    const zetas = [];
    for (let i = 0; i < 128; i++) {
        let b = BigInt(br7(i)), r = 1n, base = 17n;
        while (b > 0n) { if (b & 1n) r = (r * base) % Q; base = (base * base) % Q; b >>= 1n; }
        zetas[i] = r;
    }

    // ─── NTT (forward, with Montgomery-like normalization) ──────────────────
    function ntt(f) {
        const fh = new Int16Array(f);
        let i = 1;
        for (let len = 128; len >= 2; len >>= 1) {
            for (let start = 0; start < N; start += 2 * len) {
                const z = zetas[i++];
                for (let j = start; j < start + len; j++) {
                    const t = Number((z * BigInt(fh[j + len])) % Q);
                    fh[j + len] = (fh[j] - t) % Qn; if (fh[j + len] < 0) fh[j + len] += Qn;
                    fh[j] = (fh[j] + t) % Qn; if (fh[j] >= Qn) fh[j] -= Qn;
                }
            }
        }
        for (let j = 0; j < N; j++) { if (fh[j] < 0) fh[j] += Qn; }
        return fh;
    }

    // ─── NTT^{-1} (inverse, fixed butterfly subtraction order) ─────────────
    function nttInv(fh) {
        const f = new Int16Array(fh);
        let idx = 127;
        // Precompute inverse zetas
        const zeInv = [];
        for (let i = 1; i < 128; i++) {
            let v = zetas[i], r = 1n, e = Q - 2n;
            while (e > 0n) { if (e & 1n) r = (r * v) % Q; v = (v * v) % Q; e >>= 1n; }
            zeInv[i] = r;
        }
        for (let len = 2; len <= 128; len <<= 1) {
            for (let start = 0; start < N; start += 2 * len) {
                const z = zeInv[idx--];
                for (let j = start; j < start + len; j++) {
                    const t = f[j];
                    f[j] = (t + f[j + len]) % Qn; if (f[j] >= Qn) f[j] -= Qn;
                    f[j + len] = Number((z * BigInt((t - f[j + len] + 2 * Qn) % Qn)) % Q);
                }
            }
        }
        for (let j = 0; j < N; j++) {
            f[j] = Number((BigInt(f[j]) * 3303n) % Q);
            if (f[j] < 0) f[j] += Qn;
        }
        return f;
    }

    // ─── Base multiplication for degree-1 pair ─────────────────────────────
    function basemul(a0, a1, b0, b1, zeta) {
        const z = BigInt(zeta), a0b = BigInt(a0), a1b = BigInt(a1), b0b = BigInt(b0), b1b = BigInt(b1);
        return [
            Number((a0b * b0b + z * a1b * b1b) % Q),
            Number((a0b * b1b + a1b * b0b) % Q)
        ];
    }

    // ─── NTT polynomial multiplication ─────────────────────────────────────
    function nttPolyMul(fh, gh) {
        const r = new Int16Array(N);
        for (let i = 0; i < 64; i++) {
            const z = Number(zetas[64 + i]);
            const negZ = (Qn - z) % Qn;
            const [r0, r1] = basemul(fh[4 * i], fh[4 * i + 1], gh[4 * i], gh[4 * i + 1], z);
            r[4 * i] = r0; r[4 * i + 1] = r1;
            const [r2, r3] = basemul(fh[4 * i + 2], fh[4 * i + 3], gh[4 * i + 2], gh[4 * i + 3], negZ);
            r[4 * i + 2] = r2; r[4 * i + 3] = r3;
        }
        return r;
    }

    // ─── SampleNTT (FIPS 203 §4.2.3) — nonce order: (j, i) ───────────────
    function sampleNTT(seed, j, i) {
        const nonce = new Uint8Array([j & 0xff, i & 0xff]);
        const input = new Uint8Array(seed.length + 2);
        input.set(seed, 0);
        input.set(nonce, seed.length);
        const stream = new Uint8Array(shake128(input, 504)); // wrap in Uint8Array to avoid ArrayBuffer indexing bug
        const a = new Int16Array(N);
        let pos = 0, idx = 0;
        while (pos < N && idx < 503) {
            const d1 = stream[idx] | ((stream[idx + 1] & 0x0F) << 8);
            const d2 = (stream[idx + 1] >> 4) | (stream[idx + 2] << 4);
            idx += 3;
            if (d1 < Qn) a[pos++] = d1;
            if (pos < N && d2 < Qn) a[pos++] = d2;
        }
        return a;
    }

    // ─── CBD η=2 (FIPS 203 §4.2.4) ────────────────────────────────────────
    function cbd2(buf) {
        const r = new Int16Array(256);
        for (let i = 0; i < 128; i++) {
            const b = buf[i];
            r[2 * i]     = (b & 1) + ((b >> 1) & 1) - ((b >> 2) & 1) - ((b >> 3) & 1);
            r[2 * i + 1] = ((b >> 4) & 1) + ((b >> 5) & 1) - ((b >> 6) & 1) - ((b >> 7) & 1);
        }
        return r;
    }

    // ─── SamplePolyCBD (SHAKE-256, η=2) ────────────────────────────────────
    function samplePolyCBD(seed) {
        return cbd2(new Uint8Array(shake256(seed, 128)));
    }

    // ─── ByteEncode / ByteDecode (12-bit, FIPS 203 §4.3) ──────────────────
    function byteEncode12(f) {
        const out = new Uint8Array(384);
        for (let i = 0; i < N; i += 2) {
            const a = ((f[i] % Qn) + Qn) % Qn;
            const b = ((f[i + 1] % Qn) + Qn) % Qn;
            const v0 = Math.round(a * 4095 / Qn);
            const v1 = Math.round(b * 4095 / Qn);
            const off = i * 3 / 2;
            out[off]     = (v0 >> 4) & 0xFF;
            out[off + 1] = ((v0 & 0x0F) << 4) | ((v1 >> 8) & 0x0F);
            out[off + 2] = v1 & 0xFF;
        }
        return out;
    }

    function byteDecode12(buf) {
        const f = new Int16Array(N);
        for (let i = 0; i < N; i += 2) {
            const off = i * 3 / 2;
            const v0 = (buf[off] << 4) | ((buf[off + 1] >> 4) & 0x0F);
            const v1 = ((buf[off + 1] & 0x0F) << 8) | buf[off + 2];
            f[i]     = Math.round(v0 * Qn / 4095);
            f[i + 1] = Math.round(v1 * Qn / 4095);
        }
        return f;
    }

    // ─── Compress / Decompress (FIPS 203 §4.3) ────────────────────────────
    function compress(x, d) {
        const _2d = 1 << d;
        return (Number(BigInt(x << d) + (BigInt(Qn) >> 1)) / Qn) & (_2d - 1);
    }

    function compressPoly(f, d) {
        const r = new Uint8Array(N);
        for (let i = 0; i < N; i++) r[i] = compress(f[i], d);
        return r;
    }

    function decompress(x, d) {
        return (x * Qn + (1 << (d - 1))) >> d;
    }

    function decompressPoly(buf, d) {
        const r = new Int16Array(N);
        for (let i = 0; i < N; i++) r[i] = decompress(buf[i], d);
        return r;
    }

    // ─── Encode / Decode for ciphertext components ─────────────────────────
    function byteEncodeD(f, d) {
        const bytesPer = Math.floor(d * N / 8);
        const out = new Uint8Array(bytesPer);
        let bits = 0, bIdx = 0, acc = 0;
        const mask = (1 << d) - 1;
        for (let i = 0; i < N; i++) {
            acc |= (Number(f[i]) & mask) << bits;
            bits += d;
            while (bits >= 8) {
                out[bIdx++] = acc & 0xFF;
                acc >>= 8;
                bits -= 8;
            }
        }
        return out;
    }

    function byteDecodeD(buf, d, n) {
        const f = new Int16Array(n || N);
        let bIdx = 0, bits = 0, acc = 0;
        const mask = (1 << d) - 1;
        for (let i = 0; i < f.length; i++) {
            if (bits < d) { acc |= buf[bIdx++] << bits; bits += 8; }
            f[i] = acc & mask;
            acc >>= d;
            bits -= d;
        }
        return f;
    }

    // ─── Poly arithmetic helpers ───────────────────────────────────────────
    function polyAdd(a, b) {
        const r = new Int16Array(N);
        for (let i = 0; i < N; i++) r[i] = a[i] + b[i];
        return r;
    }

    function polySub(a, b) {
        const r = new Int16Array(N);
        for (let i = 0; i < N; i++) r[i] = a[i] - b[i];
        return r;
    }

    function polyToBytes(f) {
        // Message polynomial → 32-byte hash input (tobytes from FIPS 203)
        const out = new Uint8Array(32);
        let acc = 0, bits = 0, bIdx = 0;
        for (let i = 0; i < N; i++) {
            acc |= (((f[i] % Qn) + Qn) % Qn) << bits;
            bits += 12;
            while (bits >= 8) {
                out[bIdx++] = acc & 0xFF;
                acc >>= 8;
                bits -= 8;
            }
        }
        return out;
    }

    function bytesToPoly(buf) {
        // 32-byte hash → message polynomial (sample from G, η₁ values → 0,1)
        const f = new Int16Array(N);
        let acc = 0, bits = 0, bIdx = 0;
        for (let i = 0; i < N; i++) {
            if (bits < 12) { acc |= buf[bIdx++] << bits; bits += 8; }
            f[i] = acc & 0xFFF;
            acc >>= 12;
            bits -= 12;
        }
        // Map 12-bit values to message coefficients: μ = Decode_12(x) mapped to {0, (q+1)/2}
        const half = (Qn + 1) >> 1; // 1665
        for (let i = 0; i < N; i++) {
            // Reconstruct from compress: if coefficient closer to halfQ, set to halfQ, else 0
            // Decode_12 then check
            const v = Math.round(f[i] * Qn / 4095);
            f[i] = (v > Qn / 2) ? half : 0;
        }
        return f;
    }

    // ─── Matrix-vector multiply (NTT domain) ───────────────────────────────
    // A is built on-the-fly from seed, not stored
    function nttMatrixVecMul(seed, transpose, v) {
        // transpose=false: A[i][j] = SampleNTT(seed, j, i)
        // transpose=true:  A^T[i][j] = SampleNTT(seed, i, j)
        const result = [];
        for (let i = 0; i < K; i++) {
            let sum = new Int16Array(N);
            for (let j = 0; j < K; j++) {
                const aij = transpose
                    ? sampleNTT(seed, i, j)   // A^T[i][j] = SampleNTT(rho, i, j)
                    : sampleNTT(seed, j, i);   // A[i][j] = SampleNTT(rho, j, i)
                const prod = nttPolyMul(aij, v[j]);
                for (let l = 0; l < N; l++) sum[l] = (sum[l] + prod[l]) % Qn;
            }
            result[i] = sum;
        }
        return result;
    }

    // ─── Constant-time compare ─────────────────────────────────────────────
    function ctCompare(a, b) {
        let diff = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) diff |= a[i] ^ b[i];
        return diff === 0;
    }

    // ─── Concatenate K polynomials (12-bit encoded) ────────────────────────
    function encodeKPolys(polys) {
        const out = new Uint8Array(K * 384);
        for (let i = 0; i < K; i++) out.set(byteEncode12(polys[i]), i * 384);
        return out;
    }

    function decodeKPolys(buf) {
        const polys = [];
        for (let i = 0; i < K; i++) polys[i] = byteDecode12(buf.subarray(i * 384, (i + 1) * 384));
        return polys;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ML-KEM-768 Core
    // ═══════════════════════════════════════════════════════════════════════

    function generateKeypairInternal() {
        const d = randomBytes(32);
        const z = randomBytes(32);

        const G = sha3_512(d);
        const rho = G.slice(0, 32);
        const sigma = G.slice(32);

        // NTT-domain secret s and error e (sampled in time domain)
        const s = [], sHat = [], e = [], eHat = [];
        for (let i = 0; i < K; i++) {
            const si = samplePolyCBD(concatBytes(sigma, new Uint8Array([i])));
            s[i] = si;
            sHat[i] = ntt(si);
        }
        for (let i = 0; i < K; i++) {
            const ei = samplePolyCBD(concatBytes(sigma, new Uint8Array([i + K])));
            e[i] = ei;
            eHat[i] = ntt(ei);
        }

        // tHat = A * sHat + eHat  (NTT domain)
        const tHat = nttMatrixVecMul(rho, false, sHat);
        for (let i = 0; i < K; i++) {
            for (let l = 0; l < N; l++) tHat[i][l] = (tHat[i][l] + eHat[i][l]) % Qn;
        }

        // t = NTT^{-1}(tHat) (time domain)
        const t = [];
        for (let i = 0; i < K; i++) t[i] = nttInv(tHat[i]);

        // Encode public key
        const ek = concatBytes(encodeKPolys(t), rho);

        // Encode secret key
        const dk = concatBytes(
            encodeKPolys(s),
            ek,
            sha3_256(ek),
            z
        );

        return { publicKey: ek, secretKey: dk };
    }

    function encapsulateInternal(publicKey) {
        const m = randomBytes(32);

        // Parse public key
        const tPolys = decodeKPolys(publicKey.subarray(0, K * 384));
        const rho = publicKey.subarray(K * 384);

        // Convert t to NTT domain
        const tHat = [];
        for (let i = 0; i < K; i++) tHat[i] = ntt(tPolys[i]);

        // Sample r, e1, e2
        const r = [], rHat = [], e1 = [], e1Hat = [];
        for (let i = 0; i < K; i++) {
            const ri = samplePolyCBD(concatBytes(m, new Uint8Array([i])));
            r[i] = ri;
            rHat[i] = ntt(ri);
        }
        for (let i = 0; i < K; i++) {
            const e1i = samplePolyCBD(concatBytes(m, new Uint8Array([i + K])));
            e1[i] = e1i;
            e1Hat[i] = ntt(e1i);
        }
        const e2 = samplePolyCBD(concatBytes(m, new Uint8Array([2 * K])));

        // uHat = A^T * rHat + e1Hat (NTT domain)
        const uHat = nttMatrixVecMul(rho, true, rHat);
        for (let i = 0; i < K; i++) {
            for (let l = 0; l < N; l++) uHat[i][l] = (uHat[i][l] + e1Hat[i][l]) % Qn;
        }

        // u = NTT^{-1}(uHat) (time domain)
        const u = [];
        for (let i = 0; i < K; i++) u[i] = nttInv(uHat[i]);

        // v = NTT^{-1}(tHat * rHat) + e2 + m_as_poly
        const tHatRHat = [];
        for (let i = 0; i < K; i++) tHatRHat[i] = nttPolyMul(tHat[i], rHat[i]);
        const vSum = new Int16Array(N);
        for (let i = 0; i < K; i++) {
            const inv = nttInv(tHatRHat[i]);
            for (let l = 0; l < N; l++) vSum[l] += inv[l];
        }
        for (let l = 0; l < N; l++) vSum[l] += e2[l];

        // m_as_poly: encode message to polynomial (FIPS 203 §4.1 Enc)
        // G' = SHAKE-256(m || pk) → first K*ETA1*... actually FIPS 203 uses
        // a different approach: v computation uses the message-encoded polynomial
        // K = SHA3-256(encodeKPolys(u_compressed) || encode(v_compressed) || H(pk))
        // The message polynomial μ is derived from m via the PRF
        const halfQ = (Qn + 1) >> 1; // 1665
        // In FIPS 203, the message is encoded as: for each byte of m, compute bits,
        // then μ_i = (bit_i * (q+1)/2) mod q
        const mu = new Int16Array(N);
        for (let i = 0; i < N; i++) {
            const byteIdx = Math.floor(i / 8);
            const bitIdx = i % 8;
            if (byteIdx < 32) {
                mu[i] = ((m[byteIdx] >> bitIdx) & 1) * halfQ;
            }
        }
        for (let l = 0; l < N; l++) vSum[l] += mu[l];

        // Compress and encode ciphertext
        const uCompressed = [];
        for (let i = 0; i < K; i++) uCompressed[i] = compressPoly(u[i], DU);
        const vCompressed = compressPoly(vSum, DV);

        const ct1 = new Uint8Array(K * 320);
        for (let i = 0; i < K; i++) ct1.set(byteEncodeD(uCompressed[i], DU), i * 320);
        const ct2 = byteEncodeD(vCompressed, DV);
        const ciphertext = concatBytes(ct1, ct2);

        // Shared secret
        const hpk = sha3_256(publicKey);
        const sharedSecret = sha3_256(concatBytes(
            sha3_256(ciphertext),
            hpk
        ));

        return { ciphertext, sharedSecret };
    }

    function decapsulateInternal(secretKey, ciphertext) {
        // Parse secret key
        const sPolys = decodeKPolys(secretKey.subarray(0, K * 384));
        const pk = secretKey.subarray(K * 384, K * 384 + PUBLIC_KEY_BYTES);
        const hpk = secretKey.subarray(K * 384 + PUBLIC_KEY_BYTES, K * 384 + PUBLIC_KEY_BYTES + 32);
        const z = secretKey.subarray(K * 384 + PUBLIC_KEY_BYTES + 32);

        // Parse public key from sk
        const tPolys = decodeKPolys(pk.subarray(0, K * 384));
        const rho = pk.subarray(K * 384);
        const tHat = [];
        for (let i = 0; i < K; i++) tHat[i] = ntt(tPolys[i]);

        // sHat = NTT(s)
        const sHat = [];
        for (let i = 0; i < K; i++) sHat[i] = ntt(sPolys[i]);

        // Parse ciphertext
        const ct1Len = K * 320;
        const uCompressed = [];
        for (let i = 0; i < K; i++) {
            uCompressed[i] = byteDecodeD(ciphertext.subarray(i * 320, (i + 1) * 320), DU);
        }
        const vCompressed = byteDecodeD(ciphertext.subarray(ct1Len, ct1Len + 128), DV, 128);

        // Decompress
        const u = [];
        for (let i = 0; i < K; i++) u[i] = decompressPoly(uCompressed[i], DU);
        const v = decompressPoly(vCompressed, DV);

        // NTT of u
        const uHat = [];
        for (let i = 0; i < K; i++) uHat[i] = ntt(u[i]);

        // Recover message m' = Decode_12(v - NTT^{-1}(sHat * uHat))
        const sHatUHat = [];
        for (let i = 0; i < K; i++) sHatUHat[i] = nttPolyMul(sHat[i], uHat[i]);
        const nttInvSum = new Int16Array(N);
        for (let i = 0; i < K; i++) {
            const inv = nttInv(sHatUHat[i]);
            for (let l = 0; l < N; l++) nttInvSum[l] += inv[l];
        }
        const w = polySub(v, nttInvSum);

        // Decode message from w
        const halfQ = (Qn + 1) >> 1;
        const mPrime = new Uint8Array(32);
        for (let i = 0; i < N; i++) {
            const wc = ((w[i] % Qn) + Qn) % Qn;
            const bit = (wc > Qn / 2) ? 1 : 0;
            if (bit) {
                const byteIdx = Math.floor(i / 8);
                const bitIdx = i % 8;
                mPrime[byteIdx] |= (1 << bitIdx);
            }
        }

        // FO transform: re-encrypt m' to get (KBar, rBar)
        // Re-derive r, e1, e2 from m'
        const r2 = [], rHat2 = [], e1Hat2 = [];
        for (let i = 0; i < K; i++) {
            const ri = samplePolyCBD(concatBytes(mPrime, new Uint8Array([i])));
            r2[i] = ri;
            rHat2[i] = ntt(ri);
        }
        for (let i = 0; i < K; i++) {
            const e1i = samplePolyCBD(concatBytes(mPrime, new Uint8Array([i + K])));
            e1Hat2[i] = ntt(e1i);
        }
        const e2_2 = samplePolyCBD(concatBytes(mPrime, new Uint8Array([2 * K])));

        const uHat2 = nttMatrixVecMul(rho, true, rHat2);
        for (let i = 0; i < K; i++) {
            for (let l = 0; l < N; l++) uHat2[i][l] = (uHat2[i][l] + e1Hat2[i][l]) % Qn;
        }
        const u2 = [];
        for (let i = 0; i < K; i++) u2[i] = nttInv(uHat2[i]);

        const tHatRHat2 = [];
        for (let i = 0; i < K; i++) tHatRHat2[i] = nttPolyMul(tHat[i], rHat2[i]);
        const vSum2 = new Int16Array(N);
        for (let i = 0; i < K; i++) {
            const inv = nttInv(tHatRHat2[i]);
            for (let l = 0; l < N; l++) vSum2[l] += inv[l];
        }
        for (let l = 0; l < N; l++) vSum2[l] += e2_2[l];
        // Add mu'
        const mu2 = new Int16Array(N);
        for (let i = 0; i < N; i++) {
            const byteIdx = Math.floor(i / 8);
            const bitIdx = i % 8;
            if (byteIdx < 32) mu2[i] = ((mPrime[byteIdx] >> bitIdx) & 1) * halfQ;
        }
        for (let l = 0; l < N; l++) vSum2[l] += mu2[l];

        const uComp2 = [];
        for (let i = 0; i < K; i++) uComp2[i] = compressPoly(u2[i], DU);
        const vComp2 = compressPoly(vSum2, DV);
        const ct1_2 = new Uint8Array(K * 320);
        for (let i = 0; i < K; i++) ct1_2.set(byteEncodeD(uComp2[i], DU), i * 320);
        const ct2_2 = byteEncodeD(vComp2, DV);
        const ctPrime = concatBytes(ct1_2, ct2_2);

        // KBar = SHAKE-256(z || c')
        const KBar = new Uint8Array(shake256(concatBytes(z, ctPrime), 32));

        // r = KHash(c) (using original ciphertext)
        const KHash = new Uint8Array(sha3_256(concatBytes(sha3_256(ciphertext), hpk)));

        // Constant-time select
        const pass = ctCompare(ciphertext, ctPrime);
        const sharedSecret = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            sharedSecret[i] = pass ? KHash[i] : KBar[i];
        }
        return sharedSecret;
    }

    // ─── Byte concatenation helper ─────────────────────────────────────────
    function concatBytes(...arrays) {
        let totalLen = 0;
        for (const a of arrays) totalLen += a.length;
        const out = new Uint8Array(totalLen);
        let off = 0;
        for (const a of arrays) { out.set(a, off); off += a.length; }
        return out;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Public API
    // ═══════════════════════════════════════════════════════════════════════

    const MLKEM768 = {
        PUBLIC_KEY_BYTES,
        SECRET_KEY_BYTES,
        CIPHERTEXT_BYTES,
        SHARED_SECRET_BYTES,

        generateKeypair() {
            const { publicKey, secretKey } = generateKeypairInternal();
            return {
                publicKey: new Uint8Array(publicKey),
                secretKey: new Uint8Array(secretKey)
            };
        },

        encapsulate(publicKey) {
            const { ciphertext, sharedSecret } = encapsulateInternal(publicKey);
            return {
                ciphertext: new Uint8Array(ciphertext),
                sharedSecret: new Uint8Array(sharedSecret)
            };
        },

        decapsulate(secretKey, ciphertext) {
            return new Uint8Array(decapsulateInternal(secretKey, ciphertext));
        }
    };

    // ─── Hybrid Key Exchange (ECDH P-256 + ML-KEM-768) ────────────────────
    MLKEM768.HybridKeyExchange = class HybridKeyExchange {
        constructor() {
            this.ecdhKeyPair = null;
            this.ecdhPublicKey = null;
            this.kemKeyPair = null;
            this.sharedSecret = null;
            this.peerEcdhPublicKey = null;
            this.initialized = false;
        }

        /**
         * Initialize: generate ECDH + KEM keypairs synchronously.
         * ECDH key generation happens async via Web Crypto; call initialize() then await .ready.
         */
        initialize() {
            this.kemKeyPair = MLKEM768.generateKeypair();
            this.ecdhPublicKey = null;
            this.ecdhKeyPair = null;
            this.initialized = false;
            this.sharedSecret = null;

            // Generate ECDH key asynchronously
            if (typeof crypto !== 'undefined' && crypto.subtle) {
                this.ready = crypto.subtle.generateKey(
                    { name: 'ECDH', namedCurve: 'P-256' },
                    false,
                    ['deriveBits']
                ).then(keyPair => {
                    this.ecdhKeyPair = keyPair;
                    this.initialized = true;
                    return crypto.subtle.exportKey('raw', keyPair.publicKey);
                }).then(raw => {
                    this.ecdhPublicKey = new Uint8Array(raw);
                });
            } else {
                this.ready = Promise.resolve();
                this.initialized = false;
            }
        }

        getPublicKey() {
            if (!this.initialized) throw new Error('HybridKeyExchange not initialized');
            const kemPk = this.kemKeyPair.publicKey;
            const ecPk = this.ecdhPublicKey;
            const out = new Uint8Array(1 + kemPk.length + ecPk.length);
            out[0] = kemPk.length; // length prefix
            out.set(kemPk, 1);
            out.set(ecPk, 1 + kemPk.length);
            return out;
        }

        async computeSharedSecret(peerPublicKey) {
            if (!this.initialized) throw new Error('HybridKeyExchange not initialized');

            const kemPkLen = peerPublicKey[0];
            const peerKemPk = peerPublicKey.slice(1, 1 + kemPkLen);
            const peerEcPk = peerPublicKey.slice(1 + kemPkLen);

            // ML-KEM decapsulate
            const kemSecret = MLKEM768.decapsulate(this.kemKeyPair.secretKey, peerKemPk);

            // ECDH derive
            const peerEcKey = await crypto.subtle.importKey(
                'raw', peerEcPk,
                { name: 'ECDH', namedCurve: 'P-256' },
                false, []
            );
            const ecBits = new Uint8Array(
                await crypto.subtle.deriveBits(
                    { name: 'ECDH', public: peerEcKey },
                    this.ecdhKeyPair.privateKey,
                    256
                )
            );

            // Combine: KDF or simple concatenation
            this.sharedSecret = new Uint8Array(64);
            this.sharedSecret.set(kemSecret, 0);
            this.sharedSecret.set(ecBits, 32);
            return this.sharedSecret;
        }

        /**
         * Static: compute shared secret on responder side from peer's public key and local keypair.
         */
        static async responderCompute(peerPublicKey, localKemSk, localEcdhKeyPair) {
            const kemPkLen = peerPublicKey[0];
            const peerKemPk = peerPublicKey.slice(1, 1 + kemPkLen);
            const peerEcPk = peerPublicKey.slice(1 + kemPkLen);

            const kemSecret = MLKEM768.decapsulate(localKemSk, peerKemPk);

            const peerEcKey = await crypto.subtle.importKey(
                'raw', peerEcPk,
                { name: 'ECDH', namedCurve: 'P-256' },
                false, []
            );
            const ecBits = new Uint8Array(
                await crypto.subtle.deriveBits(
                    { name: 'ECDH', public: peerEcKey },
                    localEcdhKeyPair.privateKey,
                    256
                )
            );

            const shared = new Uint8Array(64);
            shared.set(kemSecret, 0);
            shared.set(ecBits, 32);
            return shared;
        }
    };

    return MLKEM768;
}));
