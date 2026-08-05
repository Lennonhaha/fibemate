# 预发布彩排清单 — FIBEMATE v3.3.0 开源
**目标日期：** 2026-08-31
**更新时间：** 2026-08-05
**负责人：** @Lennonhaha / dev@fibemate.net

---

## 当前状态总览

| 项目 | 状态 | 说明 |
|------|:---:|------|
| 仓库 Public | ✅ | 2026-07-05 创建，Public=true |
| v3.3.0 Release | ✅ | 2026-07-15 发布，指向 main，body 写明 8/31 |
| v3.3.0 tag | ✅ | 存在，指向 c62505d3（旧），main 指向 8dd74b8c |
| GitHub 安全功能 | ✅ | Dependabot✅ Private Vuln Reporting✅ CodeQL✅ |
| CI 全绿 | ✅ | CI / CodeQL / Repolinter / OpenSSF / Native Addon 全部 success |
| LICENSE | ✅ | GPL-3.0-only (33790 bytes) |
| 26 可视化页面上线 | ✅ | 全部 HTTP 200 |
| 7 个 npm 包全绿 | ✅ | algorithm-registry / fml-dsa / key-lifecycle / pqc-kem / sm2-ref / sm3-ref / sm4-ref |
| SM2 WASM Phase 0 | ✅ | AssemblyScript 0.28.20 工具链就绪 |

---

## 阶段一：代码与仓库最终确认（8/28 前完成）

### 1.1 Git 状态
- [ ] `git log -1` 确认 main 最新 commit（当前：`8dd74b8c`）
- [ ] `git tag -l 'v3*'` 确认 v3.3.0 tag 存在
- [ ] `git status` 确认工作区干净（无 untracked 待提交）
- [ ] pre-commit 钩子正常运行

**验证命令：**
```bash
ssh fibemate-22 "cd /opt/fibemate-repo && git log -1 --oneline && git tag -l 'v3*' && git status --short"
```

### 1.2 README 与 ANNOUNCEMENT 一致性
- [ ] 可视化数量：26（README ✅ / ANNOUNCEMENT ✅ / 首页计数 ✅ / 仪表盘 ✅）
- [ ] 文档数量：17（README ✅ / ANNOUNCEMENT ✅ / 首页 ✅）
- [ ] CARS 评分：85（README ✅ / ANNOUNCEMENT ✅ / 首页 ✅）
- [ ] npm 包数：7（README ✅）
- [ ] 倒计时 Banner：JS 动态计算（硬编码已修复 ✅）
- [ ] 所有内部链接：`/docs/*.html` HTTP 200

**验证命令：**
```bash
# 检查关键数字一致性
ssh fibemate-22 "grep -c '26.*interactive\|26 个\|26.*可视化' /opt/fibemate-repo/www/index.html /opt/fibemate-repo/README.md /opt/fibemate-repo/www/docs/ANNOUNCEMENT.md"
```

### 1.3 可视化页面逐页验证
**26 个页面 HTTP 200 验证（curl）：**
```bash
PAGES=(
  "docs/pqc-deployment-checker.html"
  "docs/pqc-checker-v1.html"
  "protocol-hierarchy.html"
  "ml-kem-security-3d.html"
  "lwe-hardness-terrain.html"
  "tvla-before-after.html"
  "tls-hybrid-handshake.html"
  "double-ratchet-animation.html"
  "key-lifecycle-trace.html"
  "docs/fpga-heatmap.html"
  "docs/ibm-seven-radar.html"
  "docs/cars-ibm-trend.html"
  "docs/supply-chain-risk.html"
  "docs/cbom-graph.html"
  "docs/dependency-drilldown.html"
  "docs/project-timeline.html"
  "docs/ibm-seven-radar.html"
  "docs/migration-priority.html"
  "docs/bloom-risk.html"
  "docs/cryptolaw-assessment.html"
  "ml-kem-flow-animation.html"
  "ml-dsa-flow-animation.html"
  "docs/cbom-viewer.html"
  "docs/cars-radar.html"
  "docs/tvla-dashboard.html"
  "docs/pqc-hybrid-e2e.html"
)
for p in "\${PAGES[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://fibemate.net/\$p")
  echo "\$STATUS \$p"
done
```

---

## 阶段二：GitHub Release 确认

### 2.1 v3.3.0 Release 状态
- [ ] GitHub Releases 页面：`https://github.com/Lennonhaha/fibemate/releases`
- [ ] 确认 v3.3.0 Release 存在，body 包含 "Release Date: 2026-08-31"
- [ ] 确认 Release 指向 `main` 分支（自动跟随最新 commit）
- [ ] 确认无 Draft Release 残留

**验证命令：**
```bash
gh release view v3.3.0 --repo Lennonhaha/fibemate
```

### 2.2 Release 内容完整性
- [ ] Overview 章节完整
- [ ] 所有算法覆盖（ML-KEM / ML-DSA / SLH-DSA / SM2 / SM3 / SM4）
- [ ] 已知限制（Known Limitations）诚实列出
- [ ] 许可证信息：GPL-3.0-only
- [ ] 联系方式：dev@fibemate.net / https://fibemate.net

### 2.3 考虑 8/31 当天是否追加 v3.3.1 tag
- [ ] 决策：是否创建 v3.3.1 tag 将"技术预览"与"正式宣发"版本号区分
- [ ] 如创建：指向当前 main 最新 commit（`8dd74b8c`）
- [ ] 如不创建：v3.3.0 Release 已指向 main，效果等同

---

## 阶段三：安全与合规最终确认

### 3.1 GitHub 安全功能
| 功能 | 状态 | 验证 |
|------|:---:|------|
| Security policy | ✅ | SECURITY.md 已配置 |
| Security advisories | ✅ | 已启用 |
| Code scanning | ✅ | CodeQL 正在运行 |
| Secret scanning | ✅ | 已启用 |
| Private vulnerability reporting | ✅ | 已启用（本轮新开） |
| Dependabot alerts | ✅ | 已启用（本轮新开） |

### 3.2 CodeQL 警报最终审查
- [ ] 确认无 error 级别真实问题（已知 3 个 error：bloom-filter 误报 / pqc-detector 已知设计 / shift-out-of-range 误报）
- [ ] 确认 `actions/missing-workflow-permissions` 已修复（ci-native.yml 加了 permissions block ✅）
- [ ] 确认无新引入的高严重性警告

### 3.3 许可证
- [ ] LICENSE 文件存在且正确（GPL-3.0-only）
- [ ] 所有 npm 包 LICENSE 一致
- [ ] 所有第三方依赖标注正确

---

## 阶段四：社媒公告准备（8/28-8/30 完成草稿）

### 4.1 GitHub Discussions（8/31 09:00 CST）
- [ ] 草稿：`docs/ANNOUNCEMENT-DISCUSSIONS.md`
- [ ] 发帖后监控回复，及时响应

### 4.2 知乎（8/31 10:00 CST）
- [ ] 账号：需确认已登录
- [ ] 草稿：`docs/ANNOUNCEMENT-ZHIHU.md`
- [ ] 节点：密码学 / 编程 / 技术
- [ ] 可加：官网截图作为头图
- [ ] 注意：评论区及时回复（知乎运营关键）

### 放弃渠道
- ~~Hacker News~~（国内不可达）
- ~~V2EX~~（账号未确认，且国内知乎覆盖更广）
- ~~Twitter / 邮件列表~~（国内不可达）

### 4.3 Twitter / X
- [ ] 账号：@fibemate_net（需确认已注册）
- [ ] 发布时间：8/31 北京时间 09:00-12:00
- [ ] Thread 结构（3-5 条）：
  1. 主推：项目介绍 + GitHub 链接
  2. 技术亮点：ML-KEM-768 完整实现 + 国密集成
  3. 可视化演示：26 个交互式页面截图
  4. 安全验证：TVLA / KAT / TSR 证据链
  5. 结尾：开源邀请 + dev@fibemate.net

### 4.4 邮件列表
- [ ] pqc@list.consensys.net（crypto standards 讨论组）
- [ ] cryptography@ietf.org（如有相关）
- [ ] 草稿内容：正式学术风格，引用 v3.3.0 Release

---

## 阶段五：官网最终验证

### 5.1 首页验证
```bash
# HTTP 200
curl -s -o /dev/null -w "%{http_code}" https://fibemate.net/

# 关键元素存在
curl -s https://fibemate.net/ | grep -c 'fibemate'
curl -s https://fibemate.net/ | grep -c 'interactive'
```

### 5.2 API 验证
```bash
# PQC 探测器 API
curl -s "https://fibemate.net/api/v1/probe?target=fibemate.net:443" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Grade {d[\"compliance\"][\"grade\"]} / Score {d[\"compliance\"][\"score\"]}')"

# Health check
curl -s "https://fibemate.net/api/v1/probe/health"
```

### 5.3 文档页面
```bash
# ANNOUNCEMENT.md
curl -s -o /dev/null -w "%{http_code}" https://fibemate.net/docs/ANNOUNCEMENT.md

# SECURITY.md
curl -s -o /dev/null -w "%{http_code}" https://fibemate.net/docs/SECURITY.md

# README.md
curl -s -o /dev/null -w "%{http_code}" https://fibemate.net/README.md
```

---

## 阶段六：npm 发布准备

### 6.1 包发布状态确认
当前 7 个包均未发布到 npm（私下通过 file: 引用使用）。如需发布：

- [ ] 决策：是否在 8/31 当天将 @fibemate/* 包发布到 npm？
  - 如发布：需要 npm 账号 + `npm adduser` + `npm publish --access public`
  - 如不发：保持私有，通过 GitHub 直接引用

### 6.2 需发布的包（如决定发布）
```bash
# 预计发布列表
@fibemate/algorithm-registry
@fibemate/fml-dsa
@fibemate/key-lifecycle
@fibemate/pqc-kem
@fibemate/sm2-ref
@fibemate/sm3-ref
@fibemate/sm4-ref
```

---

## 阶段七：8/31 当天执行清单

### T-1 天（8/30）
- [ ] 最终 git push（确认 main 最新）
- [ ] 最终 CI 全绿确认
- [ ] 最终 26 页 HTTP 200 确认
- [ ] 发布前最后检查 HN / V2EX 草稿
- [ ] 通知联系人名单确认

### T+0 天（8/31）
- [ ] 00:00 CST：更新首页倒计时 Banner（如有静态版本）
- [ ] 08:00 CST：发布 HN Show HN
- [ ] 09:00 CST：V2EX 发帖
- [ ] 09:30 CST：Twitter Thread
- [ ] 10:00 CST：邮件列表发帖（如适用）
- [ ] 实时监控：GitHub Issues / Discussions
- [ ] 实时监控：社交媒体反馈

---

## 应急联系人

| 渠道 | 联系人 | 备注 |
|------|--------|------|
| GitHub Issues | @Lennonhaha | 主要反馈渠道 |
| Email | dev@fibemate.net | 安全问题 / 商务合作 |
| 官网 | https://fibemate.net | 主站 |

---

## 附录：关键资源链接

| 资源 | URL |
|------|-----|
| GitHub 仓库 | https://github.com/Lennonhaha/fibemate |
| Release 页面 | https://github.com/Lennonhaha/fibemate/releases/tag/v3.3.0 |
| 官网 | https://fibemate.net |
| 文档索引 | https://fibemate.net/docs |
| PQC 部署验证器 | https://fibemate.net/docs/pqc-deployment-checker.html |
| PQC 仪表盘 | https://fibemate.net/docs/pqc-dashboard.html |
| SECURITY.md | https://github.com/Lennonhaha/fibemate/blob/main/SECURITY.md |
| TSR 索引 | https://fibemate.net/docs/tsa/ |
