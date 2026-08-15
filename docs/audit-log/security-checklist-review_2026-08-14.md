# 安全审计自检清单审阅（08-14）

## 背景
用户提供 `docs/SECURITY-AUDIT-CHECKLIST.md`（v1.0/08-12）请求审阅。逐项与当前仓库真实状态核对。

## 关键发现

### 🔴 遗漏 critical：sm-crypto@0.4.0 可预测 SM2 密钥生成
清单第六节声称「23 条 Dependabot 告警全为传递性依赖，0 条触及核心 PQC 代码」——**不成立**。

根目录 `npm audit` 实测 5 漏洞（2 moderate + 2 high + 1 critical），其中 critical：
- `sm-crypto < 0.5.0`（实际 0.4.0），GHSA-vh45-f885-3848：SM2 密钥生成可预测（Math.random + 时钟）
- 依赖链：`package.json:31` 直接依赖 → `www/crypto/sm2-browser.js` → `sm2.generateKeyPairHex()` → `utils.js` `new SecureRandom()`（jsbn）→ `Math.floor(65536*Math.random())` + 时钟
- 影响：`www/crypto/hybrid-kem-client.js` + `reg-server/hybrid-kem-client.js` 的混合 KEM SM2 ECDH 密钥对生成 → 私钥可预测

**为什么清单漏了**：第六节只查 `packages/*` 七个包（algorithm-registry/fml-dsa/key-lifecycle/pqc-kem/sm2-ref/sm3-ref/sm4-ref），sm-crypto 挂在根目录 package.json，不在扫描范围。

### ⚠️ 数字过时
| 项 | 清单 | 实测 |
|---|---|---|
| Dependabot alerts | 23 (10H/8M/5L) | 45 (12H/23M/10L) |
| timestamp-manifest | v3=126 条 | www/docs/ = v4=215 条 |
| npm audit | 仅 www/ 剩 4 | 根目录另有 5（含 1 critical） |

### ✅ 准确部分
199/199 KAT、TVLA（SM2 masked 0.72 / ML-KEM-1024 3/3）、TLA+ C2 7 不变式、ESLint 归零、OpenSSF 5.2 Bronze、VWZ/LookingGlass 实验性声明、冻结期纪律、Sign-off 表。

## 结论与待办
- 清单结构完整、质量高，但第六节「0 条触及核心」的说法需修正。
- 待用户确认：sm-crypto 处理方式（声明+8/31后升级 0.5.5，还是 8/31 前处理）。
- 修正项：①第六节加 critical ②第七节加 sm-crypto 直接依赖行 ③Dependabot 45/manifest 215 同步。

## 关联文件
- docs/SECURITY-AUDIT-CHECKLIST.md（待修正）
- docs/NPM-AUDIT-STATUS.md（干净 UTF-8，但同样漏 sm-crypto，因只扫 packages/*）
- 临时脚本：_find-smcrypto.cjs / _find-sm2browser.cjs / _find-sm2browser2.cjs（可清理）
