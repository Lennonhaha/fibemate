# FIBEMATE 项目进度 & 工作计划

> **更新日期**：2026-06-18  
> **目标**：2026.08.31 开源

---

## 一、总览

| 维度 | 状态 | 说明 |
|------|:----:|------|
| 核心密码学 (ML-KEM-768) | ✅ | KAT 10k / TVLA 10k / C+WASM+JS 三实现 |
| SM2 国密 | ✅ | 5 阶段 8.4× 加速 / TVLA 10/10 / sm-crypto 互操作 |
| FPGA 硬件加速 | ⏳ | NTT/INTT 仿真全通过，UART 待测 |
| 官网 & 文档 | ✅ | fibemate.net + FPGA/SM2 报告 + 证据地图 |
| 后端服务 | ✅ | systemd 托管 / Nginx 反向代理 / 全线上 |
| npm 发布 | ❌ | 双盲冻结中（CCF） |
| NLnet 资助 | ⏳ | 已提交，审核队列（预计 9-10 月出结果） |
| 第三方审计 | ⏳ | 待开源前启动 |
| 磁盘备份 | ⚠️ | E 盘 SMART Warning / D 盘坏道 / 部分完成 |

---

## 二、已完成 （截至 2026-06-18）

### 2.1 核心密码学

- [x] ML-KEM-768：JS 参考实现 + C Native Addon (AVX2) + WASM
- [x] KAT 一致性 10,000/10,000 全通过
- [x] TVLA v2 Enhanced 侧信道 (N=10,000)：C Addon 恒定时间通过，纯 JS 有时域泄漏（已知）
- [x] Keccak ROL64 底层 bug 修复
- [x] SHAKE-128/256 Keccak 四接口完整

### 2.2 SM2 国密

- [x] 全栈重构：5 阶段优化（Native BigInt → Jacobian → 预计算 → wNAF → Barrett）
- [x] 性能：sign 6.62×, verify 7.33×, keygen 7.98×, encrypt 8.39×, decrypt 8.61×
- [x] TVLA 侧信道 10/10 全部通过 (N=2,000，jsbn + BigInt/wNAF 双路径)
- [x] **SM2 BigInt TVLA N=5000 全通过** (Scalar Masking + Projective Randomization, v1.2)
  - verify: |t|=7.42→1.19, decrypt: |t|=8.22→2.06, 5/5 全 PASS
  - 根因: 旧版 `(k+rN)%N≡k` 模运算消掉 mask, 已修复为 `k+rN` 原始整数
  - 性能开销 ~25%, 报告: `tvla-sm2-masked-report.json`
  - 脚本: `tvla_sm2_v3_masked.js` `tvla_sm2_diagnose.js` `check_v1.2.js`
  - 备份: `sm2-bigint-ec-v1.1.bak` (服务器)
- [x] 与 sm-crypto 双向互操作验证完成
- [x] 编码差异已确认并文档化（C1 130 vs 128 字符、C3 顺序）

### 2.3 FPGA 硬件加速

- [x] Artix-7 35T (xc7a35tfgg484-2) @ 49.5 MHz，时序收敛 WNS +0.204ns
- [x] NTT/INTT 256/256 round-trip 全匹配（纯软件仿真）→ `check_ntt.py --mode selfcheck`
- [x] 5 项 Bug 修复：负数 Barrett 约减、FSM 等待信号、Zeta 表硬编码、复位极性、BRAM 推断冲突
- [x] `test_fpga_uart.py` 重写（4 模式：selfcheck/loopback/intt/list）
- [x] FPGA 验证报告上线 → [fibemate.net/docs/fpga-report.html](https://fibemate.net/docs/fpga-report.html)

### 2.4 官网 & 文档

- [x] https://fibemate.net 全站（Nginx + systemd，SSL 全绿）
- [x] SM2 逐级优化报告 → [fibemate.net/docs/sm2-optimization.html](https://fibemate.net/docs/sm2-optimization.html)
- [x] SM2 TVLA 分析 → [fibemate.net/docs/sm2-tvla-analysis.html](https://fibemate.net/docs/sm2-tvla-analysis.html)
- [x] 安全部署页面 → [fibemate.net/security.html](https://fibemate.net/security.html)
- [x] Hero 动态徽章行（ML-KEM / SM2 / FPGA 三项）
- [x] Nginx HTML 缓存从 1h → 5min
- [x] TECHNICAL-VERIFICATION.md 证据地图 + FreeTSA RFC 3161 时间戳存证
- [x] 三向备份一致性验证（workspace / D 盘 / 服务器）

### 2.5 基础设施

- [x] 阿里云服务器 (8.156.77.68) 稳定运行
- [x] 端口 3001 对 NLnet 审稿人开放（0.0.0.0/0）
- [x] Cloudflare CDN + 英文配套材料

---

## 三、待完成

### 🔴 P0 — 开源前必须完成

| 编号 | 任务 | 状态 | 预估 | 阻塞项 |
|------|------|:----:|------|--------|
| P0-1 | FPGA UART loopback 测试 | ⏳ 待硬件 | 1d | 杜邦线到货 + 烧录 ntt_intt.bit |
| P0-2 | FPGA INTT roundtrip 测试 | ⏳ 依赖 P0-1 | 0.5d | P0-1 |
| P0-3 | wasm-opt 优化 | ❌ 未启动 | 1d | 需性能基线对比 |
| P0-4 | styles.css 404 修复 | ❌ 未启动 | 0.5d | — |
| P0-5 | 前端 SM2 加密集成 | ❌ 未启动 | 2d | API 设计确认 |
| P0-6 | npm publish (@fibemate/*) | 🔒 CCF 冻结 | 1d | CCF 双盲解除 (≈2026.08) |
| P0-7 | docs/ 目录整理 → GitHub | ⏳ 部分完成 | 1d | CCF 解冻 |
| P0-8 | GitHub README 英文化 | ❌ 未启动 | 2d | P0-7 |
| P0-9 | 根目录脚本清理 | ❌ 未启动 | 1d | — |
| P0-10 | Keccak ROL64 引用排查 | ❌ 未启动 | 0.5d | — |

### 🟡 P1 — 开源后可迭代

| 编号 | 任务 | 状态 | 预估 |
|------|------|:----:|------|
| P1-1 | 第三方密码学审计 | ⏳ 待开源 | 4-6w |
| P1-2 | 第三方 SM2 侧信道审计 | ⏳ 待开源 | 4-6w |
| P1-3 | FPGA 全流程 ML-KEM-768（SHAKE → NTT → 编码 → KeyGen） | ⏳ 远期 | 8-12w |
| P1-4 | 移动端 (React Native) 完成 | ⏳ 开发中 | 4w |
| P1-5 | Tauri v2 桌面端完成 | ⏳ 开发中 | 4w |
| P1-6 | PWA 离线支持完善 | ⏳ 部分完成 | 1w |

### 🟢 P2 — 按需推进

| 编号 | 任务 | 状态 | 说明 |
|------|------|:----:|------|
| P2-1 | NLnet 资助结果等待 | ⏳ 审核中 | 预计 9-10 月出结果 |
| P2-2 | 社区文档（开发者指南） | ❌ | 开源后启动 |
| P2-3 | CI/CD 流水线 | ❌ | — |
| P2-4 | E 盘更换 / 数据迁移 | ⚠️ | E 盘 SMART Warning |

---

## 四、时间线

```
2026-06 ──── 2026-07 ──── 2026-08 ──── 2026-09 ──── 2026-10
  │              │              │              │              │
  │  UART测试    │  wasm-opt    │  ⚡ 08.31     │  NLnet       │
  │  styles.css  │  SM2前端     │  开源！！     │  结果        │
  │  脚本清理    │  README      │              │              │
  │  Keccak排查  │  docs整理    │              │              │
  │              │  (CCF解冻)   │              │              │
  │              │  npm publish │  ── 审计启动 ──→            │
  └─ 现在 ──────┘              │              │              │
```

### 近期可并行推进（无阻塞依赖）

| 任务 | 可立即开始 |
|------|:----:|
| styles.css 404 修复 | ✅ |
| Keccak ROL64 引用排查 | ✅ |
| 根目录脚本清理 | ✅ |
| 前端 SM2 加密集成设计 | ✅ |

### 需要前提条件

| 任务 | 前提 |
|------|------|
| FPGA UART 测试 | 硬件杜邦线到货 |
| npm publish | CCF 双盲解除 |
| GitHub README/docs | CCF 解冻 |

---

## 五、NLnet 资助

| 项目 | 详情 |
|------|------|
| 申请编号 | 2026-06-158 |
| 基金 | NGI Zero Commons Fund |
| 金额 | €25,000 |
| 提交日期 | 2026-05-07（截止 2026-06-01） |
| 状态 | **审核队列中**（2026-06-16 入队） |
| 预计结果 | 12-15 周，约 2026 年 9-10 月 |
| 审稿人访问 | http://8.156.77.68:3001（端口 3001 已开放） |

---

## 六、风险 & 注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| E 盘 SMART Warning | 可能数据丢失 | 已完成 D 盘备份；避免 E 盘写操作；考虑换盘 |
| D 盘坏道 | .git/node_modules 损坏 | chkdsk /f；关键文件已三向备份 |
| CCF 双盲冻结至 2026.08 | npm publish / GitHub 操作受限 | 优先完成不需 GitHub 的任务 |
| NLnet 不通过 | 资金缺口 | 不影响开源计划，可申请其他基金 |

---

> 📌 **下一步行动**（推荐顺序）：
> 1. ✅ ~~SM2 BigInt TVLA N=5000 修复~~（2026-06-18 完成）
> 2. styles.css 404 修复（30min）
> 3. Keccak ROL64 引用排查（30min）
> 4. 根目录脚本清理（1h）
> 5. 等待杜邦线 → FPGA UART loopback
> 6. 前端 SM2 集成设计
> 7. CCF 解冻 → npm publish + GitHub README
