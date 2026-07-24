
---

## 5. SM3 Hash Benchmark (补充: 2026-07-25 03:51)

**环境**: Windows 11, Ryzen 5 5600U, Node 20.17, 10000 iterations

| 操作 | 数据大小 | 延迟 | 吞吐量 |
|:---|:---|:---|:---|
| SM3 digestHex | 3 B ("abc") | 47.01 µs | 21,272 ops/s |
| SM3 digest | 1,140 B | 221.91 µs | 4,506 ops/s |

**备注**: SM3 (~5 KB/s @ 1KB) — 纯 JS 实现，适合教育/验证用途。

---

## 6. SM4-GCM Benchmark (补充: 2026-07-25 03:51)

**环境**: 同上, 10000 iterations, 128-bit 密钥

| 操作 | 数据大小 | 延迟 | 吞吐量 |
|:---|:---|:---|:---|
| SM4-GCM encrypt | 10 字符 | 204.97 µs | 4,879 ops/s |
| SM4-GCM encrypt | 2,300 字符 | 9,971.14 µs | 100 ops/s |
| SM4-GCM decrypt | 10 字符 | 124.53 µs | 8,030 ops/s |

**备注**: SM4-GCM 约 230 KB/s (encrypt) — 纯 JS GCM 实现，用于完整性/正确性验证。
