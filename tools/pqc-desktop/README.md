# FIBEMATE PQC Desktop

> **状态：未完工骨架（不部署）**

## 说明

本目录是 FIBEMATE 桌面客户端（Electron）的早期骨架，目前**仅含 4 个文件**：

- `main.js` — 主进程入口
- `preload.js` — 预加载脚本
- `nav.html` — 导航页
- `package.json` — 依赖清单

## 为什么不部署

1. **构建配置引用缺失**：`package.json` 的 `build.files` 引用了 `assets/**`、`content/**`、`lib/**`，但这些目录**尚未提交**，当前无法通过 `electron-builder` 构建。
2. **依赖冻结**：`electron` 固定于 `^28.0.0`（2023-12），尚未跟进 39.x 大版本升级（存在 breaking changes）。
3. **不属于 PQC 核心库**：桌面端是可选展示层，不阻塞 8/31 开源主线。

## 处理约定

- 在 `.github/dependabot.yml` 中已将 `electron` 加入 `ignore`，暂不自动升级。
- 待桌面客户端正式立项开发时，再评估 Electron 版本升级与目录补全。
