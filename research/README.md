# FIBEMATE Research Archive

本目录包含 FIBEMATE 的**探索性研究代码**，与 production 加密主干（ML-KEM-768 / SLH-DSA / SM2）**完全隔离**。

## 隔离原则

1. **默认关闭**：研究模块不接入生产加密链路，需显式启用（ENABLE_LOOKINGGLASS=true）。
2. **无安全增益声明**：研究代码不声称提升底层 LWE/BKZ 破解难度。
3. **独立仓库**：干净版本已迁移至 Lennonhaha/lookingglass-v2（从 lgv2_v222/）。
4. **本地保留**：本目录代码仅用于复现实验、教学演示、硬件验证，不保证与生产环境兼容。

## 目录内容

| 路径 | 说明 | 状态 |
|------|------|------|
| esearch/lgv2/ | LookingGlass v2.1 研究线（Rust/C/非线性实验） | 已归档 |
| esearch/lgv2/rust/ | Rust + WASM 实现（含非线性 sbox 实验） | 实验性 |
| esearch/lgv2/nonlinear/ | 非线性层实验（sbox.inc, nonlinear_layer.v） | 已否决 |
| esearch/lgv2-v2_1/ | LookingGlass v2.1 WASM（48.5KB，旧版） | 历史记录 |

## 文档说明

- lgv2/docs/crypto-trap.md — 密码学安全声称的陷阱分析
- lgv2/docs/research-demo.md — 研究演示说明
- lgv2/docs/teaching-case.md — 线性代数教学案例

## 生产部署

- 部署路径：www/crypto/lgv2/（WASM，20.2KB）
- 启用标志：ENABLE_LOOKINGGLASS 环境变量（默认 false）
- 安全模型：参见 www/docs/pqc-readiness.html 第 7 节

> **警告**：本目录代码不代表 FIBEMATE 生产安全标准。生产环境仅使用 FIPS 203/205 + OSCCA 算法。

*最后更新：2026-07-16*
