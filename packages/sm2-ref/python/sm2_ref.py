#!/usr/bin/env python3
"""
SM2 Reference Implementation — Python (gmssl-based)

Uses gmssl CryptSM2 with manual public-key derivation from private key
(since gmssl doesn't auto-derive pubkey from privkey).
"""
import hashlib, json, os, sys, secrets
from gmssl import sm2 as gm_sm2
from gmssl import sm3 as gm_sm3
from gmssl import func as gm_func


def derive_public_key(private_key_hex):
    """Derive SM2 public key from private key via d*G."""
    c = gm_sm2.CryptSM2(private_key=private_key_hex, public_key="")
    # _kg(k, Point) = k*Point. private_key * Generator = public_key
    d = int(private_key_hex, 16)
    pub_point = c._kg(d, c.ecc_table['g'])
    # pub_point is "X(64)Y(64)1(?)" Jacobian
    len_2 = 2 * c.para_len
    x = pub_point[0:c.para_len]
    y = pub_point[c.para_len:len_2]
    return "04" + x + y


class SM2Ref:
    @staticmethod
    def generate_keypair(seed_bytes=None):
        if seed_bytes:
            priv = gm_sm3.sm3_hash(list(seed_bytes))[:64]
        else:
            priv = secrets.token_hex(32)
        pub = derive_public_key(priv)
        return {"publicKey": pub, "privateKey": priv}

    @staticmethod
    def sign(private_key_hex, message_bytes):
        # Must create CryptSM2 with BOTH keys for sign_with_sm3
        pub = derive_public_key(private_key_hex)
        pk = pub[2:]  # strip 04
        # mode doesn't matter for sign, but be explicit
        c = gm_sm2.CryptSM2(private_key=private_key_hex, public_key=pk, mode=1)
        return c.sign_with_sm3(message_bytes)

    @staticmethod
    def verify(public_key_hex, signature_hex, message_bytes):
        pk = public_key_hex[2:] if public_key_hex.startswith("04") else public_key_hex
        c = gm_sm2.CryptSM2(public_key=pk, private_key="")
        return c.verify_with_sm3(signature_hex, message_bytes)

    @staticmethod
    def encrypt(public_key_hex, plaintext_bytes):
        pk = public_key_hex[2:] if public_key_hex.startswith("04") else public_key_hex
        # mode=1 (C1C3C2) matches JS sm-crypto default
        c = gm_sm2.CryptSM2(public_key=pk, private_key="", mode=1)
        return c.encrypt(plaintext_bytes)

    @staticmethod
    def decrypt(private_key_hex, ciphertext_hex):
        pub = derive_public_key(private_key_hex)
        pk = pub[2:]
        # mode=1 (C1C3C2) matches JS sm-crypto default
        c = gm_sm2.CryptSM2(private_key=private_key_hex, public_key=pk, mode=1)
        # gmssl decrypt expects bytes, returns bytes (mode=1 with encrypt returning bytes is confirmed)
        ct_bytes = bytes.fromhex(ciphertext_hex) if isinstance(ciphertext_hex, str) else ciphertext_hex
        return c.decrypt(ct_bytes)

    @staticmethod
    def selftest():
        try:
            kp = SM2Ref.generate_keypair()
            msg = b"FIBEMATE-SM2-self-test"
            sig = SM2Ref.sign(kp["privateKey"], msg)
            vfy = SM2Ref.verify(kp["publicKey"], sig, msg)
            ct  = SM2Ref.encrypt(kp["publicKey"], msg)
            pt  = SM2Ref.decrypt(kp["privateKey"], ct)
            return {"ok": vfy and pt == msg,
                    "publicKey": kp["publicKey"][:24] + "...",
                    "sign": vfy, "encrypt": pt == msg}
        except Exception as e:
            return {"ok": False, "err": str(e)}


# ── KAT ──
def int_to_seed(i):
    return hashlib.sha256(i.to_bytes(4, "big")).digest()

def generate_kat(count=100):
    out = []
    for i in range(count):
        seed = int_to_seed(i)
        kp   = SM2Ref.generate_keypair(seed)
        msg  = f"SM2-KAT-vector-{i:04d}".encode()
        sig  = SM2Ref.sign(kp["privateKey"], msg)
        vfy  = SM2Ref.verify(kp["publicKey"], sig, msg)
        pt   = f"FIBEMATE SM2 KAT plaintext #{i:04d}".encode()
        ct   = SM2Ref.encrypt(kp["publicKey"], pt)
        pt2  = SM2Ref.decrypt(kp["privateKey"], ct)
        out.append({"count": i, "seed": seed.hex(),
                    "privateKey": kp["privateKey"], "publicKey": kp["publicKey"],
                    "message": msg.hex(), "signature": sig, "verified": vfy,
                    "plaintext": pt.hex(), "ciphertext": ct.hex(), "decrypted_ok": bool(pt == pt2)})
    return out

def write_rsp(vectors, path):
    lines = [f"# SM2 KAT vectors — {len(vectors)} count — python sm2_ref.py", ""]
    for v in vectors:
        lines += [f"count = {v['count']}", f"seed = {v['seed']}", f"sk = {v['privateKey']}",
                  f"pk = {v['publicKey']}", f"msg = {v['message']}", f"sig = {v['signature']}",
                  f"verified = {str(v['verified']).lower()}", f"pt = {v['plaintext']}",
                  f"ct = {v['ciphertext']}", f"enc_ok = {str(v['decrypted_ok']).lower()}", ""]
    with open(path, "w") as f:
        f.write("\n".join(lines))

def write_json(vectors, path):
    with open(path, "w") as f:
        json.dump(vectors, f, indent=2)

if __name__ == "__main__":
    count   = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    st = SM2Ref.selftest()
    print(f"selftest: {st}")
    if not st.get("ok"):
        print("FATAL: selftest failed"); sys.exit(1)
    vecs = generate_kat(count)
    ok   = sum(1 for v in vecs if v["verified"] and v["decrypted_ok"])
    print(f"generated: {len(vecs)} vectors, {ok}/{len(vecs)} self-verified OK")
    rp = os.path.join(out_dir, "sm2-KAT.rsp")
    jp = os.path.join(out_dir, "sm2-KAT.json")
    write_rsp(vecs, rp); write_json(vecs, jp)
    print(f"rsp: {rp} ({os.path.getsize(rp)} bytes)  json: {jp} ({os.path.getsize(jp)} bytes)")
