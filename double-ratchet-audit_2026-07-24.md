# 双棘轮溯源报告 2026-07-24

## 双棘轮架构

| 组件 | 文件 | Git 状态 | 说明 |
|------|------|----------|------|
| **P-256 双棘轮** | `double-ratchet.js` | 🔴 `.gitignore` 排除 | 基础层，P-256 ECDH 标准双棘轮 |
| **PQ 混合层** | `double-ratchet-pq.js` | ✅ Git 跟踪 | ML-KEM-768 初始握手 + P-256 消息棘轮 |
| **修复脚本** | `scripts/fix-ratchet.js` | 🔴 未入 git | 修复 require 路径（addon→JS fallback） |

## 架构关系

```
double-ratchet-pq.js (436行)
├── require('./double-ratchet')      ← P-256 基类，.gitignored
├── require('./packages/pqc-kem/...') ← ML-KEM-768，已入仓
└── 每100条消息触发一次 PQ re-key
```

`fix-ratchet.js` 做的修复：把硬编码 `require('./addon/build/Release/mlkem.node')` 和 `require('./double-ratchet')` 改为 try/catch fallback，使代码在无 native addon 或无 double-ratchet.js 时也能优雅降级。

## 官网描述

| 位置 | 描述 |
|------|------|
| `www/index.html` 英雄区 | "Three lines to say it: post-quantum handshake, double ratchet, mixnet." |
| `www/index.html` 功能卡片 | "Double Ratchet" (第827行、第973行) |
| 白皮书 | "Layer 4: 双棘轮 (Double Ratchet + ML-KEM-768)" |
| TSR 快照 (2026-05-20) | "PQ Double Ratchet" + `double-ratchet-pq.js` TSA 存证 |

## GitHub 描述

| 位置 | 描述 |
|------|------|
| **README.md** | ❌ **零提及** "ratchet" 或 "双棘轮" |
| 仓库 about/description | 未检查 |
| GitHub topics | 未检查 |

README 有 10 处匹配 `ratchet|DR|X3DH|handshake` 但全是 "X3DH" 或 "handshake" — 没有任何一处直接说 "double ratchet" 或 "双棘轮"。

## 发现

1. **`double-ratchet.js` (P-256 基类) 被 `.gitignore` 排除** — 官网展示的 "Double Ratchet" 功能卡片指向一个未开源的文件
2. **`double-ratchet-pq.js` (PQ 混合层) 已入仓库**，但它依赖被 gitignored 的 `double-ratchet.js`
3. **README 零提及双棘轮** — 但官网大张旗鼓展示
4. **备份中 `double-ratchet.js` 仅存在 Android intermediates 中** — 不在项目源码目录
