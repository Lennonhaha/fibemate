# 生产环境与主仓断层事故复盘（2026-11-16）

- **事故等级**：高危（High）
- **状态**：已定位、已止血、native 已恢复，结构性整改进行中
- **影响对象**：`fibemate.net` 生产 API（`/opt/fibemate-full`）与 ML-KEM 后端
- **相关**：#507（`packages/` 漂移）、#520（native 后端静默缺失）、#521（路由层校验）

---

## 0. 先说三处与初稿不同的事实（工程诚实优先）

初稿由人工口述整理，下列三处在核对原始输出后被更正；**结论未受影响，但依据必须准确**：

| 初稿表述 | 核对结果 |
|---|---|
| 「verifact 审计工具扫描发现 66 个文件漂移」 | **不成立**。`verifact` 是发布证据核验器（provenance/cosign/SHA256SUMS），不扫描包树。漂移由本次只读对账脚本逐文件 sha256 比对得出。 |
| 「其中 2 个是手工改过的幽灵文件」 | **撤回**。剥掉 license 头后逐行比对，两个文件的函数体与真实提交**逐行相同**（518/518、479/479 行）。blob 不匹配只因头注释被改写。初判「未知热修」是 `git log --find-object` 0 命中所致的误判。 |
| 「线上冻结在 10-28 版本 19 天」 | **不准确**。运行时是混合 vintage：native 二进制 2026-07-22、C/JS 源 2026-10-26（#342）、部分 2026-10-28（#367）、目录时间 2026-10-25。不是单一日期。 |
| 「畸形密文可致 CPU 算力击穿或 OOM」 | **未验证**。可复现的是：畸形密文被静默解出错误共享密钥并返回 200。资源耗尽没有测量证据，不作为结论。 |
| 「native 静默缺失 3 个月」 | **需精确化**：`src/index.js` 自 2026-09-02 起意图加载 `packages/pqc-kem/native/build/Release/mlkem.node`，但该路径从未生成产物（约 75 天）。2026-08-12 之前该文件并不 require 任何 `.node`，纯 JS 当时是有意设计。 |

---

## 1. 事故现象

1. 生产 ML-KEM 全程跑纯 JS，`require('./packages/pqc-kem/native/build/Release/mlkem.node')` 报 `MODULE_NOT_FOUND`，`usingNative === false`，`/proc/<pid>/maps` 中 0 条 mlkem 映射。
2. 唯一的原生产物是**孤儿**：`/opt/fibemate-full/addon/build/Release/mlkem.node`（78,760 B，2026-07-22），可加载但无任何代码引用。
3. 运行时 `packages/` 与仓库存在 66 处差异（相同 67、不同 51、缺失 15、运行时独有 11），其中含安全相关加固与合规文件。
4. 以上两点在监控上**完全不可见**：`/api/mlkem/test` 恒返回 `{"status":"ok"}`。

## 2. 影响

| 维度 | 事实 | 证据 |
|---|---|---|
| 正确性 | 无已知错误结果。native 与 JS 在 20 轮随机 + 100 组 KAT 上逐字节一致 | `reports/520-native-build-evidence-20261116.md` |
| 安全 | 线上 `decapsulate` 缺长度/类型校验，畸形密文静默返回错误 ss（200）；CSPRNG fail-closed 只存在于未运行的 C 源 | 运行时 `ml-kem-768.js` 早于 #384/#347 |
| 合规 | `packages/fml-dsa/LICENSE` 在运行时缺失；`ml-kem-768.js` 头被写成 `GPL-3.0-only`（该包实为 Apache-2.0） | #507 对账清单 E 类 |
| 性能 | 纯 JS 承担全部 ML-KEM 流量；切换原生后 `/api/mlkem/test` 中位耗时 5.5 ms → 2.2 ms | 2026-11-16 17:49 实测，各 5 次 |

## 3. 根因（五问）

1. **为什么线上没有 native？** `packages/pqc-kem/native/build/` 不存在，require 抛 `MODULE_NOT_FOUND`。
2. **为什么没有产物？** 部署脚本只同步 `src/`（`SYNC_TREES=src`），从不构建、也从不管理 `packages/`。
3. **为什么脚本只同步 src？** 脚本成型于单目录结构时期，Monorepo 化之后没有同步演进。
4. **为什么没人发现？** 加载失败被 `catch (_) { /* fall through to JS */ }` 吞掉，启动只打一行 `console.warn` 到 error.log，健康检查与站点校验都不看后端类型。
5. **为什么长期没发现？** 缺少「运行时树 == 某个 git commit」的门禁：`check-live` 校验的是静态站点（manifest/token/archive/citations），不覆盖 `packages/`。

## 4. 处置（截至 2026-11-16 17:50）

### 已完成

- **#521 路由层校验**（合并 `a08de8c`，已部署）：`/api/mlkem/decaps` 与 `/encaps` 拒绝非 hex 与长度不符的输入（400），不再把畸形请求交给底层。负向自测：撤掉该校验后同一测试 500 而非 400。
- **native 恢复**：`git archive 383b2e5 packages/pqc-kem` → `node-gyp rebuild`（Ubuntu 24.04 / gcc 13.3 / Node 22.22）→ 产物 83,528 B。
  - parity：20/20 轮 pk/sk/ct/ss 逐字节相等，双向 cross-decaps 20/20，篡改密文隐式拒绝值 20/20 相等。
  - KAT：100/100 组 `ek/dk/c/k` 全等（native 与 JS 各自全过）。
  - 部署：先落盘不重启（进程 pid 不变、maps 仍 0 条、健康 200）→ `pm2 restart` → 新 pid 5 条 mlkem 映射、`usingNative=true`、往返 true、error.log 未新增 fallback 行、`check-live` 4/4 PASS。
- **部署校验**：`x-app-version: v3.3.3 (a08de8c4)`；运行时 `src/index.js` 与仓库 sha256 一致（18 文件逐一比对）。

### 未完成

- #507：`packages/` 全量同步（E 类 15 个缺失、F 类 11 个运行时独有文件需逐个人工判定）。
- 部署链路：把 native 构建纳入部署/CI，不再依赖人工放置。
- 服务器 npm 依赖环境：`@noble/hashes@^2.4.0` 在该机 packument 上不可见（只到 2.2.0），`npm ci` 会 `ETARGET`。修好之前 #507 的「方案①（checkout + npm ci）」不可实施。

## 5. 预防纪律（即日起）

1. **不可变基础设施**：生产不接受手工改动。线上代码必须等于某个 git commit；任何「就地修一下」都视为事故。
2. **Fail loud**：核心组件（尤其密码学后端）降级不得静默。生产启动时若 native 缺失，必须产生可见告警（启动横幅 + 健康字段 + 监控指标），而不是一行 error.log。
3. **运行时 == 代码 的门禁**：部署末尾必须对 `src/` **与** `packages/` 逐文件比对 sha256；不一致即失败并回滚。
4. **产物新鲜度断言**：`.node` 的 mtime 必须晚于对应 C 源的最新提交时间，否则部署判红。
5. **三态诚实**：审计/抓取类工具遇到异常必须输出 `UNKNOWN/ERROR`，不得退化为业务含义的 `false`（#196 已修复的先例）。

## 6. 时间线

| 时间 | 事件 |
|---|---|
| 2026-07-22 | `addon/build/Release/mlkem.node` 构建（最后一次真正可用的原生产物） |
| 2026-09-02 | `src/index.js` 改为 require `packages/pqc-kem/native/build/Release/mlkem.node`（该路径从未生成产物） |
| 2026-10-25~28 | 运行时树建立；#342（SPDX）、#367（retire time-domain）等加固未进入 `packages/` |
| 2026-11-16 15:20 | 官网部署到 `6edfe54`，验证 4/4 |
| 2026-11-16 17:20 | 只读对账发现 66 处漂移；逐文件评审 |
| 2026-11-16 17:33 | 建 issue #520；开 PR #521 |
| 2026-11-16 17:46 | #521 squash 合并 `a08de8c` |
| 2026-11-16 17:47 | 部署 `a08de8c`（28.9 s，4/4 PASS） |
| 2026-11-16 17:48 | 放置 native 产物，不重启（零影响验证） |
| 2026-11-16 17:49 | `pm2 restart`，`usingNative=true`，耗时 5.5 → 2.2 ms |

---

*本文档由执行端根据原始输出整理；与初稿口述不一致处已在第 0 节逐条标注。*
