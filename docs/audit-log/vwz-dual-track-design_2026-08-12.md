# VWZ 双线并行设计 — 启动记录

**日期**: 2026-08-12 07:55 GMT+8 | **状态**: ✅ 设计文档完成  
**分支**: `experimental/vwz-lg` | **Commit**: `693a18dc`

---

## 双线产出

| 线 | 文档 | 核心结论 |
|:---:|------|------|
| **A** 盲签名 | `docs/vwz-blind-signature-design.md` | Fischlin 框架适配可行，k=8 甜点 ~2.3KB（所有 PQ 盲签名最紧凑） |
| **B** 编码移植 | `docs/vwz-coding-theory-migration.md` | Vandermonde = Goppa 码 g=1 退化形式，建议做结构对比非直接移植 |

## 关键洞察

**A 线**：VWZ 的 Vandermonde 矩阵可逆性使得 HVZK 模拟器构造极为自然（给定(c,r')直接算出 commit'），这是 VWZ 结构在 Fischlin 框架下的天然优势。

**B 线**：纯 Vandermonde (g=1) 在编码理论中从不用于实际 Goppa 码——因为纠错能力退化。这意味着 VWZ 不是 Goppa 码的"特例"，而是 "Goppa 码的退化极限"。建议小心措辞，避免"基于编码理论的 VWZ"的过度声明。

## 8/31 前冻结纪律

| 项目 | 状态 |
|------|:---:|
| 分支隔离 | ✅ experimental/vwz-lg |
| 设计文档入仓 | ✅ 693a18dc |
| 代码实现 | ⏸️ 8/31 后 |
| 不触及 main | ✅ 仅同步设计文档至 exp 分支 |

## 服务器验证

```
main:               5e302395
experimental/vwz-lg: 693a18dc
VWZ tensor:         HTTP 200
LG tensor:          HTTP 200
symlink:            www/vwz-tensor → /var/www/html/vwz-tensor ✅
```
