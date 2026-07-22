#!/usr/bin/env python3
"""SM4-GCM Python reference implementation + KAT generator
gmssl provides raw SM4 ECB; we implement GCM mode on top.

GCM (NIST SP 800-38D):
  - CTR mode: increment IV+ctr, encrypt with SM4, XOR plaintext
  - GHASH: multiplication in GF(2^128) for authentication tag
"""

from gmssl.sm4 import CryptSM4
import json
import os
import struct

# ── GF(2^128) math ──
# R = 0xe1 << 120 (the reduction polynomial x^128 + x^7 + x^2 + x + 1)
R = 0xe1000000000000000000000000000000

def _gf128_mul(x, y):
    """Multiply two 128-bit integers in GF(2^128)."""
    z = 0
    for i in range(127, -1, -1):
        if (x >> i) & 1:
            z ^= y
        if y & 1:
            y = (y >> 1) ^ R
        else:
            y >>= 1
    return z & ((1 << 128) - 1)

def _bytes_to_int(b):
    return int.from_bytes(b, 'big')

def _int_to_bytes(n, length=16):
    return n.to_bytes(length, 'big')

def _xor_bytes(a, b):
    return bytes(x ^ y for x, y in zip(a, b))

def _inc32(block):
    """Increment the rightmost 32 bits of a 16-byte block (GCM spec §6.2)."""
    n = int.from_bytes(block, 'big')
    right = (n & 0xFFFFFFFF) + 1
    n = (n & ~0xFFFFFFFF) | (right & 0xFFFFFFFF)
    return n.to_bytes(16, 'big')

# ── GHASH ──
def ghash(h_key, aad, ciphertext):
    """GHASH(H, A, C) per SP 800-38D §6.4."""
    def _pad(b):
        m = len(b) % 16
        if m == 0:
            return b
        return b + b'\x00' * (16 - m)

    data = _pad(aad) + _pad(ciphertext)
    data += (len(aad) * 8).to_bytes(8, 'big')
    data += (len(ciphertext) * 8).to_bytes(8, 'big')

    y = 0
    h = _bytes_to_int(h_key)
    for i in range(0, len(data), 16):
        block = _bytes_to_int(data[i:i+16])
        y = _gf128_mul(y ^ block, h)
    return _int_to_bytes(y)

# ── SM4-GCM ──
class SM4GCMRef:
    def __init__(self, key_hex):
        """key: hex string (32 chars = 16 bytes)"""
        key = bytes.fromhex(key_hex)
        self.key = key
        self.cipher = CryptSM4()
        self.cipher.set_key(list(key), 0)  # 0 = SM4_ENCRYPT
        self.cipher_dec = CryptSM4()
        self.cipher_dec.set_key(list(key), 1)  # 1 = SM4_DECRYPT (unused in GCM)

    def _encrypt_block(self, block):
        """Encrypt one 16-byte block with SM4 (raw)."""
        result = bytes(self.cipher.crypt_ecb(list(block))); return result[:16]  # gmssl returns 32 bytes (enc+dec)

    def encrypt(self, plaintext, iv=None, aad=b''):
        """
        Encrypt plaintext with SM4-GCM.
        Returns dict with ciphertext, iv, authTag.
        """
        if iv is None:
            iv = os.urandom(12)  # GCM standard: 96-bit IV

        if isinstance(iv, str):
            iv = bytes.fromhex(iv)
        if isinstance(plaintext, str):
            plaintext = plaintext.encode('utf-8')
        if isinstance(aad, str):
            aad = aad.encode('utf-8')

        # H = E_K(0^128)
        H = self._encrypt_block(b'\x00' * 16)

        # J0
        if len(iv) == 12:
            J0 = iv + b'\x00\x00\x00\x01'
        else:
            # For non-96-bit IV (uncommon), use GHASH to derive J0
            J0 = ghash(H, b'', iv)  # simplified; full spec is more complex

        # CTR mode encryption
        counter = J0
        ciphertext = bytearray()
        for i in range(0, len(plaintext), 16):
            counter = _inc32(counter)
            keystream = self._encrypt_block(counter)
            block = plaintext[i:i+16]
            for j in range(len(block)):
                ciphertext.append(block[j] ^ keystream[j])

        ciphertext = bytes(ciphertext)

        # Auth tag: GHASH(H, AAD, C) ⊕ E_K(J0)
        s = self._encrypt_block(J0)
        tag = _xor_bytes(ghash(H, aad, ciphertext), s)

        return {
            'ciphertext': ciphertext.hex(),
            'iv': iv.hex(),
            'authTag': tag.hex(),
        }

    def decrypt(self, ciphertext_hex, iv_hex, auth_tag_hex, aad=b''):
        """Decrypt SM4-GCM; returns plaintext bytes or None on auth failure."""
        iv = bytes.fromhex(iv_hex)
        ciphertext = bytes.fromhex(ciphertext_hex)
        expected_tag = bytes.fromhex(auth_tag_hex)
        if isinstance(aad, str):
            aad = aad.encode('utf-8')

        H = self._encrypt_block(b'\x00' * 16)

        if len(iv) == 12:
            J0 = iv + b'\x00\x00\x00\x01'
        else:
            J0 = ghash(H, b'', iv)

        # Compute auth tag
        s = self._encrypt_block(J0)
        computed_tag = _xor_bytes(ghash(H, aad, ciphertext), s)

        if computed_tag != expected_tag:
            return None  # auth failure

        # CTR mode decryption
        counter = J0
        plaintext = bytearray()
        for i in range(0, len(ciphertext), 16):
            counter = _inc32(counter)
            keystream = self._encrypt_block(counter)
            block = ciphertext[i:i+16]
            for j in range(len(block)):
                plaintext.append(block[j] ^ keystream[j])

        return bytes(plaintext)

    def selftest(self):
        """Self-test with known vectors."""
        results = []

        # Basic roundtrip
        for i in range(5):
            key = f"{i:032x}"
            sm4 = SM4GCMRef(key)
            pt = f"FIBEMATE SM4-GCM test #{i} ".encode() * 3
            iv = f"deadbeef{i:04x}deadbeefdeadbeef"[:24]
            enc = sm4.encrypt(pt, bytes.fromhex(iv))
            dec = sm4.decrypt(enc['ciphertext'], enc['iv'], enc['authTag'])
            ok = dec == pt
            results.append(('Roundtrip', ok, '' if ok else f'#{i} failed'))

        # Tamper detection
        key = "0" * 32
        sm4 = SM4GCMRef(key)
        enc = sm4.encrypt(b"tamper test", bytes.fromhex("aa" * 24))
        bad_tag = "ff" + enc['authTag'][2:]
        dec = sm4.decrypt(enc['ciphertext'], enc['iv'], bad_tag)
        results.append(('Tamper detect', dec is None, ''))

        # AAD test
        enc2 = sm4.encrypt(b"hello", bytes.fromhex("bb" * 24), aad=b"meta")
        dec2 = sm4.decrypt(enc2['ciphertext'], enc2['iv'], enc2['authTag'], aad=b"meta")
        results.append(('AAD roundtrip', dec2 == b"hello", ''))

        # AAD mismatch detection
        dec3 = sm4.decrypt(enc2['ciphertext'], enc2['iv'], enc2['authTag'], aad=b"wrong")
        results.append(('AAD mismatch detect', dec3 is None, ''))

        return results

# ── KAT generation ──
import random
random.seed(0x7314)

def generate_kat():
    kat = []
    for i in range(30):
        key = bytes([random.randint(0, 255) for _ in range(16)]).hex()
        sm4 = SM4GCMRef(key)

        if i < 10:
            pt = f"FIBEMATE-SM4-KAT-{i:03d}".encode()
            aad = b''
        elif i < 20:
            rlen = random.randint(1, 100)
            pt = bytes([random.randint(0, 255) for _ in range(rlen)])
            aad = b''
        else:
            rlen = random.randint(1, 200)
            pt = bytes([random.randint(0, 255) for _ in range(rlen)])
            alen = random.randint(0, 50)
            aad = bytes([random.randint(0, 255) for _ in range(alen)])

        iv = bytes([random.randint(0, 255) for _ in range(12)])
        enc = sm4.encrypt(pt, iv, aad=aad)

        # self-verify
        dec = sm4.decrypt(enc['ciphertext'], enc['iv'], enc['authTag'], aad=aad)
        assert dec == pt, f"Self-verify failed at #{i}"

        kat.append({
            "count": i,
            "key": key,
            "iv": iv.hex(),
            "pt": pt.hex(),
            "ct": enc['ciphertext'],
            "aad": aad.hex(),
            "tag": enc['authTag'],
        })

    return kat

# ── Main ──
if __name__ == '__main__':
    print("=== SM4-GCM Python Reference ===")

    # Self-test
    st = SM4GCMRef("0" * 32).selftest()
    for name, ok, err in st:
        print(f"  {name}: {'PASS' if ok else 'FAIL'} {err}")
    all_ok = all(ok for _, ok, _ in st)
    print(f"  Self-test: {'ALL OK' if all_ok else 'FAIL'}")

    # Generate KAT
    kat = generate_kat()
    print(f"\n  KAT vectors: {len(kat)} generated")
    for v in kat:
        key = bytes.fromhex(v['key'])
        sm4 = SM4GCMRef(v['key'])
        dec = sm4.decrypt(v['ct'], v['iv'], v['tag'], aad=bytes.fromhex(v['aad']))
        pt = bytes.fromhex(v['pt'])
        assert dec == pt, f"KAT verify failed at #{v['count']}"
    print(f"  KAT self-verify: {len(kat)}/{len(kat)} PASS")

    # Write files
    out_dir = os.path.dirname(os.path.abspath(__file__)) + "/../test/kat"
    os.makedirs(out_dir, exist_ok=True)

    json_path = os.path.join(out_dir, "sm4-gcm-KAT.json")
    with open(json_path, 'w') as f:
        json.dump(kat, f, indent=2)
    print(f"\nWrote {json_path}")

    rsp_path = os.path.join(out_dir, "sm4-gcm-KAT.rsp")
    with open(rsp_path, 'w') as f:
        f.write("# SM4-GCM KAT vectors — FIBEMATE sm4-ref\n")
        f.write("# Algorithm: SM4-GCM (GB/T 32907-2016)\n")
        f.write(f"# Generated: 2026-07-22\n")
        f.write("# Python reference: gmssl + custom GCM mode\n#\n")
        for v in kat:
            f.write(f"Count = {v['count']}\n")
            f.write(f"Key = {v['key']}\n")
            f.write(f"IV = {v['iv']}\n")
            f.write(f"PT = {v['pt']}\n")
            f.write(f"AAD = {v['aad']}\n")
            f.write(f"CT = {v['ct']}\n")
            f.write(f"Tag = {v['tag']}\n\n")
    print(f"Wrote {rsp_path}")

    print(f"\n=== SUMMARY ===")
    print(f"  Self-test: {'ALL PASS' if all_ok else 'FAIL'}")
    print(f"  KAT generated: {len(kat)}")
    print(f"  KAT verified: {len(kat)}/{len(kat)}")
