# Good First Issues

欢迎贡献！标记 `good-first-issue` 的任务不需要密码学博士，30 分钟到 3 小时可提交 PR。

---

## 🟢 Easy（初次贡献，纯文档/JSON）

### E1: 提取 `ml-kem-768.js` 硬编码参数到 `params.json`

**文件**：`packages/pqc-kem/src/ml-kem-768.js` L18-24  
**难度**：30 min · 2 个文件  
**标签**：`good-first-issue` `refactor` `beginner-friendly`

**做这件事**：
1. 在 `packages/pqc-kem/src/params.json` 创建：
```json
{
  "KYBER_N": 256,
  "KYBER_Q": 3329,
  "KYBER_DU": 10,
  "KYBER_DV": 4,
  "KYBER_K": 3,
  "KYBER_QHALF": 1664
}
```
2. `ml-kem-768.js` 顶部加 `const P = require('./params.json');`
3. 把 L18 `const KYBER_N = 256` 改成 `const KYBER_N = P.KYBER_N`（同理 KYBER_Q、KYBER_K、KYBER_DU、KYBER_DV、KYBER_QHALF）

**验收标准**：
- `npm test` 通过（`packages/pqc-kem/test/` 下 34/34）
- 其他文件（`hybrid.js`）只需 import 路径不变，不感知 params.json 的存在

**背景**：IBM 七维加密敏捷性报告 §3.2 识别 6 个编译时常量硬编码，影响算法可替换性（维度 2）。

---

### E2: 补全缺失 TSR 归档文档

**文件**：`tsa/` 目录（lg-033~046 历史 TSR 未归档）  
**难度**：1 h · 纯文档  
**标签**：`good-first-issue` `documentation`

**做这件事**：在 `tsa/` 目录下补充 `lg-033.tsr` ~ `lg-046.tsr` 的存证文件。TSR 原始文件在 `evidence/tsa/` 中已存在，需在 `tsa/` 创建对应副本。

**验收标准**：`scripts/verify-tsr.js` 通过。

---

## 🟡 Medium（需要了解代码结构）

### M1: 为混合 KEM 构建接口抽象层

**文件**：`packages/pqc-kem/src/hybrid.js` L9、L27-28、L45-46  
**难度**：2-3 h · 2 个文件  
**标签**：`good-first-issue` `refactor` `architecture`

**做这件事**：
1. 创建 `packages/pqc-kem/src/kem-interface.js`：
```js
// 定义 KEM 抽象接口
// 当前实现：ML-KEM-768，未来可替换为 ML-KEM-1024 或 X25519MLKEM768
module.exports = { generateKeypair, encapsulate, decapsulate, sha3_256 };
```
2. `hybrid.js` L9 把
```js
const { generateKeypair, encapsulate, decapsulate, sha3_256 } = require('./ml-kem-768');
```
改为
```js
const { generateKeypair, encapsulate, decapsulate, sha3_256 } = require('./kem-interface');
```
3. 保证 `kem-interface.js` 签名与 `ml-kem-768.js` 兼容，`hybrid.js` 无需其他改动。

**验收标准**：
- `npm test` 全绿
- hybrid KEM 握手 roundtrip 正常（`node test/test-fibemate.js`）
- 新算法（如 ML-KEM-1024）只需修改 `kem-interface.js` 一行 require 即可替换

**背景**：量子风险传播图显示 `hybrid.js` → `ml-kem-768.js` 是 P-256 依赖链（爆炸半径 103）的源头。接口抽象 = 切掉传染链 = IBM 维度 1 提升。

---

### M2: 补充 SM4-GCM KAT 全量测试

**文件**：`scripts/ci-gm-sm4.cjs`  
**难度**：1-2 h · 测试为主  
**标签**：`good-first-issue` `test` `cryptography`

**做这件事**：当前 SM4 KAT 30/30 通过，但仅覆盖 ECB 模式。需要：
1. 从 GB/T 32907 附录下载官方 GCM 向量
2. 创建 `packages/pqc-kem/test/sm4-gcm-kat.json`
3. 在 `ci-gm-sm4.cjs` 中新增 GCM 模式测试（encrypt/decrypt/authTag 三输出）

**验收标准**：GCM 测试 ≥20 条向量通过，`npm test` 通过。

---

### M3: 为 ML-KEM-768 补充 JSDoc

**文件**：`packages/pqc-kem/src/ml-kem-768.js`  
**难度**：1-2 h · 30 个函数  
**标签**：`good-first-issue` `documentation` `beginner-friendly`

**做这件事**：为 `ml-kem-768.js` 中的所有导出函数补 JSDoc（`@param`、`@returns`、`@throws`），参考已有的 `generateKeypair` 注释样式。函数清单可在文件头 `// Exports: generateKeypair, encapsulate, decapsulate, ...` 找到。

**验收标准**：`npx eslint ml-kem-768.js` 无新增 warning。

---

## 🔴 Hard（核心架构，建议先沟通再动手）

### H1: 构建 CARS 雷达图 CI 自动化（`cars-radar.html` → CI badge）

**文件**：`tools/cars-scorecard.json` + `.github/workflows/ci.yml`  
**难度**：3-5 h · CI/CD  
**标签**：`good-first-issue` `ci` `visualization`

**做这件事**：
1. 将 `scripts/update-cars-v2.js`（CARS 评分更新脚本）集成到 CI 中
2. 每次 push 自动重新计算 CARS 评分
3. 如果评分下降 ≥3 分，CI 警告（非阻断）
4. README 新增动态 CARS badge

**验收标准**：CI 中包含 `cars-check` job，评分变化可见。

---

### H2: 接口抽象层扩展 — SM2 签名从 `gm.js` 解耦

**文件**：`www/crypto/gm.js`（约 183 行）  
**难度**：3-5 h · 跨文件  
**标签**：`good-first-issue` `refactor` `chinese-crypto`

**做这件事**：参考 M1（KEM 接口抽象），为国密签名层建 `signature-interface.js`，把 `gm.js` 中 SM2 调用统一走抽象层。当前 `gm.js:183` 的 `negotiateWithServer()` 是应用层协商而非注册表。

**验收标准**：`npm test` 全绿，双向签名验证通过（CI `gm-crossval` job 6/6）。

---

## 优先级与时间线

| 优先级 | Issues | 目标 |
|--------|--------|------|
| **P0（8/31 后首周）** | E1、M1 | 接口抽象 + 常量提取，IBM 七维报告直接锚点 |
| **P1（9 月）** | E2、M3 | 文档补全 |
| **P2（Q4 2026）** | M2、H1、H2 | 深度架构 |

## 向新贡献者说的话

— **FIBEMATE 团队**
