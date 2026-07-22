"""
FIBEMATE Python Binding — Quick Test

SPDX-License-Identifier: GPL-3.0-only

Run:  cd bindings/python && python3 -m fibemate_py._test
"""

import sys
from fibemate_py import MLKEM768

def test():
    mlkem = MLKEM768()
    N = 1000

    # Keygen
    pk, sk = mlkem.keygen()
    assert len(pk) == 1184, f"pk len: {len(pk)}"
    assert len(sk) == 2400, f"sk len: {len(sk)}"
    print(f"[1/4] keygen OK — pk={len(pk)}B sk={len(sk)}B")

    # Encaps
    ct, ss1 = mlkem.encaps(pk)
    assert len(ct) == 1088, f"ct len: {len(ct)}"
    assert len(ss1) == 32, f"ss len: {len(ss1)}"
    print(f"[2/4] encaps OK — ct={len(ct)}B ss={len(ss1)}B")

    # Decaps
    ss2 = mlkem.decaps(sk, ct)
    assert ss1 == ss2, "Shared secret mismatch!"
    print(f"[3/4] decaps OK — ss1 == ss2")

    # Self-test (N rounds)
    assert mlkem.self_test(N), f"Self-test failed: {N} rounds"
    print(f"[4/4] self-test OK — {N}/{N} roundtrips PASS")

    print("\n✅ All Python binding tests PASS")
    return 0

if __name__ == "__main__":
    sys.exit(test())
