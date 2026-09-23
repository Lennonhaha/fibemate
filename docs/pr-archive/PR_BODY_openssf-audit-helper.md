## 目标
新增 tools/openssf-audit-helper.cjs：OpenSSF Best Practices 自检查清单导出。

## 背景
仓库已有 scorecard.yml workflow，申报 OpenSSF Best Practices Badge（Silver/Gold）是真实项目目标。本工具对照 badge 关键指标做静态启发式自检，快速定位申报缺口，作为 badgeapp 官方评分的辅助。

## 功能
- 默认输出 Markdown 自检报告；--json 输出 CI 友好 JSON；--root <dir> 指定仓库根；--criteria <id> 只看单项
- 检测 10 项：LICENSE、SECURITY.md、CODE_OF_CONDUCT、CONTRIBUTING、CI 工作流、漏洞披露、依赖锁文件、git 提交历史、加密实现卫生（是否用标准库而非自研哈希）、test/ 覆盖

## 验证
- 对主仓实测 10/10 通过（含修复后的加密实现卫生检测，正确识别标准库）

## 说明
SPDX GPL-3.0-only 头已加；只读扫描，不修改任何文件；结果不替代 OpenSSF 官方 badgeapp 完整评分。