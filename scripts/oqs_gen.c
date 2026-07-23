// SPDX-License-Identifier: GPL-3.0-only
// oqs_gen — liboqs CLI bridge for ML-KEM-768 cross-validation
//
// Usage:
//   oqs_gen keygen              → { "pk": "hex", "sk": "hex" }
//   oqs_gen encaps <pkHex>      → { "ct": "hex", "ss": "hex" }
//   oqs_gen decaps <skHex> <ctHex> → { "ss": "hex" }
//
// Build: gcc -O2 -o oqs_gen oqs_gen.c -l oqs
// Or via Docker: docker run --rm -v $PWD:/ws openquantumsafe/liboqs:latest \
//                bash -c 'cd /ws && gcc -O2 -o oqs_gen oqs_gen.c -l oqs -lcrypto'

#include <oqs/oqs.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// liboqs uses ML-KEM-768 as "ML-KEM-768" (FIPS 203)
#define KEM_ALG "ML-KEM-768"

static int hex_decode(const char *hex, uint8_t *out, size_t out_len) {
    size_t len = strlen(hex);
    if (len != out_len * 2) return -1;
    for (size_t i = 0; i < out_len; i++) {
        unsigned int byte;
        if (sscanf(hex + 2*i, "%2x", &byte) != 1) return -1;
        out[i] = (uint8_t)byte;
    }
    return 0;
}

static void hex_encode(const uint8_t *data, size_t len, char *out) {
    for (size_t i = 0; i < len; i++)
        sprintf(out + 2*i, "%02x", data[i]);
    out[2*len] = '\0';
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s keygen | encaps <pkHex> | decaps <skHex> <ctHex>\n", argv[0]);
        return 1;
    }

    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_ml_kem_768);
    if (!kem) {
        fprintf(stderr, "OQS_KEM_new failed for %s\n", KEM_ALG);
        return 2;
    }

    if (strcmp(argv[1], "keygen") == 0) {
        uint8_t pk[OQS_KEM_ml_kem_768_length_public_key];
        uint8_t sk[OQS_KEM_ml_kem_768_length_secret_key];
        if (OQS_KEM_keypair(kem, pk, sk) != OQS_SUCCESS) {
            fprintf(stderr, "keygen failed\n");
            return 3;
        }

        char pk_hex[2 * sizeof(pk) + 1];
        char sk_hex[2 * sizeof(sk) + 1];
        hex_encode(pk, sizeof(pk), pk_hex);
        hex_encode(sk, sizeof(sk), sk_hex);
        printf("{\"pk\":\"%s\",\"sk\":\"%s\"}\n", pk_hex, sk_hex);

    } else if (strcmp(argv[1], "encaps") == 0) {
        if (argc != 3) { fprintf(stderr, "Usage: %s encaps <pkHex>\n", argv[0]); return 1; }

        uint8_t pk[OQS_KEM_ml_kem_768_length_public_key];
        if (hex_decode(argv[2], pk, sizeof(pk)) != 0) {
            fprintf(stderr, "invalid pk hex\n");
            return 4;
        }

        uint8_t ct[OQS_KEM_ml_kem_768_length_ciphertext];
        uint8_t ss[OQS_KEM_ml_kem_768_length_shared_secret];
        if (OQS_KEM_encaps(kem, ct, ss, pk) != OQS_SUCCESS) {
            fprintf(stderr, "encaps failed\n");
            return 3;
        }

        char ct_hex[2 * sizeof(ct) + 1];
        char ss_hex[2 * sizeof(ss) + 1];
        hex_encode(ct, sizeof(ct), ct_hex);
        hex_encode(ss, sizeof(ss), ss_hex);
        printf("{\"ct\":\"%s\",\"ss\":\"%s\"}\n", ct_hex, ss_hex);

    } else if (strcmp(argv[1], "decaps") == 0) {
        if (argc != 4) { fprintf(stderr, "Usage: %s decaps <skHex> <ctHex>\n", argv[0]); return 1; }

        uint8_t sk[OQS_KEM_ml_kem_768_length_secret_key];
        if (hex_decode(argv[2], sk, sizeof(sk)) != 0) {
            fprintf(stderr, "invalid sk hex\n");
            return 4;
        }

        uint8_t ct[OQS_KEM_ml_kem_768_length_ciphertext];
        if (hex_decode(argv[3], ct, sizeof(ct)) != 0) {
            fprintf(stderr, "invalid ct hex\n");
            return 4;
        }

        uint8_t ss[OQS_KEM_ml_kem_768_length_shared_secret];
        if (OQS_KEM_decaps(kem, ss, ct, sk) != OQS_SUCCESS) {
            fprintf(stderr, "decaps failed\n");
            return 3;
        }

        char ss_hex[2 * sizeof(ss) + 1];
        hex_encode(ss, sizeof(ss), ss_hex);
        printf("{\"ss\":\"%s\"}\n", ss_hex);

    } else {
        fprintf(stderr, "unknown command: %s\n", argv[1]);
        return 1;
    }

    OQS_KEM_free(kem);
    return 0;
}
