#include <node_api.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kem.h"
#include "params.h"

/* ── helpers ────────────────────────────────────────────────── */

/*
 * Read a Buffer / Uint8Array argument and require an exact byte length.
 *
 * The single-shot entry points copy fixed-size arrays out of whatever pointer
 * they are handed, so a short buffer is an out-of-bounds read rather than a
 * soft error: crypto_kem_dec() on a 1087-byte ciphertext would read one byte
 * past the view and its result would depend on adjacent heap memory. Every
 * pointer that crosses into the C side goes through this check.
 *
 * Returns NULL with a pending exception on failure.
 */
static uint8_t* get_buf_exact(napi_env env, napi_value val, size_t expected,
                              const char* label) {
    void* data = NULL;
    size_t len = 0;
    bool is_buf = false;

    if (napi_is_buffer(env, val, &is_buf) == napi_ok && is_buf) {
        if (napi_get_buffer_info(env, val, &data, &len) != napi_ok) data = NULL;
    } else {
        bool is_ta = false;
        if (napi_is_typedarray(env, val, &is_ta) == napi_ok && is_ta) {
            napi_typedarray_type type;
            size_t length = 0;
            void* tdata = NULL;
            napi_value ab;
            size_t off = 0;
            if (napi_get_typedarray_info(env, val, &type, &length, &tdata, &ab, &off) == napi_ok &&
                (type == napi_uint8_array || type == napi_uint8_clamped_array)) {
                data = tdata;
                len = length;
            }
        }
    }

    if (!data) {
        char msg[128];
        snprintf(msg, sizeof msg, "%s: expected a Buffer or Uint8Array", label);
        napi_throw_type_error(env, NULL, msg);
        return NULL;
    }
    if (len != expected) {
        char msg[192];
        snprintf(msg, sizeof msg, "%s: expected %zu bytes, got %zu", label, expected, len);
        napi_throw_range_error(env, NULL, msg);
        return NULL;
    }
    return (uint8_t*)data;
}

/* Same type validation as get_buf_exact, but reports the actual length so the
 * batch entry points can check it against their count argument. */
static uint8_t* get_buf_any(napi_env env, napi_value val, size_t* out_len,
                            const char* label) {
    void* data = NULL;
    size_t len = 0;
    bool is_buf = false;

    if (napi_is_buffer(env, val, &is_buf) == napi_ok && is_buf) {
        if (napi_get_buffer_info(env, val, &data, &len) != napi_ok) data = NULL;
    } else {
        bool is_ta = false;
        if (napi_is_typedarray(env, val, &is_ta) == napi_ok && is_ta) {
            napi_typedarray_type type;
            size_t length = 0;
            void* tdata = NULL;
            napi_value ab;
            size_t off = 0;
            if (napi_get_typedarray_info(env, val, &type, &length, &tdata, &ab, &off) == napi_ok &&
                (type == napi_uint8_array || type == napi_uint8_clamped_array)) {
                data = tdata;
                len = length;
            }
        }
    }

    if (!data) {
        char msg[128];
        snprintf(msg, sizeof msg, "%s: expected a Buffer or Uint8Array", label);
        napi_throw_type_error(env, NULL, msg);
        return NULL;
    }
    *out_len = len;
    return (uint8_t*)data;
}

/* Require at least `expected` arguments before touching args[]. */
static bool have_args(napi_env env, size_t argc, size_t expected, const char* label) {
    if (argc >= expected) return true;
    char msg[128];
    snprintf(msg, sizeof msg, "%s: expected %zu arguments, got %zu", label, expected, argc);
    napi_throw_type_error(env, NULL, msg);
    return false;
}

/**
 * Allocate an external buffer backed by `data` whose lifetime is managed
 * by the `finalize` callback.  JS sees a normal Buffer; the C side avoids
 * a copy.
 */
static napi_value external_buf(napi_env env, void* data, size_t len,
                               napi_finalize finalize) {
    napi_value buf;
    napi_create_external_buffer(env, len, data, finalize, NULL, &buf);
    return buf;
}

static void free_cb(napi_env env, void* data, void* hint) {
    (void)env; (void)hint;
    free(data);
}

/* ── single-shot (backward-compatible) ──────────────────────── */

static napi_value Keygen(napi_env env, napi_callback_info info) {
    (void)info;
    uint8_t pk[KYBER_PUBLICKEYBYTES];
    uint8_t sk[KYBER_SECRETKEYBYTES];
    crypto_kem_keypair(pk, sk);
    napi_value buf_pk, buf_sk, ret;
    napi_create_buffer_copy(env, KYBER_PUBLICKEYBYTES, pk, NULL, &buf_pk);
    napi_create_buffer_copy(env, KYBER_SECRETKEYBYTES, sk, NULL, &buf_sk);
    napi_create_array(env, &ret);
    napi_set_element(env, ret, 0, buf_pk);
    napi_set_element(env, ret, 1, buf_sk);
    return ret;
}

static napi_value KeygenDerand(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 1, "keygenDerand")) return NULL;
    uint8_t pk[KYBER_PUBLICKEYBYTES];
    uint8_t sk[KYBER_SECRETKEYBYTES];
    uint8_t* coins = get_buf_exact(env, args[0], 2 * KYBER_SYMBYTES, "keygenDerand coins");
    if (!coins) return NULL;
    crypto_kem_keypair_derand(pk, sk, coins);
    napi_value buf_pk, buf_sk, ret;
    napi_create_buffer_copy(env, KYBER_PUBLICKEYBYTES, pk, NULL, &buf_pk);
    napi_create_buffer_copy(env, KYBER_SECRETKEYBYTES, sk, NULL, &buf_sk);
    napi_create_array(env, &ret);
    napi_set_element(env, ret, 0, buf_pk);
    napi_set_element(env, ret, 1, buf_sk);
    return ret;
}

static napi_value Encaps(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 1, "encaps")) return NULL;
    uint8_t* pk = get_buf_exact(env, args[0], KYBER_PUBLICKEYBYTES, "encaps publicKey");
    if (!pk) return NULL;
    uint8_t ct[KYBER_CIPHERTEXTBYTES];
    uint8_t ss[KYBER_SSBYTES];
    crypto_kem_enc(ct, ss, pk);
    napi_value buf_ct, buf_ss, ret;
    napi_create_buffer_copy(env, KYBER_CIPHERTEXTBYTES, ct, NULL, &buf_ct);
    napi_create_buffer_copy(env, KYBER_SSBYTES, ss, NULL, &buf_ss);
    napi_create_array(env, &ret);
    napi_set_element(env, ret, 0, buf_ct);
    napi_set_element(env, ret, 1, buf_ss);
    return ret;
}

static napi_value EncapsDerand(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 2, "encapsDerand")) return NULL;
    uint8_t* pk = get_buf_exact(env, args[0], KYBER_PUBLICKEYBYTES, "encapsDerand publicKey");
    if (!pk) return NULL;
    uint8_t* coins = get_buf_exact(env, args[1], KYBER_SYMBYTES, "encapsDerand coins");
    if (!coins) return NULL;
    uint8_t ct[KYBER_CIPHERTEXTBYTES];
    uint8_t ss[KYBER_SSBYTES];
    crypto_kem_enc_derand(ct, ss, pk, coins);
    napi_value buf_ct, buf_ss, ret;
    napi_create_buffer_copy(env, KYBER_CIPHERTEXTBYTES, ct, NULL, &buf_ct);
    napi_create_buffer_copy(env, KYBER_SSBYTES, ss, NULL, &buf_ss);
    napi_create_array(env, &ret);
    napi_set_element(env, ret, 0, buf_ct);
    napi_set_element(env, ret, 1, buf_ss);
    return ret;
}

static napi_value Decaps(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 2, "decaps")) return NULL;
    uint8_t* ct = get_buf_exact(env, args[0], KYBER_CIPHERTEXTBYTES, "decaps ciphertext");
    if (!ct) return NULL;
    uint8_t* sk = get_buf_exact(env, args[1], KYBER_SECRETKEYBYTES, "decaps secretKey");
    if (!sk) return NULL;
    uint8_t ss[KYBER_SSBYTES];
    crypto_kem_dec(ss, ct, sk);
    napi_value buf_ss;
    napi_create_buffer_copy(env, KYBER_SSBYTES, ss, NULL, &buf_ss);
    return buf_ss;
}

/* ═══════════════════════════════════════════════════════════════
   BATCH API  —  one N-API call processes N operations internally
   eliminating ~150-200 µs of JS↔C overhead per operation.
   ═══════════════════════════════════════════════════════════════ */

/**
 * keygen_batch(count: number) -> { pk: Buffer, sk: Buffer, count: number }
 *
 * Returns a flat concatenated Buffer for each key type.
 * pk[i]  = pk_buf[i*PUBLICKEYBYTES .. (i+1)*PUBLICKEYBYTES-1]
 * sk[i]  = sk_buf[i*SECRETKEYBYTES .. (i+1)*SECRETKEYBYTES-1]
 */
static napi_value KeygenBatch(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 1, "keygen_batch")) return NULL;

    int64_t count;
    napi_get_value_int64(env, args[0], &count);
    if (count <= 0 || count > 100000) count = 1;

    size_t pk_total  = (size_t)count * KYBER_PUBLICKEYBYTES;
    size_t sk_total  = (size_t)count * KYBER_SECRETKEYBYTES;

    uint8_t *pk_buf = malloc(pk_total);
    uint8_t *sk_buf = malloc(sk_total);
    if (!pk_buf || !sk_buf) {
        free(pk_buf); free(sk_buf);
        napi_throw_error(env, NULL, "malloc failed");
        return NULL;
    }

    for (int64_t i = 0; i < count; i++) {
        crypto_kem_keypair(
            pk_buf + i * KYBER_PUBLICKEYBYTES,
            sk_buf + i * KYBER_SECRETKEYBYTES);
    }

    napi_value result, js_pk, js_sk, js_count;
    napi_create_object(env, &result);
    napi_set_named_property(env, result, "pk",
        external_buf(env, pk_buf, pk_total, free_cb));
    napi_set_named_property(env, result, "sk",
        external_buf(env, sk_buf, sk_total, free_cb));
    napi_create_int64(env, count, &js_count);
    napi_set_named_property(env, result, "count", js_count);
    return result;
}

/**
 * encaps_batch(pk_flat: Buffer, count: number)
 *   -> { ct: Buffer, ss: Buffer, count: number }
 *
 * pk_flat contains `count` concatenated public keys
 * (each KYBER_PUBLICKEYBYTES bytes).
 */
static napi_value EncapsBatch(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 2, "encaps_batch")) return NULL;

    size_t pk_total_len = 0;
    uint8_t* pk_flat = get_buf_any(env, args[0], &pk_total_len, "encaps_batch publicKeys");
    if (!pk_flat) return NULL;

    int64_t count;
    napi_get_value_int64(env, args[1], &count);
    if (count <= 0 || count > 100000) count = 1;

    if (pk_total_len != (size_t)count * KYBER_PUBLICKEYBYTES) {
        char msg[192];
        snprintf(msg, sizeof msg,
                 "encaps_batch publicKeys: expected %zu bytes for %lld keys, got %zu",
                 (size_t)count * KYBER_PUBLICKEYBYTES, (long long)count, pk_total_len);
        napi_throw_range_error(env, NULL, msg);
        return NULL;
    }

    size_t ct_total = (size_t)count * KYBER_CIPHERTEXTBYTES;
    size_t ss_total = (size_t)count * KYBER_SSBYTES;

    uint8_t *ct_buf = malloc(ct_total);
    uint8_t *ss_buf = malloc(ss_total);
    if (!ct_buf || !ss_buf) {
        free(ct_buf); free(ss_buf);
        napi_throw_error(env, NULL, "malloc failed");
        return NULL;
    }

    for (int64_t i = 0; i < count; i++) {
        crypto_kem_enc(
            ct_buf + i * KYBER_CIPHERTEXTBYTES,
            ss_buf + i * KYBER_SSBYTES,
            pk_flat + i * KYBER_PUBLICKEYBYTES);
    }

    napi_value result, js_ct, js_ss, js_count;
    napi_create_object(env, &result);
    napi_set_named_property(env, result, "ct",
        external_buf(env, ct_buf, ct_total, free_cb));
    napi_set_named_property(env, result, "ss",
        external_buf(env, ss_buf, ss_total, free_cb));
    napi_create_int64(env, count, &js_count);
    napi_set_named_property(env, result, "count", js_count);
    return result;
}

/**
 * decaps_batch(ct_flat: Buffer, sk_flat: Buffer, count: number)
 *   -> { ss: Buffer, count: number }
 */
static napi_value DecapsBatch(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 3, "decaps_batch")) return NULL;

    size_t ct_len = 0, sk_len = 0;
    uint8_t* ct_flat = get_buf_any(env, args[0], &ct_len, "decaps_batch ciphertexts");
    if (!ct_flat) return NULL;
    uint8_t* sk_flat = get_buf_any(env, args[1], &sk_len, "decaps_batch secretKeys");
    if (!sk_flat) return NULL;

    int64_t count;
    napi_get_value_int64(env, args[2], &count);
    if (count <= 0 || count > 100000) count = 1;

    if (ct_len != (size_t)count * KYBER_CIPHERTEXTBYTES) {
        char msg[192];
        snprintf(msg, sizeof msg,
                 "decaps_batch ciphertexts: expected %zu bytes for %lld items, got %zu",
                 (size_t)count * KYBER_CIPHERTEXTBYTES, (long long)count, ct_len);
        napi_throw_range_error(env, NULL, msg);
        return NULL;
    }
    if (sk_len != (size_t)count * KYBER_SECRETKEYBYTES) {
        char msg[192];
        snprintf(msg, sizeof msg,
                 "decaps_batch secretKeys: expected %zu bytes for %lld keys, got %zu",
                 (size_t)count * KYBER_SECRETKEYBYTES, (long long)count, sk_len);
        napi_throw_range_error(env, NULL, msg);
        return NULL;
    }

    size_t ss_total = (size_t)count * KYBER_SSBYTES;
    uint8_t *ss_buf = malloc(ss_total);
    if (!ss_buf) {
        napi_throw_error(env, NULL, "malloc failed");
        return NULL;
    }

    for (int64_t i = 0; i < count; i++) {
        crypto_kem_dec(
            ss_buf + i * KYBER_SSBYTES,
            ct_flat + i * KYBER_CIPHERTEXTBYTES,
            sk_flat + i * KYBER_SECRETKEYBYTES);
    }

    napi_value result, js_ss, js_count;
    napi_create_object(env, &result);
    napi_set_named_property(env, result, "ss",
        external_buf(env, ss_buf, ss_total, free_cb));
    napi_create_int64(env, count, &js_count);
    napi_set_named_property(env, result, "count", js_count);
    return result;
}

/**
 * roundtrip_batch(count: number)
 *   -> { ok: number, count: number, ss_sender: Buffer, ss_receiver: Buffer }
 *
 * Convenience: generates count keypairs, encaps + decaps each,
 * verifies shared secrets match.  Returns both ss buffers so
 * correctness can be checked from JS.
 */
static napi_value RoundtripBatch(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (!have_args(env, argc, 1, "roundtrip_batch")) return NULL;

    int64_t count;
    napi_get_value_int64(env, args[0], &count);
    if (count <= 0 || count > 100000) count = 1;

    size_t ss_total = (size_t)count * KYBER_SSBYTES;

    uint8_t *ss_sender   = malloc(ss_total);
    uint8_t *ss_receiver = malloc(ss_total);
    if (!ss_sender || !ss_receiver) {
        free(ss_sender); free(ss_receiver);
        napi_throw_error(env, NULL, "malloc failed");
        return NULL;
    }

    int64_t ok = 0;
    for (int64_t i = 0; i < count; i++) {
        uint8_t pk[KYBER_PUBLICKEYBYTES];   /* constant-size: MSVC has no VLA */
        uint8_t sk[KYBER_SECRETKEYBYTES];
        uint8_t ct[KYBER_CIPHERTEXTBYTES];
        uint8_t ss_e[KYBER_SSBYTES];
        uint8_t ss_d[KYBER_SSBYTES];

        crypto_kem_keypair(pk, sk);
        crypto_kem_enc(ct, ss_e, pk);
        crypto_kem_dec(ss_d, ct, sk);

        memcpy(ss_sender   + i * KYBER_SSBYTES, ss_e, KYBER_SSBYTES);
        memcpy(ss_receiver + i * KYBER_SSBYTES, ss_d, KYBER_SSBYTES);

        if (memcmp(ss_e, ss_d, KYBER_SSBYTES) == 0) ok++;
    }

    napi_value result, js_ss_s, js_ss_r, js_ok, js_count;
    napi_create_object(env, &result);
    napi_set_named_property(env, result, "ss_sender",
        external_buf(env, ss_sender, ss_total, free_cb));
    napi_set_named_property(env, result, "ss_receiver",
        external_buf(env, ss_receiver, ss_total, free_cb));
    napi_create_int64(env, ok, &js_ok);
    napi_set_named_property(env, result, "ok", js_ok);
    napi_create_int64(env, count, &js_count);
    napi_set_named_property(env, result, "count", js_count);
    return result;
}

/* ── init ───────────────────────────────────────────────────── */

napi_value Init(napi_env env, napi_value exports) {
    /* single-shot (backward-compatible) */
    #define FN(name, fn) do { \
        napi_value v; napi_create_function(env, NULL, 0, fn, NULL, &v); \
        napi_set_named_property(env, exports, name, v); \
    } while(0)

    FN("keygen", Keygen);
    FN("keygenDerand", KeygenDerand);
    FN("encaps", Encaps);
    FN("encapsDerand", EncapsDerand);
    FN("decaps", Decaps);

    /* batch API */
    FN("keygen_batch", KeygenBatch);
    FN("encaps_batch", EncapsBatch);
    FN("decaps_batch", DecapsBatch);
    FN("roundtrip_batch", RoundtripBatch);

    /* constants */
    #define NUM(name, val) do { \
        napi_value v; napi_create_uint32(env, val, &v); \
        napi_set_named_property(env, exports, name, v); \
    } while(0)

    NUM("PUBLICKEYBYTES",  KYBER_PUBLICKEYBYTES);
    NUM("SECRETKEYBYTES",  KYBER_SECRETKEYBYTES);
    NUM("CIPHERTEXTBYTES", KYBER_CIPHERTEXTBYTES);
    NUM("SSBYTES",         KYBER_SSBYTES);
    NUM("K",               KYBER_K);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
