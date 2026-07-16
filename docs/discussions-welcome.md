# 欢迎来到 FIBEMATE 社区

## 关于 FIBEMATE

FIBEMATE 是一个全栈后量子密码学工程验证平台，聚焦三条技术线：
- **标准 PQC**: ML-KEM-768 + SLH-DSA (生产就绪)
- **国密混合**: SM2/SM3/SM4 + ML-KEM (双轨路上线)
- **前沿研究**: LookingGlass v2, VWZ 签名 (默认关闭)

## 快速链接

- [架构讨论](discussions-architecture.md) - 核心技术架构
- [CI/CD 流水线](discussions-architecture.md#cicd-流水线) - 构建与发布流程
- [PQC 就绪状态](pqc-readiness.html) - 密码学模块验证状态
- [GitHub](https://github.com/Lennonhaha/fibemate) - 源码与 issue

## 如何参与

1. 查看 [Good First Issues](good-first-issues.md) 找入门任务
2. 阅读 BUILD.md 了解本地构建
3. 提交 PR 前运行 npm test

## 构建说明

- 优先使用 npm ci (基于 lockfile，跨平台一致)
- Windows: npm ci 自动处理 node-gyp C++ 编译
- CI 由 GitHub Actions 驱动，见 .github/workflows/

## 许可证

GNU GPLv3 - 见 LICENSE 文件

*Welcome to the post-quantum future.*