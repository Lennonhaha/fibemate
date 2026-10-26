// SPDX-License-Identifier: Apache-2.0
// Source: pq-crystals/kyber (ref/), originally dual-licensed CC0-1.0 OR Apache-2.0
// Vendored: 2026-07-22 (FIBEMATE commit 59a00bd); upstream ref/ snapshot not pinned to a single commit
//
// Deviations from upstream ref/randombytes.c:
//   - returns an error code instead of abort()ing, so the addon can surface a
//     JS exception rather than killing the host process (fail closed either way:
//     no key is ever produced from an unwritten buffer);
//   - uses getrandom(2) on Linux and O_CLOEXEC on the /dev/urandom fallback;
//   - zeroises the caller's buffer on every failure path.
#if !defined(_WIN32) && !defined(_DEFAULT_SOURCE)
#define _DEFAULT_SOURCE 1 /* getrandom(2) under a strict -std=c11 */
#endif

#include <stdint.h>
#include <stddef.h>
#include <errno.h>
#include <limits.h>

#ifdef _WIN32
#include <windows.h>
#include <bcrypt.h>
#pragma comment(lib, "bcrypt.lib")
#else
#include <fcntl.h>
#include <unistd.h>
#endif

#ifdef __linux__
#include <sys/random.h>
#endif

#include "randombytes.h"

/* Test-only hook: never compiled into production builds. */
#ifdef FIBEMATE_RNG_FAULT_INJECT
int fibemate_rng_fault_inject = 0;
#endif

/* Overwrite without giving the optimiser a reason to elide the store. */
static void secure_zero(void *p, size_t n)
{
    volatile uint8_t *v = (volatile uint8_t *)p;
    while (n--) {
        *v++ = 0;
    }
}

static int fail(uint8_t *buf, size_t n)
{
    secure_zero(buf, n);
    return RANDOMBYTES_FAILURE;
}

#ifdef _WIN32

int randombytes(uint8_t *buf, size_t n)
{
    if (buf == NULL) return RANDOMBYTES_FAILURE;
    if (n == 0) return RANDOMBYTES_SUCCESS;

#ifdef FIBEMATE_RNG_FAULT_INJECT
    if (fibemate_rng_fault_inject) return fail(buf, n);
#endif

    /* BCryptGenRandom takes ULONG; chunk anything larger than that. */
    size_t done = 0;
    while (done < n) {
        size_t chunk = n - done;
        if (chunk > (size_t)ULONG_MAX) chunk = (size_t)ULONG_MAX;
        NTSTATUS status = BCryptGenRandom(NULL, (PUCHAR)(buf + done), (ULONG)chunk,
                                          BCRYPT_USE_SYSTEM_PREFERRED_RNG);
        if (!BCRYPT_SUCCESS(status)) return fail(buf, n);
        done += chunk;
    }
    return RANDOMBYTES_SUCCESS;
}

#else /* POSIX */

int randombytes(uint8_t *buf, size_t n)
{
    if (buf == NULL) return RANDOMBYTES_FAILURE;
    if (n == 0) return RANDOMBYTES_SUCCESS;

#ifdef FIBEMATE_RNG_FAULT_INJECT
    if (fibemate_rng_fault_inject) return fail(buf, n);
#endif

#if defined(__linux__)
    /* Preferred path: the kernel CSPRNG, no file descriptor to leak or inherit. */
    {
        size_t pos = 0;
        int unavailable = 0;
        while (pos < n) {
            ssize_t r = getrandom(buf + pos, n - pos, 0);
            if (r < 0) {
                if (errno == EINTR) continue;
                unavailable = 1; /* ENOSYS on old kernels, EPERM under some seccomp */
                break;
            }
            if (r == 0) { unavailable = 1; break; }
            pos += (size_t)r;
        }
        if (!unavailable) return RANDOMBYTES_SUCCESS;
    }
#endif

    {
        int flags = O_RDONLY;
#ifdef O_CLOEXEC
        flags |= O_CLOEXEC;
#endif
        int fd = open("/dev/urandom", flags);
        if (fd < 0) return fail(buf, n);

        size_t pos = 0;
        while (pos < n) {
            ssize_t r = read(fd, buf + pos, n - pos);
            if (r < 0) {
                if (errno == EINTR) continue;
                close(fd);
                return fail(buf, n);
            }
            if (r == 0) { /* EOF on a CSPRNG means it is broken, not "try again" */
                close(fd);
                return fail(buf, n);
            }
            pos += (size_t)r;
        }
        if (close(fd) != 0) return fail(buf, n);
    }
    return RANDOMBYTES_SUCCESS;
}

#endif
