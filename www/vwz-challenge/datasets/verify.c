/* SPDX-License-Identifier: GPL-3.0-only */
/*
 * VWZ Challenge Verification Script (C verifier)
 *
 * Standalone reimplementation of datasets/verify.py for q=65537.
 * Reads a published public key (vwz-challenge-k4.json) plus a submitted
 * solution and returns VERIFIED / REJECTED.
 *
 * Build:  cc -O2 -o verify verify.c
 * Usage:  ./verify <solution.json>
 *         (public key is read from vwz-challenge-k4.json in CWD)
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define Q 65537
#define NT 9          /* T[i1] dimension: 2*k+1 with k=4 */

static long modl(long x) { x %= Q; if (x < 0) x += Q; return x; }

/* ---- minimal JSON extraction (no external deps) ----
 * The dataset layout is fixed; we parse by simple scanning rather than a
 * full JSON parser. */

static const char *skip_ws(const char *p) {
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    return p;
}

/* find a quoted key, return pointer just past the ':' */
static const char *find_key(const char *doc, const char *key) {
    const char *p = doc;
    size_t kl = strlen(key);
    while ((p = strstr(p, key)) != NULL) {
        /* key includes its surrounding quotes: p[kl-1] is the closing quote,
         * p[kl] is the char right after it (expect ':'). */
        if (p[kl] == ':') {
            return skip_ws(p + kl + 1);
        }
        p += kl;
    }
    return NULL;
}

/* parse an int list starting at '['; returns pointer past closing ']' */
static const char *parse_int_list(const char *p, long *out, int maxn, int *nout) {
    int n = 0;
    p++; /* skip [ */
    for (;;) {
        p = skip_ws(p);
        if (*p == ']') { p++; break; }
        if (*p == ',' || *p == ' ') { p++; continue; }
        long v = 0; int neg = 0;
        if (*p == '-') { neg = 1; p++; }
        while (*p >= '0' && *p <= '9') { v = v * 10 + (*p - '0'); p++; }
        if (neg) v = -v;
        if (n < maxn) out[n++] = v;
        p = skip_ws(p);
        if (*p == ',') { p++; continue; }
        if (*p == ']') { p++; break; }
    }
    *nout = n;
    return p;
}

/* Global flat sink for nested-array parsing (row-major fill). */
static long *G_OUT; static int G_CAP; static int G_N;
static const char *parse_nested(const char *p) {
    p++; /* skip [ */
    for (;;) {
        p = skip_ws(p);
        if (*p == ']') { p++; break; }
        if (*p == ',') { p++; continue; }
        if (*p == '[') {
            p = parse_nested(p);
        } else {
            long v = 0; int neg = 0;
            if (*p == '-') { neg = 1; p++; }
            while (*p >= '0' && *p <= '9') { v = v*10 + (*p-'0'); p++; }
            if (neg) v = -v;
            if (G_N < G_CAP) G_OUT[G_N++] = v;
        }
    }
    return p;
}

/* parse a JSON string starting at '"' into buf */
static const char *parse_string(const char *p, char *buf, int buflen) {
    p++; /* skip opening " */
    int i = 0;
    while (*p && *p != '"' && i < buflen - 1) {
        if (*p == '\\' && *(p+1) == 'n') { buf[i++] = '\n'; p += 2; continue; }
        if (*p == '\\' && *(p+1) == 't') { buf[i++] = '\t'; p += 2; continue; }
        buf[i++] = *p++;
    }
    buf[i] = '\0';
    if (*p == '"') p++;
    return p;
}

/* xorshift RNG mirroring verify.py (advances on every call) */
typedef struct { unsigned long long state; } XS;
static unsigned long long xs_n(XS *r) {
    unsigned long long x = r->state;
    x ^= (x << 13) & 0xFFFFFFFFFFFFFFFFULL;
    x ^= (x >> 7);
    x ^= (x << 17) & 0xFFFFFFFFFFFFFFFFULL;
    r->state = x;
    return x;
}

/* FNV-1a + xorshift (mirrors verify.py hash_to_sphere exactly) */
static void hash_to_sphere(const char *msg, long t[9]) {
    unsigned long long h = 0xcbf29ce484222325ULL;
    h ^= 0xABCDULL;
    for (const char *c = msg; *c; c++) {
        h ^= (unsigned char)*c;
        h *= 0x100000001b3ULL;
    }
    XS rng; rng.state = h ? h : 1ULL;
    int pos[5]; int pc = 0;
    while (pc < 5) {
        long r = (long)(xs_n(&rng) % 9ULL);
        int dup = 0;
        for (int i = 0; i < pc; i++) if (pos[i] == (int)r) dup = 1;
        if (!dup) pos[pc++] = (int)r;
    }
    for (int i = 0; i < 9; i++) t[i] = 0;
    /* sort positions so value assignment order is deterministic and identical
     * across the Python/JS/C ports (avoid set-iteration-order divergence). */
    for (int a = 0; a < 5; a++)
        for (int b = a + 1; b < 5; b++)
            if (pos[b] < pos[a]) { int tmp = pos[a]; pos[a] = pos[b]; pos[b] = tmp; }
    for (int i = 0; i < 5; i++) t[pos[i]] = (modl((long)(xs_n(&rng) % 65536ULL)) + 1);
}

int main(int argc, char **argv) {
    if (argc < 2) {
        printf("Usage: verify <solution.json>\n");
        return 1;
    }

    FILE *fk = fopen("vwz-challenge-k4.json", "rb");
    if (!fk) { printf("REJECTED (cannot open vwz-challenge-k4.json)\n"); return 1; }
    fseek(fk, 0, SEEK_END); long fsz = ftell(fk); fseek(fk, 0, SEEK_SET);
    char *ds = malloc(fsz + 1);
    fread(ds, 1, fsz, fk); ds[fsz] = '\0'; fclose(fk);

    long T[9*5*5];
    const char *kp = find_key(ds, "\"public_key\"");
    if (!kp) { printf("REJECTED (no public_key)\n"); free(ds); return 1; }
    G_OUT = T; G_CAP = 9*5*5; G_N = 0;
    parse_nested(kp);

    FILE *fs = fopen(argv[1], "rb");
    if (!fs) { printf("REJECTED (cannot open solution)\n"); free(ds); return 1; }
    fseek(fs, 0, SEEK_END); long ssz = ftell(fs); fseek(fs, 0, SEEK_SET);
    char *sol = malloc(ssz + 1);
    fread(sol, 1, ssz, fs); sol[ssz] = '\0'; fclose(fs);
    (void)fsz;

    long w2[5], w3[5]; int n2, n3;
    const char *sp = find_key(sol, "\"w2\"");
    if (!sp) { printf("REJECTED (no w2)\n"); free(ds); free(sol); return 1; }
    parse_int_list(sp, w2, 5, &n2);
    sp = find_key(sol, "\"w3\"");
    if (!sp) { printf("REJECTED (no w3)\n"); free(ds); free(sol); return 1; }
    parse_int_list(sp, w3, 5, &n3);

    char msg[256];
    const char *mp = find_key(sol, "\"msg\"");
    if (mp && *mp == '"') parse_string(mp, msg, sizeof(msg));
    else strcpy(msg, "TEST");

    long tgt[9];
    hash_to_sphere(msg, tgt);
    if (getenv("VWZ_DEBUG")) {
        printf("w2="); for (int i=0;i<5;i++) printf("%ld ", w2[i]); printf("\n");
        printf("w3="); for (int i=0;i<5;i++) printf("%ld ", w3[i]); printf("\n");
        printf("msg=%s\n", msg);
    }

    int ok = 1;
    if (getenv("VWZ_DEBUG")) {
        printf("T[0..4]=%ld %ld %ld %ld %ld\n", T[0],T[1],T[2],T[3],T[4]);
        printf("T[25..29]=%ld %ld %ld %ld %ld\n", T[25],T[26],T[27],T[28],T[29]);
        printf("w2="); for (int i=0;i<5;i++) printf("%ld ", w2[i]); printf("\n");
        printf("w3="); for (int i=0;i<5;i++) printf("%ld ", w3[i]); printf("\n");
        for (int i1 = 0; i1 < 9; i1++) {
            long s = 0;
            for (int i2 = 0; i2 < 5; i2++)
                for (int i3 = 0; i3 < 5; i3++)
                    s = (long)( ((long long)s + ((long long)T[i1*25 + i2*5 + i3] * w2[i2] % Q) * w3[i3] % Q) % Q );
            printf("i1=%d s=%ld tgt=%ld\n", i1, s, tgt[i1]);
        }
    }
    for (int i1 = 0; i1 < 9; i1++) {
        long s = 0;
        for (int i2 = 0; i2 < 5; i2++) {
            for (int i3 = 0; i3 < 5; i3++) {
                /* full 64-bit accumulation to avoid 32-bit long overflow
                 * (T*w2 can reach 65536*65536 ~= 4.29e9 > LONG_MAX on Windows) */
                s = (long)( ((long long)s + ((long long)T[i1*25 + i2*5 + i3] * w2[i2] % Q) * w3[i3] % Q) % Q );
            }
        }
        if (s != tgt[i1]) { ok = 0; break; }
    }

    printf(ok ? "VERIFIED\n" : "REJECTED\n");
    free(ds); free(sol);
    return ok ? 0 : 1;
}
