{
  "targets": [
    {
      "target_name": "mlkem",
      "sources": [
        "mlkem_wrap.c",
        "indcpa.c", "kem.c", "poly.c", "polyvec.c",
        "ntt.c", "cbd.c", "reduce.c", "verify.c",
        "fips202.c", "symmetric-shake.c",
        "randombytes.c"
      ],
      "include_dirs": [
        ".",
        "<!(node -e \"console.log(require('node-addon-api').include)\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags": ["-O3", "-std=c99", "-march=native", "-flto", "-funroll-loops", "-fomit-frame-pointer"],
      "ldflags": ["-flto"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}
