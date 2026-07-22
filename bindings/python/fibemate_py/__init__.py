"""
FIBEMATE Python Binding — ML-KEM-768 (FIPS 203)

SPDX-License-Identifier: GPL-3.0-only

Minimal Python wrapper around the Node.js ML-KEM-768 implementation.
Designed for academic researchers who want a quick Python entry point
without compiling C/Rust.

Requirements: Python 3.10+, Node.js 22+
Install:     pip install subprocess  (stdlib, no extra deps)

Usage:
    from fibemate_py import MLKEM768
    mlkem = MLKEM768()
    pk, sk = mlkem.keygen()           # (bytes, bytes)
    ct, ss_enc = mlkem.encaps(pk)     # (bytes, bytes)
    ss_dec = mlkem.decaps(sk, ct)     # bytes
    assert ss_enc == ss_dec
"""

import subprocess
import json
import sys
import os
from pathlib import Path

_NODE_BIN = os.environ.get("FIBEMATE_NODE", "node")
_JS_PATH = Path(__file__).parent / "fibemate_bridge.js"
_KAT_N = os.environ.get("FIBEMATE_KAT_N", "1000")


def _run_js(action: str, args: list = None) -> dict:
    """Execute Node.js bridge script and return parsed JSON result."""
    payload = json.dumps({"action": action, "args": args or []})
    try:
        proc = subprocess.run(
            [_NODE_BIN, str(_JS_PATH)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        result = json.loads(proc.stdout)
        if result.get("error"):
            raise RuntimeError(result["error"])
        return result
    except subprocess.TimeoutExpired:
        raise TimeoutError(f"Node.js {action} timed out (>10s)")
    except FileNotFoundError:
        raise RuntimeError(
            f"Node.js not found at '{_NODE_BIN}'. "
            f"Install Node.js 22+ or set FIBEMATE_NODE env var."
        )


def _hex_to_bytes(s: str) -> bytes:
    return bytes.fromhex(s)


def _bytes_to_hex(b: bytes) -> str:
    return b.hex()


class MLKEM768:
    """
    ML-KEM-768 (FIPS 203) key encapsulation mechanism.

    >>> mlkem = MLKEM768()
    >>> pk, sk = mlkem.keygen()
    >>> len(pk), len(sk)
    (1184, 2400)
    >>> ct, ss1 = mlkem.encaps(pk)
    >>> len(ct), len(ss1)
    (1088, 32)
    >>> ss2 = mlkem.decaps(sk, ct)
    >>> ss1 == ss2
    True
    """

    def __init__(self, nodejs_path: str = None):
        global _NODE_BIN
        if nodejs_path:
            _NODE_BIN = nodejs_path

    def keygen(self) -> tuple:
        """Generate keypair.

        Returns:
            (public_key: bytes, secret_key: bytes)
                public_key:  1184 bytes
                secret_key:  2400 bytes
        """
        r = _run_js("keygen")
        return _hex_to_bytes(r["publicKey"]), _hex_to_bytes(r["secretKey"])

    def encaps(self, public_key: bytes) -> tuple:
        """Encapsulate a shared secret under the given public key.

        Args:
            public_key: 1184-byte ML-KEM-768 public key

        Returns:
            (ciphertext: bytes, shared_secret: bytes)
                ciphertext:    1088 bytes
                shared_secret:   32 bytes (SHA3-256 hash of K_bar)
        """
        r = _run_js("encaps", [_bytes_to_hex(public_key)])
        return _hex_to_bytes(r["ciphertext"]), _hex_to_bytes(r["sharedSecret"])

    def decaps(self, secret_key: bytes, ciphertext: bytes) -> bytes:
        """Decapsulate a shared secret from a ciphertext.

        Args:
            secret_key:  2400-byte ML-KEM-768 secret key
            ciphertext:  1088-byte ciphertext

        Returns:
            shared_secret: 32 bytes (SHA3-256 hash of K_bar)
        """
        r = _run_js("decaps", [_bytes_to_hex(secret_key), _bytes_to_hex(ciphertext)])
        return _hex_to_bytes(r["sharedSecret"])

    def self_test(self, n: int = None) -> bool:
        """Run KEM roundtrip test (n iterations).

        Returns True if all n roundtrips produce matching shared secrets.
        """
        if n is None:
            n = int(_KAT_N)
        r = _run_js("selfTest", [str(n)])
        return r["pass"]
