# Feature Flag 隔离方案 — 执行总结

## 执行时间
2026-07-19

## 问题
`src/index.js` 以裸 `require()` 加载全部实验模块（Mixnet、Phase4、VWZ、ZK-Auth、PIR、Nexus 等），
**无编译期或启动期隔离**。生产环境只要 `experimental/` 目录存在，实验代码即直接接入主加密链路。

## 解决方案
引入 `src/flags.js` 集中式 Feature Flag 模块，所有实验代码入口处通过 flag 条件判断。

## 实现文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/flags.js` | ✅ 新增 | 集中式 flag 模块，支持 env var 控制 |
| `src/index.js` | ✅ 已修改 | 11 处 experimental require 全部加门控 |
| `scripts/test-flags.js` | ✅ 新增 | 25 项 flag 逻辑测试（25/25 PASS） |
| `scripts/test-flags-integration.js` | ✅ 新增 | 18 项集成测试（18/25 PASS） |

## Flag 体系

```
FIBEMATE_EXPERIMENTAL=1          # 主开关，打开所有实验模块
  ├── FIBEMATE_NO_VWZ=1          # 关闭 VWZ 签名研究
  ├── FIBEMATE_NO_LG=1           # 关闭 LookingGlass 混淆
  ├── FIBEMATE_NO_MIXNET=1       # 关闭 Mixnet
  ├── FIBEMATE_NO_PHASE4=1       # 关闭 Phase4 (Nym)
  ├── FIBEMATE_NO_ZK=1           # 关闭 ZK 匿名认证
  ├── FIBEMATE_NO_PIR=1          # 关闭 PIR 搜索
  └── FIBEMATE_NO_NEXUS=1        # 关闭 Nexus 社区
FIBEMATE_LEGACY_TLS=1            # 启用已弃用 TLS 路径
FIBEMATE_ARCHIVE=1               # 启用 SM2 归档端点
```

## 生产模式（默认）
```
FIBEMATE_EXPERIMENTAL=0  # 或直接不设置，所有 flag 默认 OFF
node src/index.js
```

启动日志输出：`[Flags] Mode: PRODUCTION (experimental OFF)`
Mixnet/Phase4/VWZ 等模块输出 `Skipped` 而非 `启动`。

## 门控策略

- **主开关优先**：子模块依赖 `EXPERIMENTAL=1`
- **负向标志**：`FIBEMATE_NO_XXX=1` 在 EXPERIMENTAL=1 下单独关闭某子系统
- **空操作回退**：无 flag 时返回空 router/noop 函数，调用方无需额外判断
- **纯 CommonJS**：无构建工具，`require()` 在条件分支内不会执行

## 测试结果

```
scripts/test-flags.js           25/25 PASS
scripts/test-flags-integration.js  18/18 PASS
```

## 风险评估

| 风险 | 级别 | 说明 |
|------|------|------|
| 生产模式兼容性 | 低 | 默认关闭，完全向后兼容 |
| 代码复杂度 | 低 | 净增加 1 个新文件 + ~40 行修改 |
| 部署故障 | 低 | 服务器端默认不设 env，行为与改前一致 |

## 后续建议

1. **CI 管线**：添加 `scripts/test-flags.js` 到 CI workflow
2. **pre-commit hook**：自动检查是否有裸 `require()` 绕过 flag
3. **文档**：在 `docs/API.md` 或 README 中提及 `FIBEMATE_EXPERIMENTAL=1` 的开发模式
