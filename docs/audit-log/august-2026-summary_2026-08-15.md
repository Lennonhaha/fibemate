# 八月总结：失败教训 · 错误复盘 · 进度快照
> 2026-08-15 | HEAD: 7f285eb24 | 08月提交 308 次

---

## 一、八月失败教训（按严重程度排序）

### 🔴 P0 级：编码损坏（反复踩坑，累计损失约 6 小时）

**事故 1：38 个文件 GBK 双次误解码（08-13/14）**
- **根因**：中文 Windows PowerShell 的 `>` 重定向、`Set-Content -Encoding UTF8`、`Out-File` 把 UTF-8 字节流按 GBK 误解码后写出，导致三类损坏：U+FFFD 替换符（不可逆）、吞换行（代码级灾难，函数定义被并进注释）、引号/反引号损坏（模板字符串语法错）
- **波及**：38 个 JS/HTML/MD 文件，MEMORY.md 两处 NUL 字节，sm-v12.js / session-manager.js 双重损坏（不可逆，需 8/31 后重构）
- **修复**：node `fs.writeFileSync(path, content, 'utf8')` 逐文件重建，CI bom-check 恢复绿
- **教训 1**：**PowerShell 的 `>` 是 UTF-16 编码，会把 UTF-8 字节写坏。禁止用 `>`、`Set-Content`、`Out-File` 写任何含非 ASCII 字符的文件，一律用 `node fs.writeFileSync(..., 'utf8')`**
- **教训 2**：**git diff 显示乱码 ≠ 文件损坏**——是 PowerShell 显示层 GBK 误读，用 node 直接读文件验证
- **教训 3**：**U+FFFD 是「不可逆损坏」铁证**，一旦出现只能从备份/历史重写，无法自动还原

**事故 2：字面 U+FFFD 字符导致 CI 编码检查失败（08-15，三踩同坑）**
- **根因**：写文档时举例「乱码长什么样」把字面 `�` 字符写进 .md 文件，`check-encoding.cjs` 把它当编码损坏检测出来
- **波及**：`docs/audit-log/encoding-repair_2026-08-14.md` → `168b8bbbb` 修复；`github-repo-triple-audit_20260815.md` → `f4db47dda` 修复；`sm2-frontend-verification.html` 含 52 个 GBK→UTF-8 损坏字符 → `7f285eb24` 重写
- **教训**：**进 git 的 .md，若要「举例说明乱码符号」，必须写转义 `\uFFFD`，禁止写字面 `�` 字符**。规则已写入 TOOLS.md，同类坑 08-14/08-15 已踩 3 次。

**事故 3：sm2-frontend-verification.html GBK 字节被当 UTF-8 保存（08-15，16:49）**
- **根因**：原始文件 GBK 编码，某次工具保存时被当 UTF-8 写入，52 个中文字符的 GBK 字节被错误解释成 Extension B 汉字（U+9000-U+9FFF 区，如「驗」「鏈」「鑰」），Tauri/WebView2 渲染不出，显示乱码方块
- **修复**：基于上下文逐字符推断正确字，共 52 处全部还原，文件完全重写（518 个正确汉字，U+FFFD=0）
- **教训**：**GBK 文件禁止用 UTF-8 模式打开后保存**，等效于字节层破坏

---

### 🟠 P1 级：判断错误与认知偏差

**判断错误 1：IANA #4590 混淆为端口号申请（08-15）**
- **错误**：以为用户指令「申请 IANA 端口号」是正确的，浪费 20 分钟核查 IANA 申请流程
- **事实**：IANA #4590 是 TLS 命名组编号，不是端口号；FIBEMATE 无端口号申请需求（全部服务端口本地/私有）；IANA 申请周期 6-12 个月，8/31 前不可能完成
- **教训**：**收到涉及外部机构申请（IANA/IEEE/论文）的指令，先核实前提是否虚构，再执行**

**判断错误 2：CodeQL 告警数字分页截断（08-15，多次）**
- **错误**：上午多轮拿到「25 条」「100 条」告警，误以为是全量，实际是分页/筛选视图截断
- **事实**：全量 253 条（8 error + 105 warning + 140 note）；修复后重扫 182 条（SSRF→warning 后 9 error）
- **教训**：**gh api 拉 GitHub 数据必须循环分页（per_page 有限额，Link header 判断是否有 next），只拉一页必漏**

**判断错误 3：Slaman 数学宇宙模型接受为可行方案（08-15）**
- **错误**：以为用户提出的 Slaman 模型 + CH↔Laver 公理切换 + AI 粒子云是可在工程中实施的方案
- **事实**：① Hamkins 数学宇宙（多元宇宙）归因错；② CH↔Laver 不对称（连续统层 vs 大基数层）；③ 安全假设 ≠ 数学公理（LWE 是计算复杂度假设，不能切换宇宙）
- **结果**：在设计阶段即被驳回，**从未进入任何正式文档**（`07-proof-chain-panorama.md` 从未写入相关内容）
- **教训**：**安全假设不可可视化为可切换公理，收到涉及公理/宇宙/AI 意识的密码学方案需严肃驳回**

**判断错误 4：CARS 分数「加权 vs 简单平均」之争（08-15）**
- **错误**：以为 67.0 vs 75.20 是「加权方式不同」导致的，尝试说服用户统一
- **事实**：根因是 `scorecard.json` v3 过时（缺 08-05 后改进），radar 已更新到 [90/61/82/73/70]，scorecard 未回写。五维真实最新值 [95/61/82/73/70] → 加权 77.30
- **教训**：**先查权威数据源（scorecard.json 变更历史）再争论算法，口径矛盾往往是数据过时而非计算方式错误**

---

### 🟡 P2 级：技术实现缺陷

**缺陷 1：mixnet SSRF 白名单漏洞（08-15，CodeQL #578）**
- **根因**：`forwardToNextHop` 中 `nextHop` 来自 req.body（用户可控），直接拼进 `fetch(http://${nextHop}/relay)` 无任何校验
- **影响**：可打云元数据接口（169.254.169.254）+ 内网 Redis（若 mixnet 节点部署在可访问内网的环境）
- **修复**：正则 `^([A-Za-z0-9._-]+):(\d{1,5})$` 严格 host:port 格式 + `--peers` 白名单，默认拒绝一切
- **教训**：**任何外部输入拼 URL 必须白名单，拒绝一切异常比接受一切更安全**

**缺陷 2：HTML 内 JS 引号提前闭合（08-15，CodeQL syntax-error）**
- **根因**：`www/app.html:581` 和 `www/settings.html:447` 历史编辑时写了 `const API_BASE = 'window.location.origin + '/api';`（内层单引号提前闭合）
- **影响**：两个页面 JS 直接跑不起来
- **教训**：**内嵌 HTML 的 `<script>` 块中的字符串引号需格外小心，CodeQL 的 error 级 syntax-error 要逐条读源码核实**

**缺陷 3：我引入的新 log-injection（08-15，CodeQL #624）**
- **根因**：修 SSRF 时在拒绝分支写了 `console.error(\`[Node ${PORT}] Rejected forward to non-whitelisted nextHop: ${nextHop}\`)`，`nextHop` 来自 req.body → 产生新 #624
- **教训**：**修复安全漏洞时引入新漏洞是常见错误，新代码同样需要安全审查**

**缺陷 4：Electron app.asar 源码本身就有乱码（08-15）**
- **根因**：解包 Electron 2.20.0 备份 `app.asar` 后发现 `app.html` 也有乱码字符（18 个在 HTML 注释，9 个在可见内容）——ASAR 打包时源码就已损坏，不是 Tauri 移植引入
- **教训**：**Electron 2.20.0 的乱码是历史遗留问题，Tauri 3.0.0 是新干净源码，只是缺少 Electron 打包时的中文资源**

---

## 二、八月主要成就

| 类别 | 成果 | 提交数 |
|------|------|:------:|
| 编码修复 | 38 文件 GBK 损坏全修复 + CI bom-check 全绿 | 2 |
| CARS | 全站统一到 77.30（13 文件），scorecard 升 v4 | 2 |
| CodeQL | 253→182 审计 + SSRF P0 修复 + 2 语法 bug 修复 | 2 |
| Dependabot | #31 合并，#30/#29 冻结期延后，标签补建 | 2 |
| 可视化 | 木火通明 + 三层护盾 3D 架构页 + 天文分野系统 | 10 |
| 文档清理 | 首页卡片 6→7 + 文档数量 19→14 修正 + 倒计时刷新 | 3 |
| 合规 | IANA #4590 措辞修正 + HYBRID_KEX 脱敏 + publications→内部存档 | 4 |
| 重放保护 | 定稿二期方案（8/31 后 Redis/lru-cache 校验式） | 2 |
| 归档 | 61 份审计日志 + 3 份合规修正记录进 git | 3 |
| MEMORY | 恢复 + D-15~D-19 补记 + 08-15 全日志 | 2 |
| Tauri | 升级 2.20.0→3.0.0（Electron→Rust，体积缩小 66%）| — |
| sm2-frontend | GBK 损坏重写，518 正确汉字 | 1 |
| **合计** | **08-01~08-15** | **308 次提交** |

---

## 三、当前进度快照（08-15）

### 三端状态
```
本地 HEAD:    7f285eb24
GitHub:       7f285eb24 ✅ (2026-08-15 17:08 +0800)
服务器:       7f285eb24 ✅ (待推送)
08月提交:     308 次
```

### 核心模块状态

| 模块 | 状态 | 备注 |
|------|:----:|------|
| ML-KEM-768 (FIPS 203) | ✅ | NTT 域实现，KAT 10k / Noble 200/200 / liboqs 10k/10k |
| ML-DSA-65 (FIPS 204) | ✅ | fml-dsa 自研 + noble 交叉验证 |
| SLH-DSA-128s (FIPS 205) | ✅ | WASM WebWorker 异步加载 |
| SM2/SM3/SM4-GCM | ✅ | TVLA 全部 PASS，hybrid 加密 10/10 |
| 双棘轮 PQ Hybrid | ✅ | ML-KEM-768 + P-256 混合，4 轮双向 |
| TLS 1.3 Hybrid | ✅ | Path C-2 E2E 5/5 |
| TLA+ 形式验证 | ✅ | Path C-2，7 不变式，101,467 states |
| FPGA | ✅ | Artix-7 35T，WNS=9.755ns，UART 物理验证 |
| CARS 分数 | ✅ | 全站 77.30（v4） |
| CodeQL | ✅ | P0 已修复（182 条，9 error→待 8/31 后 dismiss） |
| CI/CD | ✅ | 24 路全绿 |
| www/docs HTML | ✅ | 52 个页面 |
| TSR 存证 | ✅ | 135 份 DigiCert 时间戳 |
| Dependabot | ✅ | #31 merged / #30/#29 冻结 |
| 文档合规 | ✅ | 无「后量子加密」/ 无夸大 IANA 措辞 |
| publications | ✅ | 内部存档（06-28 决策：不投稿） |

### 冻结期剩余待办（8/31 前）

| 优先级 | 项目 | 状态 |
|:------:|------|:----:|
| P0 | 8/31 开源公告 6 份草稿定稿（用户侧） | ⏳ 审阅中 |
| P0 | 服务器推送（HEAD `7f285eb24`） | ⏳ 待执行 |
| P1 | CARS 数字权威值定稿（77.30 已全站统一） | ✅ |
| P1 | 可视化权威数量定稿 | ⏳ 待拍板 |
| P2 | E 盘备份更新（用户侧） | ⏳ 用户执行 |
| P2 | 2 个不可逆损坏文件（sm-v12.js / session-manager.js）| ⏳ 8/31 后 |

### 发布后待办（REMINDER.md §4）

| 项目 | 说明 |
|------|------|
| Rate limiting | express-rate-limit 中间件消除 55 条 warning |
| Log-injection | 4 条脱敏/删除（含我引入的 #624） |
| 误报 dismiss | #123/#122/#37/#36/#543/#28/#579 等 ~190 条 |
| Replay protection | Redis/lru-cache 校验式二期方案 |
| Dependabot #30 | @noble/post-quantum 0.6.1→0.7.0（无 breaking，已核查） |
| Dependabot #29 | eslint 9→10（major） |
| VWZ 优化 | Rust 侧惰性缓存（experimental/vwz-lg 分支） |
| Tauri 中文字体 | 改善 WebView2 字体栈覆盖 Extension B 汉字 |
| lattice-estimator | SageCell 验证 ML-KEM-768 BKZ β≈400 |
| TLA+ liveness | `<>(cState[i]="active" /\ sState[i]="active")` |

---

## 四、关键教训一句话

1. **PowerShell `>` 写文件会损坏 UTF-8**：永远用 `node fs.writeFileSync(..., 'utf8')`
2. **U+FFFD 不可逆**：进 git 的 .md 举例乱码必须写 `\uFFFD` 转义
3. **gh api 必须分页循环**：per_page 有限额，只拉一页必漏
4. **安全修复引入新漏洞是常态**：新代码同样要安全审查
5. **IANA #4590 = TLS 命名组，不是端口号**：先核实前提再执行
6. **CARS 口径矛盾通常是 scorecard 过时**：先查 changelog 再争论算法
7. **公理/宇宙/AI 意识 ≠ 安全假设**：密码学方案收到此类描述需严肃驳回
8. **外部输入拼 URL 必须白名单**：默认拒绝一切
