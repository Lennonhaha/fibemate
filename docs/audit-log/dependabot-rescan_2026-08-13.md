# Dependabot 重扫确认（54 条 open）

## 日期
2026-08-13 19:20

## 结论
54 条 open 告警与之前记录的「54 漏洞（17 high/27 medium/10 low）」**完全一致，无新增、无恶化**。重扫确认通过。

## 实测分布
| 严重级 | 数量 |
|--------|------|
| high | 17 |
| medium | 27 |
| low | 10 |
| critical | 0（sm-crypto critical 已被 dismissed=inaccurate） |

## 全部 54 条均为 npm 生态

### 按 manifest + scope
| manifest | scope | 条数 |
|----------|-------|------|
| tools/pqc-desktop/package.json | development | 31 |
| www/package-lock.json | runtime | 10 |
| package-lock.json（根） | runtime | 9 |
| package-lock.json（根） | development | 3 |
| mixnet/package-lock.json | runtime | 1 |

### 按包明细（含来源链）
| 包 | 级别 | 条数 | 脆弱范围 | 修复 | 来源 |
|----|------|------|---------|------|------|
| electron | high | 31 | <39.8.8 | 39.8.8 | tools/pqc-desktop devDependency（^28.0.0）|
| brace-expansion | high | 3 | <2.1.4 | 2.1.4 | eslint→minimatch / snarkjs→ejs→jake→filelist→minimatch |
| ws | high | 1 | <8.21.0 | 8.21.0 | 根+www 直接依赖（^8.20.1）|
| body-parser | low | 3 | <2.3.0 | 2.3.0 | express 传递 |
| js-yaml | high | 3 | <4.3.1 | 4.3.1 | 根 override 钉 4.1.1 |
| qs | medium | 6 | <=6.15.1 | 6.15.2 | express 传递 |
| path-to-regexp | high | 2 | <0.1.13 | 0.1.13 | express 传递 |
| underscore | high | 1 | <=1.13.7 | 1.13.8 | snarkjs→bfj→jsonpath→underscore |
| ip-address | high | 3 | <=10.3.0 | 10.3.1 | mongoose→mongodb→socks→ip-address |
| mongoose | medium | 1 | <9.7.2 | 9.7.2 | 根直接依赖（9.6.2）|

## 关键判断
1. **31 条 electron（57%）是开发依赖**——tools/pqc-desktop 桌面工具，不部署在服务器，8/31 开源主站不涉及。Electron 28→39 跨 11 个大版本 breaking，8/31 后单独评估。
2. **sm-crypto critical 已 dismissed（inaccurate）**——GHSA-vh45-f885-3848，FIBEMATE 只用 sm-crypto 做 KAT 对比基准，生产密钥用 sm2-ref 恒时实现，不适用。
3. **真正需关注的 8/31 生产依赖**（根+www+服务器）：
   - ws（high，直接依赖，`npm audit fix` 非 breaking 可修）
   - js-yaml（high，override 钉 4.1.1 旧版，改 override 到 4.3.1 即可）
   - path-to-regexp / qs / body-parser（express 传递，需 express 4.22.2 breaking）
   - ip-address（high SSRF，mongoose 传递，需 override）
   - underscore（high，snarkjs 传递，需 override）
   - mongoose（medium，直接依赖 9.6.2→9.7.2 minor）
   - brace-expansion（high，eslint/jake 开发工具链传递）

## 待决策
分三档处理，见回复正文方案。
