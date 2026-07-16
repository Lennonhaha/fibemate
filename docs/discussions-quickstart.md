# 快速开始

## 构建

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install
npm run build   # 编译 C addon
```

## 测试

```bash
npm test        # 全部测试
npm run test:crypto  # 密码学模块
npm run test:lgv2   # LookingGlass v2
```

## CI 流水线

GitHub Actions 自动在每次 Push/PR 时运行:
- **CI**: node-test (单元测试) + docs-check (格式检查)
- **Nightly**: kat-smoke (KAT 10,000) + wasm-build (Rust 编译)
- **Release**: npm publish 发布包

本地验证 CI 等效:
```bash
npm ci          # 与 CI 环境一致的依赖安装
npm test        # 等效于 CI node-test
```

## 许可证
GNU GPLv3