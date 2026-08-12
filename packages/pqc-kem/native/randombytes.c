#include <stdint.h>
#include <stddef.h>

#ifdef _WIN32
#include <windows.h>
#include <bcrypt.h>
#pragma comment(lib, "bcrypt.lib")
#else
#include <fcntl.h>
#include <unistd.h>
#endif

void randombytes(uint8_t *buf, size_t n)
{
    if (!buf || n == 0) return;

#ifdef _WIN32
    BCryptGenRandom(NULL, (PUCHAR)buf, (ULONG)n, BCRYPT_USE_SYSTEM_PREFERRED_RNG);
#else
    /* read from /dev/urandom — thread-safe, non-blocking */
    static int fd = -1;
    if (fd < 0) {
        fd = open("/dev/urandom", O_RDONLY);
        if (fd < 0) {
            /* catastrophic: cannot open entropy source */
            return;
        }
    }
    size_t pos = 0;
    while (pos < n) {
        ssize_t r = read(fd, buf + pos, n - pos);
        if (r < 0) continue;  /* EINTR — retry */
        pos += (size_t)r;
    }
#endif
}
