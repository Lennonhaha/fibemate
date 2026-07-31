# 决策记录: WASM polyMul 回退

**编号**: DR-2026-05-31-001
**日期**: 2026-05-31
**状态**: 已执行

---

## 背景

ML-KEM-768 的 polyMul（多项式乘法，O(n²=65536)）是纯 JS 实现中计算最密集的操作。
WASM 恒定时间版本 `mlkem_ct_wasm.js` 提供 `poly_mul_ct`，理论可消除此热点。

尝试通过 `useWasm()` 补丁将 JS polyMul 替换为 WASM 版本。

## 问题

WASM `poly_mul_ct` 输出 Int32Array 系数带有大偏移量（如 -2.5e8），数学上正确（mod Q=3329 后与 JS 匹配），
但 **未做 mod-Q 内部规约**。Bridge 层需 JS 侧逐元素 `((raw[i] % Q) + Q) % Q` 规约后才能加载到 Int16Array。

## TVLA 对比

| 操作 | JS-only (N=3000) | WASM+JS (N=500) | 变化 |
|------|-----------------|-----------------|------|
| polyMul | \|t\|=2.80 PASS | \|t\|=4.79 FAIL | +1.99 |
| encapsulate | \|t\|=0.85 PASS | \|t\|=63.80 FAIL | +62.95 |
| decapsulate | \|t\|=0.81 PASS | \|t\|=115.11 FAIL | +114.30 |

## 根因

V8 对 `%` 运算符在负数大值和小正值之间耗时不同。每条消息 polyMul 调用多次：
- encapsulate: 至少 3 次
- decapsulate: 至少 3 次

累积效应导致 encapsulate/decapsulate 的 TVLA 严重恶化。

## 决策

**回退 WASM polyMul 补丁，保持纯 JS 实现。**

纯 JS ML-KEM-768 已通过 TVLA 15/15，足以满足当前安全需求。

## 未来计划

当 WASM 模块实现 mod-Q 内部规约后，可重新评估集成，绕过 JS `%` 运算符的时序泄漏。

## 执行项

- [x] `ml-kem-768.js` 回退到纯 JS 版本（从 .bak_wasm_v3_20260531 恢复）
- [x] 移除 `useWasm()` 方法及其引用
- [x] 添加决策注释到 ml-kem-768.js 顶部
- [x] KAT 一致性验证 20/20 PASS（pk=1184, ct=1088, ss=32）
- [x] 官网 index.html 更新状态描述（ML-KEM-768 纯 JS 实现 · TVLA 15/15）

## 相关文件

- `/opt/fibemate-full/www/crypto/ml-kem-768.js` — 纯 JS ML-KEM-768（生产版本）
- `/opt/fibemate-full/www/crypto/mlkem_ct_wasm.js` — WASM 模块（保留，待改进后重新评估）
- `/opt/fibemate-full/www/crypto/mlkem-ct-wasm-bridge-v3.js` — Bridge（保留）
- `wasm-polymul-decision_2026-05-31_0305.md` — 本地决策分析
