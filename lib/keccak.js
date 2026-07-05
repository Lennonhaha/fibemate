/**
 * keccak.js - Standalone SHA3 / SHAKE / Keccak-p[1600,24]
 * FIPS 202 compliant. Pure JavaScript (BigInt).
 *
 * Derived from ml-kem-768-td.js internal Keccak, with one critical fix:
 *   ROL64 must mask before right-shift (BigInt >> is arithmetic,
 *   but Keccak requires logical/unsigned shift).
 *   Without this fix, lanes with bit 63 set produce wrong results.
 */
'use strict';

const KeccakF1600Constants = {
    RhoOffsets: [
        0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14
    ],
    PiOffsets: [
        0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14, 24, 9, 19, 4
    ],
    RoundConstants: [
        0x0000000000000001n,0x0000000000008082n,0x800000000000808an,
        0x8000000080008000n,0x000000000000808bn,0x0000000080000001n,
        0x8000000080008081n,0x8000000000008009n,0x000000000000008an,
        0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
        0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,
        0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,
        0x000000000000800an,0x800000008000000an,0x8000000080008081n,
        0x8000000000008080n,0x0000000080000001n,0x8000000080008008n
    ]
};

function ROL64(a, n) {
    const u = a & 0xFFFFFFFFFFFFFFFFn;
    return n === 0 ? u : ((u << BigInt(n)) | (u >> BigInt(64 - n))) & 0xFFFFFFFFFFFFFFFFn;
}

function KeccakF1600Ref(state) {
    const C = new BigInt64Array(5);
    const D = new BigInt64Array(5);
    const B = new BigInt64Array(25);
    for (let round = 0; round < 24; round++) {
        for (let x = 0; x < 5; x++)
            C[x] = state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20];
        for (let x = 0; x < 5; x++)
            D[x] = C[(x+4)%5] ^ ROL64(C[(x+1)%5], 1);
        for (let i = 0; i < 25; i++)
            state[i] ^= D[i % 5];
        for (let i = 0; i < 25; i++)
            B[KeccakF1600Constants.PiOffsets[i]] = ROL64(state[i], KeccakF1600Constants.RhoOffsets[i]);
        for (let x = 0; x < 5; x++)
            for (let y = 0; y < 5; y++)
                state[x+5*y] = B[x+5*y] ^ ((~B[(x+1)%5+5*y] & 0xFFFFFFFFFFFFFFFFn) & B[(x+2)%5+5*y]);
        state[0] ^= KeccakF1600Constants.RoundConstants[round];
    }
}

function load64(b, i) {
    let r = 0n;
    for (let j = 0; j < 8; j++) r |= BigInt(b[i+j]) << BigInt(8*j);
    return r;
}
function store64(b, i, v) {
    for (let j = 0; j < 8; j++) { b[i+j] = Number(v & 0xFFn); v >>= 8n; }
}

class XofShake {
    constructor(rate, suffix) {
        this.state = new BigInt64Array(25);
        this.rate = rate;
        this.suffix = suffix;
        this.byteBuf = new Uint8Array(200);
        this.pos = 0;
        this.finalized = false;
    }
    absorb(data) {
        if (this.finalized) throw new Error('already finalized');
        for (let i = 0; i < data.length; i++) {
            this.byteBuf[this.pos++] ^= data[i];
            if (this.pos === this.rate) {
                this._bytesToLanes(); KeccakF1600Ref(this.state); this._lanesToBytes(); this.pos = 0;
            }
        }
    }
    finalize() {
        if (this.finalized) return;
        this.byteBuf[this.pos] ^= this.suffix;
        this.byteBuf[this.rate - 1] ^= 0x80;
        this._bytesToLanes(); KeccakF1600Ref(this.state); this._lanesToBytes(); this.pos = 0;
        this.finalized = true;
    }
    squeeze(n) {
        if (!this.finalized) this.finalize();
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            out[i] = this.byteBuf[this.pos++];
            if (this.pos === this.rate) {
                this._bytesToLanes(); KeccakF1600Ref(this.state); this._lanesToBytes(); this.pos = 0;
            }
        }
        return out;
    }
    _bytesToLanes() { for (let i = 0; i < 25; i++) this.state[i] = load64(this.byteBuf, i * 8); }
    _lanesToBytes() { for (let i = 0; i < 25; i++) store64(this.byteBuf, i * 8, this.state[i]); }
}

function shake128(data, n) { const s = new XofShake(168, 0x1f); s.absorb(data); return s.squeeze(n); }
function shake256(data, n) { const s = new XofShake(136, 0x1f); s.absorb(data); return s.squeeze(n); }
function sha3_256(data) { const s = new XofShake(136, 0x06); s.absorb(data); return s.squeeze(32); }
function sha3_512(data) { const s = new XofShake(72, 0x06); s.absorb(data); return s.squeeze(64); }

// ---- Hex helper ----
function bytesToHex(arr) {
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- Self-test (NIST CAVP / FIPS 202 test vectors) ----
function keccak_selfTest() {
    const assertBytes = (label, actual, expectedHex) => {
        const got = bytesToHex(actual);
        if (got !== expectedHex) {
            console.error('FAIL: ' + label);
            console.error('  got:      ' + got);
            console.error('  expected: ' + expectedHex);
            return false;
        }
        return true;
    };
    let ok = true;

    const bytes = (s) => s ? new Uint8Array([...s].map(c => c.charCodeAt(0))) : new Uint8Array(0);

    // --- SHA3-256 ---
    ok = assertBytes('SHA3-256 empty',
        sha3_256(bytes('')),
        'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a') && ok;

    ok = assertBytes('SHA3-256 abc',
        sha3_256(bytes('abc')),
        '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532') && ok;

    ok = assertBytes('SHA3-256 56-char',
        sha3_256(bytes('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu')),
        '916f6061fe879741ca6469b43971dfdb28b1a32dc36cb3254e812be27aad1d18') && ok;

    // --- SHA3-512 ---
    ok = assertBytes('SHA3-512 empty',
        sha3_512(bytes('')),
        'a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26') && ok;

    ok = assertBytes('SHA3-512 abc',
        sha3_512(bytes('abc')),
        'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0') && ok;

    // --- SHAKE-128 ---
    ok = assertBytes('SHAKE-128 empty 256',
        shake128(bytes(''), 32),
        '7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26') && ok;

    ok = assertBytes('SHAKE-128 abc 256',
        shake128(bytes('abc'), 32),
        '5881092dd818bf5cf8a3ddb793fbcba74097d5c526a6d35f97b83351940f2cc8') && ok;

    ok = assertBytes('SHAKE-128 empty 128',
        shake128(bytes(''), 16),
        '7f9c2ba4e88f827d616045507605853e') && ok;

    // --- SHAKE-256 ---
    ok = assertBytes('SHAKE-256 empty 512',
        shake256(bytes(''), 64),
        '46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762fd75dc4ddd8c0f200cb05019d67b592f6fc821c49479ab48640292eacb3b7c4be') && ok;

    ok = assertBytes('SHAKE-256 abc 512',
        shake256(bytes('abc'), 64),
        '483366601360a8771c6863080cc4114d8db44530f8f1e1ee4f94ea37e78b5739d5a15bef186a5386c75744c0527e1faa9f8726e462a12a4feb06bd8801e751e4') && ok;

    // --- Incremental absorb ---
    const s = new XofShake(136, 0x06);
    s.absorb(bytes('ab'));
    s.absorb(bytes('c'));
    ok = assertBytes('SHA3-256 incremental',
        s.squeeze(32),
        '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532') && ok;

    // --- Output > rate ---
    const longOut = shake256(bytes('test'), 300);
    ok = ok && longOut.length === 300;
    if (longOut.length !== 300) console.error('FAIL: SHAKE-256 output length ' + longOut.length + ', expected 300');

    // --- N=10000 throughput benchmark ---
    const t0 = Date.now();
    let dummy = 0;
    for (let i = 0; i < 10000; i++) {
        const out = shake256(new Uint8Array([i & 0xFF, (i >> 8) & 0xFF]), 32);
        dummy ^= out[0];
    }
    const elapsed = Date.now() - t0;
    console.log('SHAKE-256 throughput: 10000 x 32B in ' + elapsed + 'ms (checksum byte ' + dummy + ')');

    // --- Keccak-p all-zero (sanity check) ---
    const kp = new BigInt64Array(25);
    KeccakF1600Ref(kp);
    const expectedLane0 = 'f1258f7940e1dde7';
    const actualLane0 = (kp[0] & 0xFFFFFFFFFFFFFFFFn).toString(16);
    ok = ok && actualLane0 === expectedLane0;
    if (actualLane0 !== expectedLane0) console.error('FAIL: Keccak-p(all-zero) lane[0] got ' + actualLane0 + ' expected ' + expectedLane0);

    if (ok) {
        console.log('\n=== ALL KECCAK SELF-TESTS PASSED ===');
    } else {
        console.error('\n=== SOME TESTS FAILED ===');
    }
    return ok;
}

module.exports = {
    keccakP: KeccakF1600Ref,
    sha3_256, sha3_512,
    shake128, shake256,
    sha3_256_hex: (d) => bytesToHex(sha3_256(d)),
    sha3_512_hex: (d) => bytesToHex(sha3_512(d)),
    shake128_hex: (d, n) => bytesToHex(shake128(d, n)),
    shake256_hex: (d, n) => bytesToHex(shake256(d, n)),
    keccak_selfTest,
    XofShake,
    KeccakF1600Constants
};
