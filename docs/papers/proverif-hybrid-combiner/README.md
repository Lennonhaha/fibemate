# ProVerif artifacts — hybrid combiner

Symbolic check of the FIBEMATE hybrid key-exchange combiner:

```
sessionKey = HKDF-SHA256(salt = TLS session id, ikm = ss_SM2 || ss_ML-KEM)
```

## Files

| File | Purpose |
|---|---|
| `hybrid-combiner.pv` | Attacker learns **one** shared secret (SM2). Expected: query is **true**. |
| `hybrid-combiner-both-leaked.pv` | Negative control: attacker learns **both** secrets. Expected: query is **false**, with a trace. |
| `transcript-single-leak.txt` | Raw output of the first run, unedited. |
| `transcript-both-leaked.txt` | Raw output of the second run, unedited. |

## How to reproduce

```
proverif hybrid-combiner.pv
proverif hybrid-combiner-both-leaked.pv
```

The transcripts were produced with **ProVerif 2.05** (Windows binary distribution,
`proverif.exe`, Windows 10.0.26300 x64) on **2026-11-02**. Any ProVerif 2.x should
reproduce the same `RESULT` lines; the trace rendered for the negative control may
differ in numbering between versions.

## Why the negative control matters

A verifier that only ever answers "true" cannot be distinguished from one that
checks nothing. The second run is deliberately constructed to fail, and does fail:

```
RESULT not attacker(hkdf(lbl,cat(ssm2[],ssmlkem[]))) is false.
```

The first run's `true` is only meaningful in the presence of that failure.

## What this establishes

Under the Dolev–Yao model, with the two shared secrets modelled as independent
uniform values and `hkdf`/`cat` as public constructors: an attacker holding at
most one of the two secrets cannot derive the combined key.

## What this does not establish

- That HKDF-SHA256 behaves as a random oracle.
- That the SM2 ECDH and ML-KEM-768 outputs are computationally independent in the
  real protocol, or uniform.
- Anything about the hardness of SM2-ECDLP or ML-KEM-768.
- Anything about timing, constant-time behaviour, or side channels. Constant-time
  properties are not expressible in this model and are not claimed anywhere.

The scope is the *structure of the combiner*, nothing more.
