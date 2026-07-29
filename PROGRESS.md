# FIBEMATE 进度追踪 & 待办清单

> **最后更新**：2026-07-29 11:16 CST
> **开源倒计时**：2026.08.31 开源 — 剩余 33 天
> **TSR 证据链**：lg-001 ~ lg-100（100 份，FreeTSA + DigiCert 双机构）
> **GitHub**：Lennonhaha/fibemate · main `ca0d669` · ~520 commits
> **服务器**：ECS 2vCPU，磁盘 77%（29G/40G），Node v22.22.2
> **SSL 证书**：fibemate.net Oct 16 2026 到期，certbot.timer 已启用

---

## 整体状态

| 模块 | 状态 | 备注 |
|------|:----:|------|
| ML-KEM-768 (FIPS 203) | ✅ | NTT 域实现，KAT 10k / Noble 200/200 / liboqs 10k/10k / C addon 15-31x 加速 |
| SLH-DSA (FIPS 205) | ✅ | pqc_sphincsplus WASM 集成 |
| SM2 ECDH | ✅ | v1.3 wNAF+Comb 6.19x / TVLA N=10K 5/5 PASS / Mersenne 快速模约减 1.8x |
| SM3 Hash | ✅ | 跨语言验证 30/30 PASS |
| SM4-GCM AEAD | ✅ | α=7.5 认证加密，10/10 PASS |
| 双棘轮 PQ Hybrid | ✅ | ML-KEM-768 + P-256 混合 X3DH → 双向 4 轮消息加密解密全通 |
| TLS 1.3 Hybrid | ✅ | Path C-2 E2E 5/5 / Path A oqs-provider 运行中 |
| LookingGlass v1/v2 | ✅ | v1 归档（迁移至 experimental/vwz-lg 分支）/ v2 实验分支 |
| VWZ 签名 | ✅ | Rust WASM 148/148 测试 / ePrint 退回（编辑退稿）/ 不重投 |
| FPGA v5 | ✅ | NTT 流水线 WNS=9.755ns / UART TX 物理验证通过 / RX 实现完成待实板验证 |
| CI/CD | ✅ | 四灯全绿（CI + Repolinter + Scorecard + Native Addon Build） |
| 社区文件 | ✅ | CODE_OF_CONDUCT / SECURITY / CONTRIBUTING / RELEASE_NOTES / CHANGELOG / GOVERNANCE / SUPPORT / CITATION.cff |
| OpenSSF Best Practices | ✅ | 项目 #13695 Passing 级 / 徽章已悬挂 README / Roadmap 中英文已完成 |
| 开源公告 | ✅ | 四平台社交文案（知乎/掘金/V2EX/开源中国）+ 英文版 + Deep-Dive 系列策略 |
| NLnet 资助 | ⏳ | €5,000 NGI Zero Commons Fund，评审结果 9-10 月 |
| 服务器 443 | ⚠️ | 诊断完成，修复脚本待审 |
| 硬盘 | ⚠️ | 服务器 77%，本地 E 盘 SMART Warning（已 chkdsk /f 修复） |

---

## 已完成工作（2026-07-19 ~ 07-29）

### 7/19 ~ 7/21：ML-KEM-768 NTT 域重写 + Barrett 优化
- [x] **ML-KEM-768 NTT 域实现**：对齐 FIPS 203，Noble 200/200 交叉验证，liboqs 10,000/10,000
- [x] **Barrett reduction 优化**：modMul 14x 加速，0 errors / 11M 穷举
- [x] **全仓 SPDX 标注**：331 文件 GPL-3.0-only
- [x] **A2A v1.0 公网运行**

### 7/22 ~ 7/23：C Native Addon + 国密跨语言验证
- [x] **C Native Addon 入仓**：31 C 文件，ML-KEM-768 性能提升 15-31x（keygen 103µs vs JS 1.19ms）
- [x] **国密三件套跨语言验证**：SM2/SM3/SM4 JS↔Python 100% 通过
- [x] **README v3.5 脱敏**：零品牌残留
- [x] **SM2 TVLA 定时泄漏修复**：标量盲化（k' = k + r·N）
- [x] **CI 加固 460/460 全绿**

### 7/23 ~ 7/25：性能优化 + 双棘轮 + FPGA UART
- [x] **SM2 Mersenne 快速模约减**：modMul 1.8x 加速
- [x] **双棘轮 PQ 混合全链路闭环**：三层 Bug（decaps 参数顺序 / gitignore / 基类缺失）全修复
- [x] **FPGA UART TX 物理打通**：CP2102/3.3V 双向通信验证
- [x] **挂谷可视化 P0 原型**：离散挂谷 + Perron 树简化版，Three.js 3D 渲染
- [x] **SM3/SM4 benchmark 完成**
- [x] **阿里云 ECS 443 故障诊断完成**

### 7/25 ~ 7/27：性能门禁 + 外部审计 + 社区设施
- [x] **性能门禁三件套**：`perf-gate.js`（p95/mean 门限）+ `bench-diff.js`（CI 回归检测）+ ESLint no-js-bigint-in-hotpath
- [x] **ML-KEM-768 外部审计**：Issue #1-#6, #8 全部修复，JSDoc 覆盖率 30%→73%
- [x] **Hybrid KEX 设计文档**：SM2+ML-KEM-768，IANA #4590
- [x] **人工审查模板**：`review-crypto-primitives.md` / `review-hybrid-kdf.md`
- [x] **GitHub Issue 模板**：disclosure-audit / bug-report / ci-issue / rtl-repro
- [x] **每日审计脚本**：`daily-audit.js`，7 项检查
- [x] **健康检查脚本**：`health-check.sh`，15 分钟本地体检
- [x] **AI 上下文感知文档**：`ai-context-primer.md`，防 AI 幻觉

### 7/28 ~ 7/29：CI 全绿 + OpenSSF + 仓库清理
- [x] **Repolinter 修复**：缺 SECURITY.md / SPDX 头 / python-package-metadata → 全部修复
- [x] **ESLint GBK 损坏修复**：中文注释→ASCII，Linux CI 通过
- [x] **Native Addon Build 修复**：加 node-addon-api 依赖 + 移除 --ignore-scripts
- [x] **四灯全绿**：CI ✅ / Repolinter ✅ / Scorecard ✅ / Native Addon Build ✅
- [x] **OpenSSF Roadmap**：英文 + 中文版，Passing→Silver→Gold 差距分析，AI 不计入 Contributor 声明
- [x] **OpenSSF 徽章悬挂 README**：项目 #13695 Passing，附免责声明
- [x] **Nightly Phase 1 & 2 修复**：shebang+SPDX 顺序 / eslint 依赖 / tvla-summary.js 缺失 / perf-gate baseline 调整
- [x] **CHANGELOG 更新**：补 7/24-7/29 段
- [x] **README 死链修复**：4 处（kat-10000.js→kat-quick.js，vwz-148→experimental 分支）
- [x] **仓库清理**：归档 README-2026-07-16.md → archives/
- [x] **DNS 投毒事件**：raw.githubusercontent.com → 0.0.0.0，33 分钟后自愈，证据归档
- [x] **完整推送记录核验**：30 commits 全部在 origin/main，无遗漏

---

## 当前 P0 阻塞项

| # | 阻塞项 | 状态 | 备注 |
|---|--------|:----:|------|
| P0-1 | FPGA UART 引脚确认 | ⚠️ | A7-Lite 官方 UART 为 U2(TX)/V2(RX)，非 N19/M18；需实板复测 |
| P0-2 | FPGA UART CH340 电平不匹配 | ⚠️ | 5V CH340 vs 3.3V FPGA；已通过 CP2102 打通 TX，RX 回环 RTL 已完成 |
| P0-3 | E 盘 SMART Warning | ✅ | chkdsk /f 修复成功，数据完整 |
| P0-4 | npm publish @fibemate/* | ⏳ | CCF 实名认证阻塞，预计 2026-08 |

## P1 待办

| # | 待办项 | 状态 |
|---|--------|:----:|
| P1-1 | SM2 decrypt 偶发 0.2% 故障定位 | ⚠️ 根因未定位 |
| P1-2 | SM3/SM4 benchmark 构造方式修复 | ⚠️ 待修 |
| P1-3 | FPGA UART RX 实板验证 | ⚠️ 需三项硬件数据 |
| P1-4 | kakeya-visualizer.html 3D 画布空白修复 | ⚠️ Three.js 渲染初始化问题 |
| P1-5 | 服务器 443 修复脚本执行 | ⚠️ 脚本待审 |
| P1-6 | 硬件 TVLA ChipWhisperer 实测 | ⏳ 需电平转换器，Q4 目标 |
| P1-7 | Nginx OpenSSL 3.4 升级（Path A） | ⏳ 待服务器维护窗口 |

## P2 待办

| # | 待办项 | 状态 |
|---|--------|:----:|
| P2-1 | SM4-GCM KAT 重新生成 | ⚠️ |
| P2-2 | 跨库互操作回归测试 | ⚠️ |
| P2-3 | 服务器磁盘 77% 清理 | ⚠️ |
| P2-4 | nginx 安全头 + admin-browser 证书 | ⚠️ |
| P2-5 | NLnet €5K 资助申请跟踪 | ⏳ 9-10 月出结果 |
| P2-6 | CHANGELOG.md 持续维护 | ✅ 7/24-7/29 已补 |

---

## Nightly 状态（截至 7/29 10:30）

| Workflow | 状态 | 备注 |
|----------|:----:|------|
| CI (push) | ✅ | 每次 push 触发 |
| Repolinter | ✅ | 社区文件完整性 |
| OpenSSF Scorecard | ✅ | 工程卫生评分 |
| Native Addon Build | ✅ | C addon 编译 + KAT 验证 |
| Nightly-Full | 🔴 | Scheduled（22:00 CST 首次触发），shebang 修复后待验证 |
| Nightly Phase 1 | ✅ | 本地验证通过，等待 Scheduled 触发 |
| Nightly Phase 2 | ✅ | 本地验证通过，等待 Scheduled 触发 |

---

## 8/31 开源前检查清单

- [x] CI 全绿（4 灯）
- [x] 社区 10/10 文件就绪
- [x] 开源公告（四平台社交文案 + 英文版）
- [x] OpenSSF Best Practices Passing 徽章 + Roadmap
- [x] Nightly CI 修复（Phase 1 & 2 unbreak）
- [x] C Native Addon 构建稳定
- [x] CHANGELOG 更新至 7/29
- [x] README 死链修复
- [x] 性能门禁三件套就位
- [ ] ~~第三方审计~~（8/31 前不现实，移至开源后）
- [ ] 开源 Deep-Dive 系列 #1-#4（草稿已有）
- [ ] CHANGELOG.md 持续至 8/31

---

## 长期里程碑

| 时间 | 里程碑 | 状态 |
|------|--------|:----:|
| Q3 2026 | 8/31 开源发布 + 文档完善 + 社区建设 | 🟢 进行中 |
| Q4 2026 | FPGA 硬件 TVLA 实测（需电平转换器） | ⏳ 规划中 |
| Q1 2027 | Python/Rust 原生绑定扩展 | 📋 规划中 |
| Q2 2027 | 第三方正式密码学审计 | 📋 规划中 |

---

> **上次更新**：2026-07-29 11:16 CST
> **下一步优先**：
> 1. FPGA UART RX 实板验证（需确认引脚 + 烧录正确 bit）
> 2. SM2 0.2% 偶发故障定位
> 3. 等待 Nightly-Full 22:00 CST 首次 Scheduled 结果
> 4. 服务器 443 修复脚本部署
> 5. 8/31 开源 Deep-Dive 系列定稿
