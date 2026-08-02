# CARS Self-Assessment Bias Analysis

## FIBEMATE CARS 自评偏差报告

**评估日期**：2026-08-02  
**外部评估人**：独立观察者（未参与 FIBEMATE 日常开发）  
**内部基线**：FIBEMATE v3 自评（CARS scorecard v3, commit `1cddeab`）  
**方法论**：外部人使用 `cars-self-assessment.html` 填写 15 道题，不查阅内部文档，仅基于公开仓库可观测证据

---

## 综合对比

| 维度 | 外部人评分 | 内部基线 (v3) | 偏差 |
|------|-----------|---------------|------|
| Crypto Inventory | 75 | **95** | -20 |
| Algorithm Agility | 50 | 40 | +10 |
| Key Lifecycle | 0 | 70 | **-70** |
| Protocol Coupling | 45 | 55 | -10 |
| Organizational Readiness | 35 | 65 | -30 |
| **综合** | **41** | **67.0** | **-26.0** |

> 外部人低估 26 分（39%）。偏差并非随机——集中在两个维度。

---

## 逐维度偏差分析

### 1. Crypto Inventory（-20）：可见性差距，非事实差距

| 子项 | 外部人判断 | 实际情况 | 偏差根因 |
|------|-----------|---------|---------|
| 加密算法清单 | "有完整清单"（选了最高选项）→ 估算 75 | 扫描器 100% 覆盖 147 依赖，15 算法 + 2 FPGA 模块 | 外部人在问卷界面上看不到扫描器输出；如果问卷附了 `tools/pqc-ecosystem-scan.json` 摘要，答案会一致 |
| KAT 覆盖 | "部分覆盖"→ 扣分 | ML-KEM KAT 10000/10000、SM2 100/100、SM3/SM4 各 30/30、HMAC-SM3 6/6、fml-dsa 75/75、SLH-DSA 5/5 | 外部人确实知道 `scripts/kat-*.js` 存在，但不确定覆盖范围 |
| TSR 存证 | "有 git tag"→ 扣分 | TSR lg-001~100, DigiCert+FreeTSA 双机构, timestamp-manifest.json v3, 总计 131 条 | 外部人不知道 TSR 体系的存在——这个不会出现在 `ls scripts/` 里 |

**纠正后预测**：如果外部人能看完 `evidence/tvla/` 和 `tsa/` 目录，Crypto Inventory 会评 90-95。

**对 CARS 框架的反馈**：CARS 问卷目前是纯文字选择题，没有"附录：你的自动化扫描输出如下"的嵌入式证据展示。建议 `cars-self-assessment.html` 在 Step 3 对比页展示内部基线的具体证据片段（如 `tools/pqc-ecosystem-scan.json` 的算法清单摘要），让外部人能对照判断。

---

### 2. Key Lifecycle（-70）：最严重偏差——内部证据对外部人完全不可见

| 子项 | 外部人判断 | 实际情况 | 偏差根因 |
|------|-----------|---------|---------|
| 形式化验证 | "无"（0 分） | TLA+ 形式化验证：OPK 3 条不变量（O1/O2/O3）+ C2 握手 7 条不变量（含 K3 强密钥独立性），101,467 states, 0 violations | **关键文件 `docs/tla/C2.tla` 不会出现在 `ls` 里**——外部人看到的文件结构没有"形式化验证"标签 |
| 密钥轮换 | "无轮换策略"（0 分） | Double Ratchet PQ_REKEY_INTERVAL=100, P-256 ECDH per-message ratchet, HKDF-SHA-256 派生 | 代码里有但问卷不会自动发现——需要读 `double-ratchet-pq.js` |
| 密钥版本管理 | "无"（0 分） | OPK pre-key 一次性消费、消费即销毁、TLA+ 模型验证 | 同样不可见 |

**根因**：Key Lifecycle 的证据全部是深层文件（`.tla` 形式模型、`double-ratchet-pq.js` 内部逻辑、`OPK.tla` 状态机）。外部人 5 分钟看仓库看不到这些。这不是外部人偷懒——是 CARS 问卷的第二步"自动对比"没有做"基于扫描器的证据提取"。

**纠正后预测**：如果外部人读了 `docs/tla/` 和 `packages/pqc-kem/src/double-ratchet-pq.js`，Key Lifecycle 至少 65（形式验证 + 轮换 + 前向安全性）。

**对 CARS 框架的反馈**：这是 CARS 自评工具最核心的设计缺陷。**Step 3 "与 FIBEMATE 对比"当前只展示数字，没有展示 FIBEMATE 为什么得到那个数字的具体证据。** 外部人的 0 分和内部人的 70 分完全来自信息不对称，而非判断差异。建议在 `cars-self-assessment.html` 的 Step 3 中，对每个偏差 >20 分的维度，自动展开 FIBEMATE 的具体证据文件路径（如 `docs/tla/C2.tla → K3 strong key independence`）。

---

### 3. Organizational Readiness（-30）：见树不见林

| 子项 | 外部人判断 | 实际情况 | 偏差根因 |
|------|-----------|---------|---------|
| 安全治理文档 | "有部分文档"→ 35 | SECURITY.md + THREAT_MODEL.md + VULNERABILITIES.md + security-limitations.md + GOVERNANCE.md 共 7 个安全文档 | 外部人只看到了 README 和 SECURITY.md，不知道 `docs/` 下的完整体系 |
| 第三方审计 | "计划中"→ 扣分 | 自评也写了 `status: false`（Q4 2026），不加分 | 这个一致 |
| Bus Factor | "1 人"→ 扣分 | 自评也写了 `Bus Factor=1`，承认硬伤 | 这个一致 |
| CI/CD | 未提及 | CI 6/6 + Nightly Phase1 2/2 + Phase2 4/5 + OpenSSF passing badge | 外部人没注意到 GitHub Actions badge |
| OpenSSF | 未提及 | passing badge, project #13695 | 同上 |

**纠正后预测**：如果外部人看到 `docs/` 下 7 个安全文档 + OpenSSF badge，Organization 至少 55。

---

### 4. Algorithm Agility（+10）：外部人比内部人乐观

这是唯一一个外部人评分**高于**内部基线的维度。

| 子项 | 外部人判断 | 内部基线 | 分析 |
|------|-----------|---------|------|
| 接口抽象层 | "有"（选了最高选项）→ 50 | 40（认为"无插件式注册表"） | 外部人看到 `hybrid.js` 的 KEM 接口后认为"有抽象就够了"；内部人知道这个抽象层从未被第二个算法实现验证过——M1 issue 就是为此而建 |
| 替换成本 | "10-100 行"→ 乐观 | "需要改多处硬编码" | 外部人低估了 P-256 的 30 个间接引用和 `gm.js` 的 SM2 硬编码耦合 |

**解释**：外部人 5 分钟看到的抽象层比内部人 2 个月维护看到的耦合要浅。这不是外部人"错"——是表面抽象≠深层可替换。M1（KEM 接口抽象）和 H2（SM2 签名解耦）正是要解决这个"看起来有、实际上没有"的问题。

**对 CARS 框架的反馈**：Algorithm Agility 是唯一一个可能存在"外部高估"的维度。因为接口的存在感强，但替换的真实成本隐藏在 30 个间接引用、CI 脚本、benchmark 脚本中。建议 CARS 的 Agility 维度增加一个"替换验证"子项——即"是否有过一次真实的算法替换记录"，而不是仅看接口是否存在。

---

## 偏差分类总结

| 偏差类型 | 维度 | 偏差值 | 可纠正性 |
|---------|------|--------|---------|
| **信息不可见**（深层文件） | Key Lifecycle | -70 | ✅ 在 Step 3 展示证据文件路径后可纠正到 ~65 |
| **信息不可见**（目录广度） | Org Readiness | -30 | ✅ 展示 docs/ 文档清单后可纠正到 ~55 |
| **信息不可见**（自动化输出） | Crypto Inventory | -20 | ✅ 展示扫描器 JSON 后可纠正到 ~90 |
| 认知一致 | Protocol Coupling | -10 | 🤝 双方都看到部分耦合 |
| **外部高估**（表面抽象≠深层替换） | Algorithm Agility | +10 | ⚠️ 需要第三个算法实现来验证 |

---

## 核心结论

1. **CARS 最有价值的输出不是分数，是偏差方向。** 26 分的综合偏差中，25 分来自信息不对称（内部文件对外部人不可见），仅 -10 分来自真正的认知差距。

2. **Key Lifecycle 是关键盲区**（-70）。TLA+ 形式化验证是 FIBEMATE 最强但又最不可见的资产——`.tla` 文件不会出现在 `ls scripts/` 或 README 的 feature list 里。

3. **Algorithm Agility 是唯一可能被高估的维度**。接口存在≠可替换。M1 和 H2 两个 good-first-issue 就是为这个差距设计的。

4. **对 CARS 自评工具的改进方向**：Step 3 对比页需要展示"为什么 FIBEMATE 是这个分数"的具体证据文件路径，而非只展示数字。偏差 >20 分的维度应自动展开证据。

---

## 建议动作

| 优先级 | 动作 | 目标 |
|--------|------|------|
| P0 | 在 `cars-self-assessment.html` Step 3 增加偏差维度的证据文件路径展示 | 缩小信息不对称 |
| P1 | 把 `docs/tla/C2.tla` 的存在写进 README 的功能列表 | Key Lifecycle 从 "0 分印象" 到 "有形式化验证" |
| P2 | 完成 M1（KEM 接口抽象）— 这是 Algorithm Agility 从 "看起来有" 到 "真的有" 的关键一步 |
| P3 | 完成后，让同一位外部人重新跑一次问卷，对比纠正前后的偏差 | 量化 CARS 工具的"信息充分度" KPI |

---

> **一句话**：FIBEMATE 的 CARS 实际分数可能更接近 65-70（而非外部人看到的 41），但前提是自评工具需要展示证据文件路径，而不能只展示数字。CARS 框架的下一步进化方向应该是"可验证的自评"——分数旁边附上证据。
