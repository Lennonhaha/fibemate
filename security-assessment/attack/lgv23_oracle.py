#!/usr/bin/env python3
"""LG v2.3 Rust 源码的 Python 精确重实现（oracle）——用于验证黑盒攻击对全部变体有效。
对应文件：experimental/vwz-lg/lg-v2.3/src/{wreath,bind,premix,vm,pipeline,diffuse,hardening}.rs
"""
import hashlib

# ---- AES S-box (sbox.rs) ----
SBOX = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]
INV_SBOX = [0]*256
for _i, _v in enumerate(SBOX):
    INV_SBOX[_v] = _i

MASK64 = (1 << 64) - 1

# ---- bind.rs: Keccak-256（0x01 padding，非 SHA3-256） ----
_KECCAK_RATE = 136
_KECCAK_ROUNDS = 24
_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A,
    0x8000000080008000, 0x000000000000808B, 0x0000000080000001,
    0x8000000080008081, 0x8000000000008009, 0x000000000000008A,
    0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
    0x000000000000800A, 0x800000008000000A, 0x8000000080008081,
    0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_RHO = [
    0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39,
    41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
]

def _rotl64(x, n):
    return ((x << n) | (x >> (64 - n))) & MASK64

def _keccak_f(state):
    for r in range(_KECCAK_ROUNDS):
        c = [state[x] ^ state[5+x] ^ state[10+x] ^ state[15+x] ^ state[20+x] for x in range(5)]
        d = [c[(x+4) % 5] ^ _rotl64(c[(x+1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x + 5*y] ^= d[x]
        temp = [0]*25
        temp[0] = state[0]
        x, y = 1, 0
        for t in range(24):
            nx, ny = y, (2*x + 3*y) % 5
            temp[nx + 5*ny] = _rotl64(state[t+1], _RHO[t+1])
            x, y = nx, ny
        for y in range(5):
            i0 = 5*y
            for x in range(5):
                state[x + i0] = temp[x + i0]
            for x in range(5):
                temp[x + i0] = state[x + i0] ^ ((~state[(x+1) % 5 + i0]) & state[(x+2) % 5 + i0])
        state[0] ^= _RC[r]
    return state

def keccak256(data):
    state = [0]*25
    i = 0
    while i + _KECCAK_RATE <= len(data):
        block = data[i:i+_KECCAK_RATE]
        for j in range(_KECCAK_RATE // 8):
            state[j] ^= int.from_bytes(block[j*8:(j+1)*8], 'little')
        _keccak_f(state)
        i += _KECCAK_RATE
    block = bytearray(_KECCAK_RATE)
    block[0:len(data)-i] = data[i:]
    block[len(data)-i] = 0x01
    block[_KECCAK_RATE-1] |= 0x80
    for j in range(_KECCAK_RATE // 8):
        state[j] ^= int.from_bytes(block[j*8:(j+1)*8], 'little')
    _keccak_f(state)
    out = bytearray(32)
    for j in range(4):
        out[j*8:(j+1)*8] = state[j].to_bytes(8, 'little')
    return bytes(out)

# ---- wreath.rs: XorShift64 ----
class XorShift64:
    def __init__(self, seed):
        self.x = seed if seed != 0 else 1
    def next(self):
        x = self.x
        x ^= (x << 13) & MASK64
        x ^= (x >> 7)
        x ^= (x << 17) & MASK64
        self.x = x & MASK64
        return x & MASK64
    def next_u8(self):
        return self.next() & 0xFF

# splitmix64 (layer_seed 使用的雪崩函数)
def layer_seed(base, idx):
    s = (base ^ ((idx + 1) * 0x9E3779B97F4A7C15)) & MASK64
    s ^= (s >> 30); s = (s * 0xBF58476D1CE4E5B9) & MASK64
    s ^= (s >> 27); s = (s * 0x94D049BB133111EB) & MASK64
    s ^= (s >> 31)
    return s & MASK64

NUM_LAYERS = 7

class LayerSeeds:
    def __init__(self, seed):
        self.off1 = [0]*NUM_LAYERS
        self.off2 = [0]*NUM_LAYERS
        for li in range(NUM_LAYERS):
            rng = XorShift64(layer_seed(seed, li + NUM_LAYERS))
            self.off1[li] = rng.next()
            self.off2[li] = rng.next()

# ---- wreath.rs: confuse_chunk_depth / deconfuse_chunk_depth ----
def confuse_chunk_depth(chunk, seed, seeds, depth):
    n = len(chunk)
    layers = min(max(depth, 1), NUM_LAYERS)
    for li in range(layers):
        rng = XorShift64(layer_seed(seed, li))
        perm = list(range(n))
        for i in range(n-1, 0, -1):
            j = rng.next() % (i + 1)
            perm[i], perm[j] = perm[j], perm[i]
        rng1 = XorShift64(seeds.off1[li])
        rng2 = XorShift64(seeds.off2[li])
        off1 = [rng1.next_u8() for _ in range(n)]
        off2 = [rng2.next_u8() for _ in range(n)]
        tmp = [0]*n
        for i in range(n):
            tmp[i] = chunk[i] ^ off1[i]
        new = [0]*n
        for i in range(n):
            new[perm[i]] = SBOX[tmp[i] ^ off2[perm[i]]]
        chunk[:] = new

def deconfuse_chunk_depth(chunk, seed, seeds, depth):
    n = len(chunk)
    layers = min(max(depth, 1), NUM_LAYERS)
    for li in range(layers-1, -1, -1):
        rng = XorShift64(layer_seed(seed, li))
        perm = list(range(n))
        for i in range(n-1, 0, -1):
            j = rng.next() % (i + 1)
            perm[i], perm[j] = perm[j], perm[i]
        inv_perm = [0]*n
        for i in range(n):
            inv_perm[perm[i]] = i
        rng1 = XorShift64(seeds.off1[li])
        rng2 = XorShift64(seeds.off2[li])
        off1 = [rng1.next_u8() for _ in range(n)]
        off2 = [rng2.next_u8() for _ in range(n)]
        tmp = [0]*n
        for i in range(n):
            val = INV_SBOX[chunk[i]] ^ off2[i]
            tmp[inv_perm[i]] = val
        for i in range(n):
            chunk[i] = tmp[i] ^ off1[i]

def confuse_full(data, seed):
    seeds = LayerSeeds(seed)
    confuse_chunk_depth(data, seed, seeds, NUM_LAYERS)

def deconfuse_full(data, seed):
    seeds = LayerSeeds(seed)
    deconfuse_chunk_depth(data, seed, seeds, NUM_LAYERS)

# ---- premix.rs ----
def premix(data, key):
    n = len(data)
    rng = XorShift64(key)
    for i in range(n):
        data[i] ^= rng.next_u8()

postmix = premix

def full_mix_forward_depth(data, seed, session_key, depth):
    key = (seed + session_key) & MASK64
    premix(data, key)
    confuse_chunk_depth(data, seed, LayerSeeds(seed), depth)
    postmix(data, key)

def full_mix_inverse_depth(data, seed, session_key, depth):
    key = (seed + session_key) & MASK64
    premix(data, key)
    deconfuse_chunk_depth(data, seed, LayerSeeds(seed), depth)
    postmix(data, key)

# ---- bind.rs: CryptoBinding (Keccak-256, 与 Rust 一致) ----
class CryptoBinding:
    def __init__(self, ss):
        self.ss = bytes(ss)
    def bind(self, data):
        if not data:
            return b""
        label = b"LGv2-KEM-BIND-v1"
        h = keccak256(label + self.ss)
        return bytes(b ^ h[i % 32] for i, b in enumerate(data))
    unbind = bind

# ---- diffuse.rs: 全块扩散 (Stage-3) ----
# GF(256) 乘法 (AES 多项式 0x11b)
def gf_mul(a, b):
    p = 0
    for _ in range(8):
        if b & 1:
            p ^= a
        hi = a & 0x80
        a = (a << 1) & 0xFF
        if hi:
            a ^= 0x1B
        b >>= 1
    return p & 0xFF

# splitmix64 雪崩 -> 每行独立 seed (与 Rust diffuse.rs::row_seed 一致)
def _row_seed(master, pass_, row):
    s = (master ^ ((pass_ * 0x9E3779B97F4A7C15) & MASK64)
         ^ (((row + 1) * 0xBF58476D1CE4E5B9) & MASK64)) & MASK64
    s ^= (s >> 30); s = (s * 0xBF58476D1CE4E5B9) & MASK64
    s ^= (s >> 27); s = (s * 0x94D049BB133111EB) & MASK64
    s ^= (s >> 31)
    return s & MASK64

_DIFFUSE_DOMAIN = 0x11A7E0F05EED11A7

def diffuse_forward(data, seed, session_key):
    n = len(data)
    if n == 0:
        return
    master = (seed ^ session_key ^ _DIFFUSE_DOMAIN) & MASK64
    t = [0] * n
    # pass1: 下三角 t[i] = b1[i] ^ Σ_{j<i} A1[i][j]·in[j] ^ in[i]
    for i in range(n):
        rng = XorShift64(_row_seed(master, 1, i))
        b1 = rng.next_u8()
        s = b1
        for j in range(i):
            c = rng.next_u8()
            if c:
                s ^= gf_mul(c, data[j])
        t[i] = s ^ data[i]
    # pass2: 上三角 out[i] = b2[i] ^ Σ_{j>i} A2[i][j]·t[j] ^ t[i]
    for i in range(n):
        rng = XorShift64(_row_seed(master, 2, i))
        b2 = rng.next_u8()
        s = b2
        for j in range(i + 1, n):
            c = rng.next_u8()
            if c:
                s ^= gf_mul(c, t[j])
        data[i] = s ^ t[i]

def diffuse_inverse(data, seed, session_key):
    n = len(data)
    if n == 0:
        return
    master = (seed ^ session_key ^ _DIFFUSE_DOMAIN) & MASK64
    t = [0] * n
    # undo pass2: t[i] = out[i] ^ b2[i] ^ Σ_{j>i} A2[i][j]·t[j]
    for i in range(n - 1, -1, -1):
        rng = XorShift64(_row_seed(master, 2, i))
        b2 = rng.next_u8()
        s = b2
        for j in range(i + 1, n):
            c = rng.next_u8()
            if c:
                s ^= gf_mul(c, t[j])
        t[i] = data[i] ^ s
    # undo pass1: in[i] = t[i] ^ b1[i] ^ Σ_{j<i} A1[i][j]·in[j]
    for i in range(n):
        rng = XorShift64(_row_seed(master, 1, i))
        b1 = rng.next_u8()
        s = b1
        for j in range(i):
            c = rng.next_u8()
            if c:
                s ^= gf_mul(c, data[j])
        data[i] = t[i] ^ s

# ---- hardening.rs: 多轮扩散↔S-box 交替加固层 (Stage-3) ----
HARDEN_ROUNDS = 2
_HARDEN_DOMAIN = b"LGV3-HARDEN-v1"

def round_key(seed, session_key, rnd):
    inp = _HARDEN_DOMAIN + seed.to_bytes(8, 'little') + session_key.to_bytes(8, 'little') + rnd.to_bytes(8, 'little')
    return int.from_bytes(keccak256(inp)[:8], 'little')

def sbox_mix(data, rk):
    rng = XorShift64(rk)
    for i in range(len(data)):
        data[i] = SBOX[data[i] ^ rng.next_u8()]

def inv_sbox_mix(data, rk):
    rng = XorShift64(rk)
    for i in range(len(data)):
        data[i] = INV_SBOX[data[i]] ^ rng.next_u8()

def harden_forward(data, seed, session_key, rounds=HARDEN_ROUNDS):
    if not data:
        return
    for r in range(rounds):
        rk = round_key(seed, session_key, r)
        diffuse_forward(data, rk, session_key)
        sbox_mix(data, rk)

def harden_inverse(data, seed, session_key, rounds=HARDEN_ROUNDS):
    if not data:
        return
    for r in range(rounds - 1, -1, -1):
        rk = round_key(seed, session_key, r)
        inv_sbox_mix(data, rk)
        diffuse_inverse(data, rk, session_key)

# ---- 公开 API（lib.rs） ----
def lgv2_confuse(data, seed):
    d = bytearray(data)
    confuse_full(d, seed)
    harden_forward(d, seed, 0)
    return bytes(d)

def lgv2_deconfuse(data, seed):
    d = bytearray(data)
    harden_inverse(d, seed, 0)
    deconfuse_full(d, seed)
    return bytes(d)

def lgv2_confuse_ex(data, seed, session_key, depth):
    combined = (seed + session_key) & MASK64
    d = bytearray(data)
    confuse_chunk_depth(d, combined, LayerSeeds(combined), depth)
    harden_forward(d, seed, session_key)
    return bytes(d)

def lgv2_deconfuse_ex(data, seed, session_key, depth):
    combined = (seed + session_key) & MASK64
    d = bytearray(data)
    harden_inverse(d, seed, session_key)
    deconfuse_chunk_depth(d, combined, LayerSeeds(combined), depth)
    return bytes(d)

def lgv3_confuse_mix(data, seed, session_key, depth):
    d = bytearray(data)
    full_mix_forward_depth(d, seed, session_key, depth)
    harden_forward(d, seed, session_key)
    return bytes(d)

def lgv3_deconfuse_mix(data, seed, session_key, depth):
    d = bytearray(data)
    harden_inverse(d, seed, session_key)
    full_mix_inverse_depth(d, seed, session_key, depth)
    return bytes(d)

def lgv2_bind_kem(data, kem_ss):
    return CryptoBinding(kem_ss).bind(data)

def lgv2_unbind_kem(data, kem_ss):
    return CryptoBinding(kem_ss).bind(data)

def lgv2_confuse_full(data, seed, session_key, kem_ss, depth):
    combined = (seed + session_key) & MASK64
    d = bytearray(data)
    confuse_chunk_depth(d, combined, LayerSeeds(combined), depth)
    harden_forward(d, seed, session_key)
    return CryptoBinding(kem_ss).bind(d)

def lgv2_deconfuse_full(data, seed, session_key, kem_ss, depth):
    unbound = CryptoBinding(kem_ss).bind(data)
    combined = (seed + session_key) & MASK64
    d = bytearray(unbound)
    harden_inverse(d, seed, session_key)
    deconfuse_chunk_depth(d, combined, LayerSeeds(combined), depth)
    return bytes(d)

# ---- pipeline.rs: VM 层（仅实现编译程序用到的指令） ----
def _param(b):
    return b & 0x7F

def vm_ops(data, seed, session_key, depth, invert):
    """编译程序对应的指令序列，直接执行（等价 vm.rs exec_*）。"""
    n = len(data)
    db = (depth * 0x3B) & 0xFF
    o = [_param((seed >> (8*s)) & 0xFF ^ db) for s in range(6)]
    # 按 compile_program 顺序：Shuffle, Xor, Sbox, Rot, Add, Swap, Mix, Rev
    if not invert:
        # Shuffle(o1)
        rng = XorShift64(o[0] + 0x5FFF1E0000000001)
        for i in range(n-1, 0, -1):
            j = rng.next() % (i+1)
            data[i], data[j] = data[j], data[i]
        # Xor(o2): 逐字节 keystream
        rng = XorShift64((o[1] * 0x9E3779B97F4A7C15) & MASK64)
        for i in range(n):
            data[i] ^= rng.next_u8()
        # Sbox
        data[:] = [SBOX[b] for b in data]
        # Rot left o3
        k = o[2] % n
        if k:
            data[:] = data[k:] + data[:k]
        # Add o4
        for i in range(n):
            data[i] = (data[i] + o[3]) & 0xFF
        # Swap(o5)
        a = o[4] % n; b = (o[4] >> 1) % n
        data[a], data[b] = data[b], data[a]
        # Mix(o6): XOR keystream then SBOX
        rng = XorShift64(o[5] + 0x4D49580000000001)
        for i in range(n):
            x = data[i] ^ rng.next_u8()
            data[i] = SBOX[x]
        # Rev
        data.reverse()
    else:
        # Rev
        data.reverse()
        # Mix inverse: INV_SBOX then XOR
        rng = XorShift64(o[5] + 0x4D49580000000001)
        for i in range(n):
            data[i] = INV_SBOX[data[i]] ^ rng.next_u8()
        # Swap
        a = o[4] % n; b = (o[4] >> 1) % n
        data[a], data[b] = data[b], data[a]
        # Add inverse
        for i in range(n):
            data[i] = (data[i] - o[3]) & 0xFF
        # Rot right
        k = o[2] % n
        if k:
            data[:] = data[-k:] + data[:-k]
        # Sbox inverse
        data[:] = [INV_SBOX[b] for b in data]
        # Xor keystream
        rng = XorShift64((o[1] * 0x9E3779B97F4A7C15) & MASK64)
        for i in range(n):
            data[i] ^= rng.next_u8()
        # Shuffle inverse
        rng = XorShift64(o[0] + 0x5FFF1E0000000001)
        choices = []
        for i in range(n-1, 0, -1):
            j = rng.next() % (i+1)
            choices.append((i, j))
        for i, j in reversed(choices):
            data[i], data[j] = data[j], data[i]

def lgv3_pipeline_obfuscate(data, seed, session_key, depth):
    d = bytearray(data)
    full_mix_forward_depth(d, seed, session_key, depth)
    harden_forward(d, seed, session_key)
    vm_ops(d, seed, session_key, depth, invert=False)
    return bytes(d)

def lgv3_pipeline_deobfuscate(data, seed, session_key, depth):
    d = bytearray(data)
    vm_ops(d, seed, session_key, depth, invert=True)
    harden_inverse(d, seed, session_key)
    full_mix_inverse_depth(d, seed, session_key, depth)
    return bytes(d)

if __name__ == "__main__":
    # 自检：全部变体 roundtrip
    data = bytes((i*7) & 0xFF for i in range(256))
    ss = bytes([0x42]*32)
    checks = [
        ("confuse", lgv2_deconfuse(lgv2_confuse(data, 0x1234), 0x1234)),
        ("confuse_ex", lgv2_deconfuse_ex(lgv2_confuse_ex(data, 0x1234, 0xDEAD, 7), 0x1234, 0xDEAD, 7)),
        ("confuse_mix", lgv3_deconfuse_mix(lgv3_confuse_mix(data, 0x1234, 0xDEAD, 7), 0x1234, 0xDEAD, 7)),
        ("bind_kem", lgv2_unbind_kem(lgv2_bind_kem(data, ss), ss)),
        ("confuse_full", lgv2_deconfuse_full(lgv2_confuse_full(data, 0x1234, 0xDEAD, ss, 7), 0x1234, 0xDEAD, ss, 7)),
        ("pipeline", lgv3_pipeline_deobfuscate(lgv3_pipeline_obfuscate(data, 0x1234, 0xDEAD, 7), 0x1234, 0xDEAD, 7)),
    ]
    all_ok = True
    for name, r in checks:
        ok = (r == data)
        all_ok &= ok
        print(f"roundtrip {name}: {'PASS' if ok else 'FAIL'}")
    print("ALL OK" if all_ok else "SOME FAILED")
