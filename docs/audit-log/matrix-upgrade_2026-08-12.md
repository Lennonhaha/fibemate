# LG v2.2 矩阵模拟升级 — 2026-08-12 06:28 CST

## 背景
Python 模拟原先用 XOR+S-box 模型，与真实 LG v2.2 (Rust) 的 Kronecker+sparse-offset 模型不一致。
本次升级将 Python 模拟精确对齐 Rust 实现 (matrices.rs + lib.rs)。

## 新增文件

### simulate_lg_matrix.py (280行)
- 7 层不可约群表示 Kronecker 乘积 → 48×48 活跃子空间
- expand_to_256() with identity padding → 256×256 全局矩阵
- Barrett reduction (wrapping, branchless, 匹配 Rust barrett_reduce)
- SplitMix64 PRNG (匹配 matrices.rs random_permutation)
- apply_forward / apply_inverse / roundtrip_test (API 匹配 WASM 导出)

## 验证结果

| 测试 | 结果 | 说明 |
|------|:---:|------|
| Python 矩阵 roundtrip | 100/100 | 完全对齐 WASM (256×256 Kronecker mod Q) |
| determinism | 256/256 | 同 perm+offset → 同输出 |
| session uniqueness | 48/256 diff | 不同 perm → 48 维活跃子空间不同 |
| 同 session 攻击 | 1/1 恢复成功 | 拿到 M+offset 即可逆变换 |
| 跨 session 攻击 | 0/99 恢复 | perm-dependent (session diversity 防御有效) |

## 攻击链

```
collect-samples.py → fit-mapping-matrix.py → deobfuscate.py
   (256×256矩阵)     (M+offset 恢复)          (decryption)
```

## 关键结论

1. **Python 模拟已对齐 Rust 真实实现** — 不再用 XOR+S-box 模型
2. **同 session 可完全破解** — 攻击者拿到同 session N≥1 对 plain/cipher 即可恢复 M+offset
3. **跨 session 不可行** — 需要重新采集 (perm+offset 随机)
4. **攻击难度取决于 session 切换频率** — 若每请求新 session → 攻击者需逐请求采集
5. **旧 XOR+S-box 模型仍保留在 `attack/collect-samples.py.old`** — 用于对比实验

## 文件状态

```
experimental/vwz-lg/attack/
├── simulate_lg_matrix.py   (NEW) — Kronecker+sparse-offset 精确模拟
├── collect-samples.py      (UPDATED) — 导入 simulate_lg_matrix.py
├── fit-mapping-matrix.py   (NEW) — 256×256 仿射矩阵恢复
├── fit-mapping.py          (旧) — XOR+S-box 逐字节查表 (已过时)
├── deobfuscate.py          (待更新) — 改用 apply_inverse()
├── angr-branch-enum.py     (同) — 符号执行 (实验性)
├── wasm-trace.js           (同) — Node.js WASM 追踪
├── test-real-wasm-v2.js    (同) — WASM 动态验证
├── test-real-wasm.js       (同) — WASM 动态验证
├── lg-trace.js             (同) — Frida 追踪脚本
├── real-wasm-findings.md   (同) — 真实 WASM 验证报告
└── run.sh                  (同) — 一键执行
```
