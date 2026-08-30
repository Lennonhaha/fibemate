#!/usr/bin/env python3
"""VWZ Challenge Verification Script"""
import json, sys

Q = 65537
def mod(x): return x % Q

def hash_to_sphere(msg, seed=0xABCD):
    h = 0xcbf29ce484222325
    h ^= seed
    for b in msg.encode() if isinstance(msg, str) else msg:
        h = ((h ^ b) * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF
    class XS:
        def __init__(self, s): self.state = s if s else 1
        def n(self):
            x = self.state; x ^= (x << 13) & 0xFFFFFFFFFFFFFFFF; x ^= x >> 7
            x ^= (x << 17) & 0xFFFFFFFFFFFFFFFF; self.state = x; return x
    rng = XS(h)
    t = [0]*9
    pos = set()
    while len(pos) < 5: pos.add(rng.n() % 9)
    for p in pos: t[p] = (rng.n() % 65536) + 1
    return t

def verify(pk, w2, w3, msg):
    T = pk['T']
    t = hash_to_sphere(msg)
    for i1 in range(9):
        s = 0
        for i2 in range(5):
            for i3 in range(5):
                s += T[i1][i2][i3] * w2[i2] * w3[i3]
        if mod(s) != t[i1]:
            return False
    return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: verify.py <solution.json>")
        sys.exit(1)
    with open('vwz-challenge-k4.json') as f:
        ds = json.load(f)
    with open(sys.argv[1]) as f:
        sol = json.load(f)

    pk = {'T': ds['public_key']}
    w2 = sol.get('w2', [])
    w3 = sol.get('w3', [])
    msg = sol.get('msg', 'TEST')

    ok = verify(pk, w2, w3, msg)
    print("VERIFIED" if ok else "REJECTED")
    sys.exit(0 if ok else 1)
