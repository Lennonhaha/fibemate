// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 FIBEMATE Contributors
//
// Control for #344: when the CSPRNG fails, key generation must fail and every
// output must be zeroised. Built only with -DFIBEMATE_RNG_FAULT_INJECT, which
// is never enabled for the shipped addon.
#include <stdio.h>
#include <string.h>
#include <stdint.h>

#include "kem.h"
#include "params.h"

#ifndef FIBEMATE_RNG_FAULT_INJECT
#error "build this control with -DFIBEMATE_RNG_FAULT_INJECT"
#endif

extern int fibemate_rng_fault_inject;

static int all_zero(const uint8_t *p, size_t n)
{
    for (size_t i = 0; i < n; i++) {
        if (p[i] != 0) return 0;
    }
    return 1;
}

int main(void)
{
    uint8_t pk[KYBER_PUBLICKEYBYTES];
    uint8_t sk[KYBER_SECRETKEYBYTES];
    uint8_t ct[KYBER_CIPHERTEXTBYTES];
    uint8_t ss[KYBER_SSBYTES];
    int failures = 0;

    /* Positive control: with a healthy source the same code path must succeed,
       otherwise the failure assertions below would prove nothing. */
    memset(pk, 0xA5, sizeof(pk));
    memset(sk, 0x5A, sizeof(sk));
    if (crypto_kem_keypair(pk, sk) != 0) {
        printf("FAIL control: keypair failed with a working source\n");
        failures++;
    }
    if (all_zero(pk, sizeof(pk)) || all_zero(sk, sizeof(sk))) {
        printf("FAIL control: keypair produced all-zero output\n");
        failures++;
    }

    /* Forced failure: keypair must report it and must not leak a key. */
    fibemate_rng_fault_inject = 1;

    memset(pk, 0xA5, sizeof(pk));
    memset(sk, 0x5A, sizeof(sk));
    if (crypto_kem_keypair(pk, sk) == 0) {
        printf("FAIL keypair: returned success while randombytes failed\n");
        failures++;
    }
    if (!all_zero(pk, sizeof(pk))) {
        printf("FAIL keypair: public key was not zeroised\n");
        failures++;
    }
    if (!all_zero(sk, sizeof(sk))) {
        printf("FAIL keypair: secret key was not zeroised\n");
        failures++;
    }

    /* Forced failure: encapsulation must report it and must not leak a secret. */
    memset(pk, 0x11, sizeof(pk));
    memset(ct, 0xA5, sizeof(ct));
    memset(ss, 0x5A, sizeof(ss));
    if (crypto_kem_enc(ct, ss, pk) == 0) {
        printf("FAIL enc: returned success while randombytes failed\n");
        failures++;
    }
    if (!all_zero(ct, sizeof(ct))) {
        printf("FAIL enc: ciphertext was not zeroised\n");
        failures++;
    }
    if (!all_zero(ss, sizeof(ss))) {
        printf("FAIL enc: shared secret was not zeroised\n");
        failures++;
    }

    /* Recovery: clearing the fault restores normal operation. */
    fibemate_rng_fault_inject = 0;
    if (crypto_kem_keypair(pk, sk) != 0) {
        printf("FAIL recovery: keypair still failing after fault cleared\n");
        failures++;
    }

    if (failures == 0) {
        printf("PASS: 4 failure-path assertions + 2 controls\n");
    }
    return failures == 0 ? 0 : 1;
}
