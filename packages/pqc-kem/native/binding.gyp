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
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS==\"linux\"", {
          "cflags!": ["-fno-exceptions"],
          "cflags_cc!": ["-fno-exceptions"],
          # Portable ISA baseline, NOT -march=native.
          #
          # The addon ships to other machines, so the instruction set has to be
          # chosen by us, not by whichever CPU happened to build it:
          #   - #535: an artifact built with -march=native on a runner that has
          #     AVX512_VBMI contained vpermt2b (32x) and died with SIGILL on the
          #     production host, which has avx512f/dq/cd/bw/vl but no vbmi.
          #   - #533: the same flag made the build non-reproducible - different
          #     runner CPUs selected different instructions (83,480 vs 79,384 B).
          #
          # x86-64-v3 = AVX2 + BMI2 + FMA, supported by Haswell (2013+) and
          # Zen (2017+). It is the documented floor for this package; anything
          # above it (AVX-512 of any flavour) must not appear in the artifact,
          # and .github/workflows/native-build.yml asserts that it does not.
          "cflags": ["-O3", "-std=c99", "-march=x86-64-v3", "-flto", "-funroll-loops", "-fomit-frame-pointer"],
          "ldflags": ["-flto"]
        }],
        # macOS is not a deployment target for the server addon: keep the
        # compiler's own baseline per architecture (x86_64 or arm64) instead of
        # pinning an x86-64 -march level that clang would reject on Apple silicon.
        ["OS==\"mac\"", {
          "cflags!": ["-fno-exceptions"],
          "cflags_cc!": ["-fno-exceptions"],
          "cflags": ["-O3", "-std=c99", "-flto", "-funroll-loops", "-fomit-frame-pointer"],
          "ldflags": ["-flto"]
        }],
        ["OS==\"win\"", {
          "cflags": ["/O2", "/GL", "/fp:fast"],
          "ldflags": ["/LTCG"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": "0",
              "CompileAs": "CompileAsC",
              "RuntimeLibrary": "2"
            }
          }
        }]
      ]
    }
  ]
}
