# FIBEMATE 开源前安全审计自检清单

> 版本：v1.0 · 日期：2026-08-12 · 开源日：2026-08-31（D-19）

---

## 一、算法正确性验证

| 算法 | 测试数 | 方法 | 结果 | 日期 |
|------|:---:|------|:---:|------|
| ML-KEM-768 | 8/8 | KAT + 跨库互操作 (noble) | ✅ PASS | 2026-08-12 |
| ML-DSA-44/65/87 | 84/84 | KAT + NIST ACVP 75 向量 | ✅ PASS | 2026-08-12 |
| SLH-DSA-128s | — | WASM 集成 | ✅ PASS | 2026-08-05 |
| SM2 | 9/9 | 签名/验证/拒绝/KAT | ✅ PASS | 2026-08-12 |
| SM3 | 32/32 | JS-Python 交叉验证 + KAT | ✅ PASS | 2026-08-12 |
| SM4-GCM | 7/7 | 加解密/篡改检测/密钥独立 | ✅ PASS | 2026-08-12 |
| VWZ 签名 (k=2/4/8) | 24/24 | WASM KAT 闭环 | ✅ PASS | 2026-08-12 |
| **合计** | **199/199** | | **✅ 全绿** | |

---

## 二、侧信道安全 (TVLA)

| 算法 | 样本量 | 阈值 | \|t\| 最大 | 结果 |
|------|:---:|:---:|:---:|:---:|
| SM2 标量乘 (masked) | N=10,000 | 4.5 | 0.72 | ✅ PASS |
| ML-KEM-1024 (Noble) | N=10,000 | 4.5 | — | ✅ 3/3 PASS |

**缺口**：
- ML-KEM-768 TVLA 未完成（仅 1024 做了）
- ML-DSA / SLH-DSA 无 TVLA
- FPGA 物理侧信道未测（EQP CH340G 5V/FPGA 3.3V 不兼容，待换 CP2102/FT232）
- 纯 JS 实现 (sm2-ref/sm3-ref/sm4-ref) 非常数时间 — 已知，README 已声明

---

## 三、形式化验证 (TLA+)

| 模型 | 变更 | 状态 |
|------|------|:---:|
| C2.tla (Path C-2 混合 KEX) | 7 条不变式，201,467 states，26,115 distinct | ✅ 0 violations |
| C2.cfg | TLAPS 配置 | ✅ |

**缺口**：Path A (TLS X25519MLKEM768 NamedGroup) 未形式化 — 已 shelved

---

## 四、静态分析

| 工具 | 状态 |
|------|:---:|
| ESLint | 0 errors, 0 warnings（--max-warnings 0，2026-08-11 收紧） |
| CodeQL | GitHub Actions 自动运行，最近 10 次全 success |
| OpenSSF Scorecard | 5.2/10（Bronze），Scorecard + Repolinter workflows enabled |

**缺口**：
- 无密码学专用 SAST（如 semgrep + crypto rules）
- Scripts/ 目录有 160 ESLint 问题（未纳入 CI scope）

---

## 五、TSR 时间戳存证

| 指标 | 值 |
|------|:---:|
| .tsr 文件 | 225+ |
| timestamp-manifest.json v3 | 126 条记录 |
| 签发机构 | DigiCert + FreeTSA 双机构 |
| 存证范围 | 代码提交/测试结果/文档版本/TSR 自校验 |

**缺口**：manifest 文件手动维护，无自动更新脚本

---

## 六、依赖安全

| 检查项 | 状态 |
|------|:---|
| Dependabot alerts | 23 open（10 high, 8 moderate, 5 low）— 全为传递性依赖 |
| cargo audit | ✅ 无高危 |
| npm audit | ⚠️ www/ 有 4 个剩余（path-to-regexp/body-parser，需 express 5.x） |

**已确认**：0 条触及核心 PQC 代码（ml-kem/sm2/fml-dsa/double-ratchet）

---

## 七、高风险组件声明

| 组件 | 风险 | 原因 | 公告声明 |
|------|:---:|------|:---:|
| **VWZ 签名** | 🔴 高 | VMQ-SPARSE 困难假设未经学术验证，论文被退回 | ✅ 标注"实验性，不用于生产" |
| **LookingGlass v2.3** | 🔴 高 | 默认关闭；上下文相关置换，非密码学安全承诺 | ✅ 标注"实验性，默认关闭" |
| **纯 JS SM2/3/4** | 🟡 中 | 非常数时间 | ✅ README 已声明 |
| **fml-dsa (Phase 1)** | 🟡 中 | 当前走 noble fallback，非自研实现 | ✅ portrait 已标注 |

---

## 八、开放 Gap

| # | Gap | 影响 | 计划 |
|:---:|------|------|------|
| 1 | **第三方独立审计** | 全部代码 | 规划 2027 Q2，v3.3-preview 未签约 |
| 2 | VWZ VMQ-SPARSE 归约证明 | 核心安全假设 | 8/31 后 Gröbner+BKZ 实验 |
| 3 | ML-KEM-768 TVLA | 侧信道 | 8/31 后 |
| 4 | FPGA 物理侧信道 | 硬件安全 | EQP 待换 |
| 5 | Fuzzing (libFuzzer/JSFuzz) | 边界健壮性 | 8/31 后 |
| 6 | Bus Factor = 1 | 项目可持续性 | OpenSSF Silver 硬伤，依赖开源后贡献者 |
| 7 | fibemate.link SSL renewal | 服务可用性 | 待 10 月替换 AccessKey |

---

## 九、8/31 冻结期纪律

**✅ 允许**：文档、公告、ESLint/CI 配置、现有测试脚本运行、可视化 HTML、nginx 配置

**❌ 禁止**：Rust/WASM/JS 算法逻辑变更、新增 npm 包、新增功能、修改加密路径

---

## 十、开源前发布 Sign-off

| 检查项 | 状态 |
|------|:---:|
| 全部 KAT 通过 (199/199) | ✅ |
| ESLint 零容忍 | ✅ |
| CI + Nightly 全绿 | ✅ |
| GitHub 2FA 启用 | ✅ |
| VWZ/LookingGlass 实验性声明 | ✅ |
| 文档一致性 (ARCHITECTURE/ROADMAP/README/ANNOUNCEMENT) | ✅ |
| TSR 存证链完整 | ✅ |
| Dependabot 告警已审计 | ✅ (docs/NPM-AUDIT-STATUS.md，0/7 核心包受影响) |
| OpenSSF Scorecard ≥7.0 | ❌ (当前 5.2) |
| 第三方审计 | ❌ (2027 Q2) |

> **Sign-off 条件**：以上 ⏳ + ❌ 项中仅 OpenSSF Silver 和第三方审计为可延后项（属"开源后持续改进"范畴），其余需 8/31 前清零。

---

*自检完成时间：2026-08-12 ~09:55 CST · 下次更新：Dependabot review 完成后*
