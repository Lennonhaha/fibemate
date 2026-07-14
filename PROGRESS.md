# FIBEMATE 项目进度 & 工作计划

> **更新日期**：2026-07-09 08:05
> **目标**：2026.08.31 开源  
> **TSR 时间戳**：lg-001 ~ lg-058（FreeTSA 为主 + DigiCert 双源）  
> **GitHub**：Lennonhaha/fibemate — master 2e3e7ee (932 files, 8.3MB, Community 100%, CI 三管线全绿)

---

## 一、总览

| 维度 | 状态 | 说明 |
|------|:----:|------|
| 核心密码学 (ML-KEM-768) | ✅ | KAT 10k / TVLA 10k / C+WASM+JS 三实现 |
| SLH-DSA (FIPS 205) | ✅ | pqc_sphincsplus WASM 集成 |
| SM2 国密 | ✅ | v1.3 wNAF+Comb 性能升级 / TVLA 10/10 / SM2-SM4 Hybrid 10/10 |
| PQC 混合握手 | ⏳ | 路径 C-2 E2E 5/5 验证通过 / TLS Record 层仍为经典 ECDHE / oqs-provider 编译链就绪 |
| LookingGlass v1/v2 | 🔬 | v1 已归档 / v2 定位修正为群表示代数实验+逆向混淆工具 / 默认关闭 / lg-001~041 存证 |
| VWZ 签名 | 🔬 | Rust WASM 7/7 / k=8 / 安全性待同行评议 / 默认关闭 |
| FPGA 硬件加速 | ⏳ | v5.3 合成+烧录通过 (WNS=8.14ns) / pipe2 256/256 零误差 / UART 物理层待 CP2102 替换 |
| 官网 & 文档 | ✅ | 全站合规修正完成 / 路径 A 搁置标注 / LG 安全宣称全量剥离 / TSR 69 一致 |
| 后端服务 | ✅ | systemd 托管 / Nginx 反向代理 / 全线上 |
| GitHub 开源仓库 | ✅ | 932 文件 8.3MB / Community 100% (6/6) / CI 三管线全绿 / TVLA 证据已恢复 / dead code 已清理 |
| npm 发布 | 🔒 | CCF 双盲冻结中 |
| NLnet 资助 | ⏳ | 审核队列（预计 9-10 月出结果） |
| 第三方审计 | ⏳ | 待开源前启动 |
| 磁盘备份 | ⚠️ | E 盘 SMART Warning / 关键数据已备份 |

---

## 二、已完成

### 2.1 核心密码学 (2026-06-18 ~ 07-07)

- [x] ML-KEM-768：JS 参考实现 + C Native Addon (AVX2) + WASM 三实现
- [x] KAT 一致性 10,000/10,000 全通过
- [x] Keccak ROL64 底层 bug 修复 + 全项目排查 (keccak-rol64-audit_2025-06-19.md)
- [x] SLH-DSA (FIPS 205)：pqc_sphincsplus WASM 编译 + 集成 (slh-dsa-wasm-plan.md)

### 2.2 SM2 国密

- [x] 5 阶段优化（Native BigInt → Jacobian → 预计算 → wNAF → Barrett）
- [x] TVLA v3 Masked N=10,000 高阶 1-4 阶 20/20 全绿 (max|t|=1.82)
- [x] Scalar masking 修复：旧版 (k+rN)%N≡k → k+rN 原始整数
- [x] SM2-SM4 Hybrid 加密 10/10: roundtrip + tamper + 10KB + empty + envelope
- [x] AAD 修复：统一用 c1[:32] 做 GCM auth tag
- [x] SM2 前端集成 11/11 全链路通过

### 2.3 PQC 混合握手

- [x] 路径 C（TLS Exporter 后握手混合密钥交换）: 900/900 全绿上线
- [x] 路径 C-2（SM2+ML-KEM-768 应用层）: E2E 5/5, lg-053 存证
- [x] p95=78.5ms, 零 session 泄漏, 不改 Nginx/OpenSSL
- [x] liboqs 0.12.0 + oqs-provider 0.11.0 编译安装就绪
- [x] IETF I-D draft-yang-tls-hybrid-sm2-mlkem 升级至 -04


### 2.4 2026-07-07 — 文档合规审计 + 代码清理 + LookingGlass 定位修正

- [x] **全站 LG 安全宣称剥离**：pqc-readiness §7 / README / index.html 全量重写
  - "锁死格分解捷径"→"纯无损线性变换，无法提升 LWE 硬度"
  - "从根源封锁子格分解"→"攻击者可整体消去"
  - "可封堵所有捷径类代数攻击"→删除，改为"探索性研究实验"
  - 爱丽丝镜中棋盘叙事 → 诚实揭示"高斯消元可一步剥离"
- [x] **路径 C-2 措辞修正**：不再宣称"已上线 ✅"，改为"E2E 验证通过，TLS Record 层仍为经典 ECDHE"
- [x] **LG v2 定位转型**：从"等变 LWE wreath 递归纵深防御"→"群表示代数实验 + 逆向混淆工具"
- [x] **外部专业审阅接收**：四条核心批判 80% 完全成立，舒尔引理误用、纯线性无安全增益、BKZ 透明穿透
- [x] **死代码清理**：41 Git 文件 + ~570MB 磁盘垃圾 (.bak/target/wasm/gz)
- [x] **TVLA 证据恢复**：7 个测试脚本 (N=5k/10k masked) + 23 份 TSR 报告从初始提交归档
- [x] **LG v1 代码归档**：从 D 盘恢复到 www/crypto/lgv1/
- [x] **全站零违禁词验证**："纵深防御/镜面防御/封堵/锁死/代数捷径/结构安全空白" 全站清零
- [x] **GitHub 推送**：5d1ae97 → c26b0c3 (8 commits), 902 files, 190MB
### 2.5 2026-07-07 — Nginx OCSP 修复 + 万用表物理验证 + 编译路径修复

- [x] **Nginx OCSP 配置移除**（两站）：Let's Encrypt E8 证书无 OCSP URL，移除 ssl_stapling，消除日志告警
- [x] **FPGA v5.3 物理验证**：万用表实测 PMOD1 uart_tx=3.26V, NTT PASS=3.28V, bitstream 全链路正常
- [x] **CH340G 0 字节根因确认**：FPGA 3.3V LVCMOS 输出 3.26V低于 CH340 5V 阈值 3.5V，电平不匹配
- [x] **zeta_rom.v 路径修复**：绝对路径改为相对路径 ../../sim/zetas_mont.mem，跨设备可编译

### 2.6 前沿研究 (LookingGlass + VWZ)

- [x] LookingGlass DMTH：36/36 TVLA 全绿, d=2~3, 默认关闭
- [x] DMH→DMTH 术语修正 + 安全结论修正 (dmh→dmth-correction.md)
- [x] LookingGlass v2 (等变 LWE wreath 递归): 代数层面闭环, WASM 编译 6/6
- [x] VWZ Hash-and-Sign：Rust WASM 23/23 全绿, k=8
- [x] VWZ Rank-1 公钥压缩：Rust WASM 7/7, 8.5× 压缩
- [x] Hull 攻击评估：Õ(q¹³⁰) ≥ 2²⁰⁸⁰ 不可行
- [x] BKZ 安全估计 ≥128-bit
- [x] L8+L9 检测链路集成 43/43 全绿

### 2.7 FPGA 硬件

- [x] Artix-7 35T @ 50MHz, v5 合成通过 (WNS=7.96ns)
- [x] 4 新模块：lfsr256_prng / ntt_masked_wrapper / ntt_fault_protect / hw_monitor
- [x] REMO 双蝶形实时比对 (bf_mismatch)
- [x] RAM 奇偶校验 + 周期看门狗 (fault_protect + hw_monitor)
- [x] bitstream 541KB 烧录成功
- [x] NTT/INTT 裸核心仿真全绿
- [x] pipe2 集成层 192 错误定根因：Scale 阶段 WB_B 覆盖写回 (addr_a==addr_b)
- [x] stage_cnt 边界修复 (stage_cnt < 3'd6, AQ_DEPTH=256)
- [x] CH340G 诊断：自环无回显，判定模块烧毁 → 转 FT4232H
- [x] Vivado DRC 修复 + 中文路径 → 虚拟盘符 X:

### 2.8 官网 & 合规
- [x] 全站 4 页 P0 虚假声称修正 (pqc-readiness / index / fpga-report / security)
- [x] 路径 A (TLS NamedGroup) 全站搁置标注（6 处，含 hero/FAQ/table/footer/blog）
- [x] IANA #4590 合规修正（5 处）
- [x] 法律合规审计 15 处修正
- [x] Nginx .link/.net 双域名对齐
- [x] styles.css 404 修复 ✅ 200
- [x] 国密表述脱敏：全栈集成→技术验证、后量子加密→参考实现
- [x] TSR 存证 lg-001~055 全绿，FreeTSA + DigiCert 双源

### 2.9 开源自检

- [x] 仓库 281MB→7.9MB (15,766→893 tracked files)
- [x] .gitignore 修正（index.html→/index.html，释放 www/index.html）
- [x] 根目录清理 71→11 文件
- [x] 删除 .bak 快照目录、旧 fips203 变体、profanity-bak、CFCA PDF
- [x] PROGRESS.md 日期 06-18→07-07
- [x] README 路径 A 搁置 + TSR 53→55 + GPLv3 一致
- [x] BUILD.md / CONTRIBUTING.md 部署
- [x] YOUR_ORG→Lennonhaha

### 2.10 专项

- [x] SM2 TVLA 论文脱稿（8 页）
- [x] NTT Pipeline 论文脱稿（6 页）
- [x] arXiv 预印本 v2 完成（5 页）
- [x] **论文投稿全部取消**（2026-06-28 02:30），LaTeX 保留归档
- [x] SSH 恢复：安全组白名单同步本机 IP 变更 (218.9.127.63)
- [x] FIBEMATE 全量备份（E 盘 + 服务器）

---

### 2.11 2026-07-07 18:01+ — 外部专业审阅响应 + LG v2 最终定位

- [x] **外部审阅者四条核心批判接收**（80% 完全成立）：
  - 舒尔引理误用：七层不可约表示高斯消元毫秒级可解
  - VWZ 36 字节签名安全强度 ≤ 288 位，与声称矛盾
  - 路径 C 混合加密 sessionKey 未进入 TLS Record Layer（nginx 纯 ECDHE X25519）
  - LG v2 数学不可合并性证明存在形式化漏洞
- [x] **LG v2 最终定位转型**：放弃所有密码学安全目标，仅作为静态逆向混淆工具
- [x] **VWZ 自检**：识别 24 处虚假声明并修正（"已启用"→"计划中"或"待实装验证"）
- [x] **全站文档整改**：删除违规措辞，未完成项降级标注

### 2.12 2026-07-08 — CI/CD 修复 + GitHub Community 100% + 移动端启动

- [x] **GitHub Actions 三管线修复**：npm ci→npm install + 移除 cache + 移除不存在的 pq-wasm job + 测试路径 __dirname 解析
- [x] **GitHub Community 评分 57% → 100%**：CODE_OF_CONDUCT / SECURITY.md / PR_TEMPLATE / CHANGELOG.md / Description 修复
- [x] **Issue 模板三文件**：bug_report.yml / feature_request.yml / config.yml
- [x] **Discussion #4 CI 全绿公告** + **Discussion #5 Q&A**
- [x] **React Native 移动端启动**：Expo 项目创建 (RN 0.86.0)，13 依赖包，18 JS 密码文件，Web 导出 477 模块 770KB 零错误
- [x] **官网更新**：GitHub Corner + Hero 仓库链接 + Footer OSS 标识

### 2.13 2026-07-09 — SM2 ECC v1.3 + SM3 v2.0 性能 patch + lg-058

- [x] **SM2 ECC v1.3** (sm2-bigint-ec.js, 357→441 行)：
  - wNAF(w=4) 替换二进制 double-and-add：Add ops 256→~51（↓80%）
  - Comb 固定基点 G 表：全局缓存，首次构建后零成本
  - Montgomery 批量求逆：表构建仅 1 次模逆
  - TVLA 防护（scalar masking + projective randomization）全部保留
  - 10/10 功能测试全绿（sign/verify/enc/dec/边界/表复用）
  - commit `4d51284`
- [x] **SM3 v2.0** (sm3.js, 210→226 行)：
  - 64 轮完全内联（leftRotate/FF/GG/P0 展开为表达式）
  - T_j 常量预计算表：消除每轮 j%32 运行时移位
  - W' 流式计算：无 W1[64] 分配
  - 两段循环分离：XOR 布尔函数 vs 与或布尔函数
  - KAT 验证：SM3('abc') = 66c7f0f4...f4ba8e0 ✅
  - 性能：1000-byte 哈希 ~0.2ms（纯 JS，无 WASM/asm.js）
  - commit `f319225`
- [x] **TSR lg-058**：sm2-bigint-ec.js + sm3.js + index.html 级联 SHA256 → FreeTSA Granted（Serial 0x060E31C9, Jul 8 21:35:58 GMT）
- [x] **官网同步**：index.html 日期 07-09 / TSR 57→58 / SM2 (v1.3) / 最新徽章 lg-058；pqc-readiness.html SM2 perf 描述 + SM3 v2.0 行
- [x] **三站闭环**：TSR → 官网 → GitHub (commit `2e3e7ee`)，CI 三条 pipeline 全绿

## 三、待完成

### 🔴 P0 — 开源前必须完成

| 编号 | 任务 | 状态 | 预估 | 阻塞项 |
|------|------|:----:|------|--------|
| P0-1 | FPGA pipe2 仿真收敛（192→0 errors） | ⏳ | 2d | v5.2 文件丢失需恢复 |
| P0-2 | FPGA UART 验证（FT4232H 替代 CH340G） | ⏳ | 1d | 杜邦线 + FT4232H 接线 |
| P0-3 | wasm-opt ML-KEM WASM 优化 | ❌ | 0.5d | — |
| P0-4 | npm publish (@fibemate/*) | 🔒 | 1d | CCF 双盲解除 (≈2026.08) |
| P0-5 | GitHub README 英文化 | ❌ | 2d | — |
| P0-6 | 第三方密码学审计启动 | ⏳ | 4-6w | 开源后 |

### 🟡 P1 — 开源后可迭代

| 编号 | 任务 | 状态 | 预估 |
|------|------|:----:|------|
| P1-1 | FPGA v5.2 RTL 恢复（从 Vivado 项目或旧备份） | ⏳ | 0.5d |
| P1-2 | ntt_masked_wrapper + lfsr256_prng 集成接线 | ⏳ | 1d |
| P1-3 | 物理 TVLA 设备采购 + 示波器测试 | ❌ | — |
| P1-4 | VWZ 前端 WASM loader 完成 | ⏳ | 1d |
| P1-5 | VWZ rank-1 压缩实装到服务端 | ⏳ | 1d |
| P1-6 | PROGRESS.md 英文化 | ❌ | 1d |
| P1-7 | CI/CD 流水线 (GitHub Actions) | ❌ | 2d |
| P1-8 | 移动端 (React Native) 完成 | ⏳ | 4w |
| P1-9 | Tauri v2 桌面端完成 | ⏳ | 4w |

### 🟢 P2 — 按需推进

| 编号 | 任务 | 状态 | 说明 |
|------|------|:----:|------|
| P2-1 | NLnet 资助结果等待 | ⏳ | 预计 9-10 月出结果 |
| P2-2 | 社区文档（开发者指南 + API 参考） | ❌ | 开源后启动 |
| P2-3 | I-D -04→-05 升级（含路径 C-2 实现状态） | ⏳ | — |
| P2-4 | E 盘更换 + 数据迁移 | ⚠️ | SMART Warning |
| P2-5 | Nginx→OpenSSL 3.2 升级（取消 oqs-provider 依赖） | ⏳ | 远期 |

---

## 四、活跃约束与已知问题

| 问题 | 影响 | 状态 |
|------|------|:----:|
| 所有论文投稿已取消 | LaTeX 保留归档，不推进 | ✅ 决策已执行 |
| 路径 A 正式搁置 | TLS NamedGroup 浏览器/nginx 双重阻断 | ✅ 全站标注 |
| CH340G 电平不匹配 (3.3V FPGA vs 5V CH340G) | UART 物理层验证阻塞 | ⏳ 待换 CP2102/FT232 3.3V 模块 |
| FPGA v5.2 RTL（历史） | 2026-07-07 已从 testbench 逆向恢复，v5.3 合成+烧录通过 | ✅ 已解决 |
| LookingGlass v2 定位修正 | 拆卸所有安全宣称，转为群表示代数实验+逆向混淆工具 | ✅ 全站修正完成 |
| E 盘 SMART Warning | 数据丢失风险 | ⚠️ 已备份 |
| CCF 双盲冻结至 2026.08 | npm publish / 公开讨论受限 | ⏳ 等待 |
| Nginx `.link`/`.net` OCSP 警告 | 不影响功能 | 🟡 低优 |
| `index.html` 曾被 .gitignore 排除 | 已修复（改为 /index.html） | ✅ |

---

## 五、NLnet 资助

| 项目 | 详情 |
|------|------|
| 申请编号 | 2026-06-158 |
| 基金 | NGI Zero Commons Fund |
| 金额 | €25,000 |
| 提交日期 | 2026-05-07 |
| 状态 | 审核队列中 |
| 预计结果 | 12-15 周，约 2026 年 9-10 月 |
| 审稿人访问 | http://8.156.77.68:3001 |

---

## 六、风险 & 注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| E 盘 SMART Warning | 可能数据丢失 | 关键文件已 D 盘 + 服务器双备份 |
| CCF 双盲冻结至 2026.08 | npm/GitHub 公开受限 | 优先完成内部开发任务 |
| NLnet 不通过 | 资金缺口 | 不影响开源计划 |
| CH340G 烧毁 | 硬件调试阻塞 | 转 FT4232H 替代方案 |
| v5.2 RTL 丢失 | FPGA 仿真无法继续 | Vivado 项目/旧备份恢复 |

---

> 📌 **下一步行动**（更新于 2026-07-09 08:05）：
> 1. **CH340G → CP2102/FT232 替换** → UART 物理层验证（FPGA 主线硬件闭环）
> 2. **GitHub 分支保护规则**（网页手动）：Settings → Branches → Add rule → master + Require PR + 1 approval
> 3. LG v2 逆向混淆工具独立仓库建仓（可选）
> 4. wasm-opt WASM 体积裁剪（可选）
> 5. VWZ 签名安全性外部评审（可选）
> 6. CCF 解冻 (2026-08) → npm publish + GitHub README 英文化
> 7. 第三方审计启动（开源前）
> 8. 物理 TVLA 设备采购（ChipWhisperer，有预算时）
