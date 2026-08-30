> **VWZ & LookingGlass 实验研究线**（默认关闭，无安全保证）。
>
> 主分支（生产代码 · 标准 PQC 库 · 国密 · FPGA · TLA+ 形式化验证）请回 [`main`](https://github.com/Lennonhaha/fibemate)。

[![CI](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml/badge.svg?branch=experimental/vwz-lg)](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml?query=branch%3Aexperimental%2Fvwz-lg)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Branch: experimental/vwz-lg](https://img.shields.io/badge/branch-experimental%2Fvwz--lg-orange.svg)](https://github.com/Lennonhaha/fibemate/tree/experimental/vwz-lg)
[![Status: research only](https://img.shields.io/badge/status-research%20only-red.svg)](#-%E5%A3%B0%E6%98%8E)

> ⚠️ **本分支为孤立研究线**：未经安全审计，**不应与主分支生产代码混合**。所有实验模块默认关闭，需显式启用。

## 内容

- **VWZ 签名**: `rust/vwz-sign-wasm/` + `scripts/vwz-148-test.js`
- **LookingGlass v2.3**: `www/crypto/lgv2/`（lgv2_3.js + wasm + d.ts + 可视化 ×7）
- **FPGA VWZ RTL**: `fpga/rtl/vwz/`（lambda ROM + 测试台）
- **安全评估**: `security-assessment/`（attack/ · evidence/ · fix/）
- **研究文档**: `docs/vwz-*.md` + `research/lgv2/`
- **散落资源**: `papers/vwz-eprint-2026.pdf`（ePrint 已退回）+ `www/docs/tsa/` 下 15 份 TSR 存证

## 运行测试

```bash
node scripts/vwz-148-test.js
```

## ⚠️ 声明

此分支为实验性研究代码，未经安全审计，**不应应用于生产环境**。

- **VWZ 签名方案**基于全新硬度假设 **VMQ-SPARSE**，无标准归约证明，ePrint 投稿已被退回。
- **LookingGlass** 是代数群表示二进制混淆实验工具，**不是密码学安全原语**，不增强 LWE 硬度，仅供教学/硬件自测。

完整安全评估与威胁模型请见主分支 [`SECURITY.md`](https://github.com/Lennonhaha/fibemate/blob/main/SECURITY.md) 与 [`docs/vwz-security-analysis-framework.md`](https://github.com/Lennonhaha/fibemate/tree/main/docs/vwz-security-analysis-framework.md)（如不存在请改看主分支 docs/）。
