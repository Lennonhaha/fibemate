# 同族漏洞与假绿清查报告（2026-11-15）

> 性质：**只读排查**。未修改任何被检查的代码。
> 方法：静态检索（`git grep` + 定点读源码）+ 三次运行时探针（`import` 探针、`npm pack` + 干净目录安装探针、HTTP 头探针）+ 服务器只读查询（`pm2 list` / `ss -lntp`）。
> 证据边界：**ASan、跨实现 fuzz、WASM/C 重编译比对未执行**（需工具链与构建时间），下文标注为"未验证"，不作为结论。

---

## 0 · 一句话结论

三个真问题，一个致命：

1. **`packages/fml-dsa` 打出来的包，`npm i` 之后 `import` 直接抛 ENOENT** —— 包入口读的是仓库内 `www/noble-pq-bundle/ml-dsa.js`（四层 `../`）。这不是"没发"，是"发了会更糟"：404 只是查不到，装上一个不能 import 的包是 200 + 运行期崩。
2. **`fml-dsa/src/core/verify.js` 的自测仍然只打印 FAIL、不抛错** —— 与 11-14 修的 `encode.js` 同一个 G5 模式，就活在验签模块里。
3. **ML-KEM `decapsulate` 不校验私钥长度**：`sk` 少 1 字节 / 多 1 字节 / 空数组 / 全 `0xAA` 都**静默返回 32 字节**"共享密钥"。

其余为中等与低危，见下表。

---

## 1 · P0 · ML-KEM 解析宽松性

### 1.1 密文长度（ct）

`packages/pqc-kem/src/ml-kem-768.js:392 decapsulate()` 内**没有显式长度检查**，直接 `slice` + `byteDecode`。

实测（真实密钥对，合法 ct = 1088 B）：

| 输入 | 结果 |
|---|---|
| ct − 1 B | `RangeError: ctEqMask length mismatch` |
| ct + 1 B | 同上 |
| ct 空 | 同上 |
| ct 全 `0xAA`（长度正确） | **不抛错**，返回 32 B 伪随机值（隐式拒绝生效） |

结论：**密文侧 fail-closed，但靠的是深处 `ctEqMask` 的等长断言**，不是 API 层的参数校验。错误信息不指向"密文必须 1088 字节"，对集成方不友好；且异常发生在完成解码与 NTT 之后。

### 1.2 私钥长度（sk）—— 本次最实的一个 P0 发现

同一函数对 `secretKey` 无任何校验：

| 输入 | 结果 |
|---|---|
| sk − 1 B（2399 B） | **不抛错**，返回 32 B |
| sk + 1 B（2401 B） | **不抛错**，返回值与 sk − 1 **完全相同**（尾部字节被忽略） |
| sk 空（0 B） | **不抛错**，返回 32 B |
| sk 全 `0xAA`（2400 B） | **不抛错**，返回 32 B |
| 诚实基线 | `decaps(sk, ct) == encaps(pk).ss` ✓ |

"尾部多一个字节仍然被接受"与 11-14 的四个非规范编码是**同一族**：解码器容错 → 同一个逻辑私钥有多种字节表示。私钥侧没有隐式拒绝保护，因为隐式拒绝的前提是"sk 合法、ct 被篡改"。

- 严重级：**Medium-High**（无密钥泄露；但会产生"看起来成功、其实用错密钥"的静默失败，且在协议层难以诊断）。
- 建议：`decapsulate` 入口断言 `secretKey.length === SECRET_KEY_BYTES` 与 `ciphertext.length === CIPHERTEXT_BYTES`，抛 `RangeError` 并写明期望长度；补 `encode(decode(x)) === x` 式的不动点断言（sk 重编码比对）。

### 1.3 FO 变换 / 恒定时间

- 重加密比对存在：`decapsulate` 内重新加密后与输入 ct 做 `ctEqMask` 比较，再 `ctSelectU8` 二选一。
- `ctSelectU8` / `ctEqMask` 均为常数时间实现（无 early return，长度不等直接抛错而非短路径返回）。
- 结论：**机制在**；但"恒定时间"仅有 11-14 新增的 `verify-constant-time.test.js` 覆盖验签路径，KEM 侧依赖 `test/internal-invariants.test.js`，本轮未跑计时实验 → 标记**未验证**。

---

## 2 · P1 · 全局假绿清查

### H1 · `fml-dsa` 自测不抛错（严重）

`packages/fml-dsa/src/core/verify.js:229-231`：

```js
if (ok) console.log('✅ verify: self-tests passed');
else console.error('❌ verify: self-tests FAILED');
```

同目录其它模块均已修（`encode.js:481`、`reduce.js:214`、`keygen.js:173`、`sign.js:227` 全部 `throw`），**只有 verify 漏了**。也就是说 11-14 立下的第二条铁律（自测失败必须 throw）在落地时漏了一个文件，而漏的正好是安全关键路径。

- 严重级：**High**（流程缺陷，不是算法缺陷；但它是"验签恒真"这类事故唯一会经过的闸门）。
- 建议：改为 `throw new Error('verify self-test FAILED')`，并在 CI 加一条静态检查：`src/core/*.js` 内出现 `self-tests FAILED` 且同行无 `throw` 即红。

### 2.1 其它会打印 FAIL 但不报错的脚本

全仓扫 `console.*('FAIL')` 共 **175 处 / 80 个文件**，其中**测试脚本未设置退出码或抛错**的 3 个：

```
test/barrett-bench-v2.js
test/barrett-bench.js
test/cross-validate.test.cjs
```

其余均含 `process.exit(1)` / `exitCode=` / `throw`。上一轮"faithful 断言"清单不含这 3 个，建议一并整改（低危：bench 类，不进 CI 门禁）。

### 2.2 KAT 的被测对象

| 脚本 | 被测对象 | 判定 |
|---|---|---|
| `packages/fml-dsa/test/kat-verify.mjs` | `@noble/post-quantum` | **对照用，合格**；文件名/输出易被误读为"本实现 75/75" |
| `packages/fml-dsa/test/keygen-kat.test.js` | 本实现 `keygen()` | ✓ 11-14 新增，覆盖已补 |
| `packages/pqc-kem/test/acvp-kat.test.cjs` | 本实现（调用 `packages/pqc-kem`） | ✓ |
| `packages/pqc-kem/scripts/generate-nist-kat.js` | 本实现 + noble 交叉 | ✓ 显式标注 V2 为交叉参考 |
| `packages/sm2-ref/test/kat/*` | 本实现 | ✓ 未发现喂第三方的写法 |

结论：ML-DSA 侧的"测错对象"已闭环；**遗留风险是命名**，`kat-verify.mjs` 应改名或首行注明"oracle 对拍，非本实现 KAT"。

---

## 3 · P2 · 跨实现极端边界

**未执行**（需构建 WASM 与 C addon，且三语言入口参数校验不同源）。本轮只做了 JS 路径的长度探针（见 1.1/1.2）。

可复用的观察：JS 侧 `decapsulate` 对 sk 长度完全不校验，因此如果 C/WASM 侧校验严格，**三实现行为已经不一致**——这正是 P2 要测的东西，建议列为下一步首个用例。

---

## 4 · P3 · 协议层静默容错

`git grep -n catch -- src/lib` → **0 命中**（`src/lib` 目录存在，但整个目录没有任何 `try/catch`）。

改为扫 `src/*.js` 与 `packages/*/src`：`try/catch` 中"catch 后直接 `return null/false/''/[]/{}`"的模式 **0 处**（6 行窗口启发式）。

- 结论：**未发现**该类隐患。但启发式只认"catch 内紧邻 return"，异步 `.catch(() => {})` 与 `|| 默认值` 未覆盖 → 标记**部分验证**。

---

## 5 · 追加六项

| # | 项 | 结果 | 级别 |
|---|---|---|---|
| 1 | C Native 内存安全 / ASan | **未执行**（需 `node-gyp` 构建 + `-fsanitize=address`，本轮无时间窗口）。静态侧：`packages/pqc-kem/native/` 无长度断言集中点，与 JS 侧同源风险 | 未验证 |
| 2 | 依赖锁定 | **20 处 `^` 浮动**：根 `package.json`（express / ws / @noble/hashes / express-rate-limit / sm-crypto / ajv / @jazzer.js/core）、`packages/pqc-kem`（@noble/hashes 运行时依赖）、`mixnet`、`www`、`wasm-sm2`、3 个 tools。`Cargo.toml` **0 处**浮动 | Medium |
| 3 | 敏感内存清理 | 36 个核心文件里只有 **2 个**有 zeroize（`pqc-kem/src/ml-kem-768.js` 9 处、`fml-dsa/core/encode.js` 2 处）。`fml-dsa` 的 keygen/sign 中间私钥多项式**无清理** | Medium（JS GC 下只能尽力而为，但应有） |
| 4 | DoS 资源耗尽 | 未做计时实验。静态看：`decapsulate` 对 ct 长度错误会在 `ctEqMask` 抛错，未发现无界循环；`sampleNTT` 有 `while(j<N)` 但受 N 与流长度双重约束 | 未验证 |
| 5 | 官网安全响应头 | **全部通过**：HSTS `max-age=63072000; includeSubDomains; preload`、CSP（`frame-ancestors 'none'`、`base-uri 'self'`）、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy`、`Permissions-Policy` | 通过 |
| 6 | AI 幻觉扫描 | **未执行**（`crypto-hallucination-detector` 未在本机安装；仓库内 `tools/` 无该工具，它住在 `fibemate-tools`） | 未验证 |
| 7 | 构建可复现性 | **未执行**（需 Rust + C 工具链重编译 WASM/addon 后比对 sha256） | 未验证 |

---

## 6 · npm 现状（"四个包 404"的真实构成）

### 6.1 注册表实测（`curl -o /dev/null -w %{http_code}`）

| 名称 | registry | 说明 |
|---|---|---|
| `cbom-tools` | **200** | 0.2.7，工具线 |
| `verifact` | **200** | 工具线 |
| `crypto-hallucination-detector` | **200** | 0.1.2，工具线 |
| `fibemate-xdiff` | **200** | 工具线 |
| `fibemate-pqc-kem` | **200** | 0.1.0，maintainer `lennonhah <research@fibemate.net>` |
| `fml-dsa` | **404** | 主仓 `packages/fml-dsa` |
| `fibemate` | **404** | 主仓根（应用，非库） |
| `@fibemate/algorithm-registry` | **404** | 主仓 |
| `@fibemate/key-lifecycle` | **404** | 主仓 |
| `@fibemate/sm2-ref` / `sm3-ref` / `sm4-ref` / `sm2-multisig` | **404** | 主仓 |
| `fibemate-core` | **404** | **仓库里不存在这个包**（见 6.3） |

### 6.2 官网链接实测

`www/index.html` 与 `www/tools/index.html` 里共 4 个 npm 链接：`cbom-tools`、`verifact`、`crypto-hallucination-detector`、`fibemate-xdiff` —— **全部 200，官网没有死链**。

所以"官网死链"这个前提不成立；真正 404 的是 `packages/` 下那 8 个尚未发布的库，它们只出现在 README/设计文档里，不在官网页面上。

### 6.3 `fibemate-core` 不存在

`ls packages/` 只有 8 个包，没有 `fibemate-core`。这个名称来自外部评估稿，**不是本仓事实**。若要发一个"最干净的算法库"，候选是 `fml-dsa`（自包含，无运行时依赖）与 `fibemate-pqc-kem`（已发布）。

### 6.4 今晚为什么没有执行 `npm publish`

两条硬阻断，都不是"来不及"：

1. **凭证失效**：本机 `~/.npmrc` 有 token，但 `npm whoami` → `E401 Unauthorized`。仓库 secrets 也只有 `NGINX_SSH_KEY`、`SCORECARD_TOKEN`，**没有 `NPM_TOKEN`**。
2. **包本身装不上**（比凭证更硬）：`npm pack` 后在干净目录 `npm i` 成功，`import('fml-dsa')` 抛：

```
Error: ENOENT: no such file or directory,
open 'D:\Temp\fmlsmoke-XXXX\www\noble-pq-bundle\ml-dsa.js'
    at packages/fml-dsa/src/core/native.js:13
```

包入口 `src/index.js` → `core/native.js` 用 `readFileSync(../../../www/noble-pq-bundle/ml-dsa.js)` + `eval` 加载 noble 打包产物。**仓库内能跑，装到别处必挂**。

`npm publish --provenance` 在本机也不可能成功：provenance 需要 CI 的 OIDC id-token，本地运行会被 npm 直接拒绝。正确形态只能是 GitHub Actions。

### 6.5 已落的防呆

新增 `.github/workflows/publish.yml`（tag 触发 / 手动触发，`id-token: write`，`npm publish --provenance --access public`），并在发布前加了 **preflight**：`npm pack` → 干净目录 `npm i` → `import` 冒烟。**装不上的包无法被发布**，这条闸门今晚就拦住了 `fml-dsa`。

---

## 7 · 建议处置顺序

| 顺序 | 动作 | 阻塞谁 |
|---|---|---|
| 1 | `verify.js` 自测改 `throw` + 加静态门禁 | 无 |
| 2 | `decapsulate` 补 sk/ct 长度断言 | 无 |
| 3 | 重写 `fml-dsa` 包入口：`exports` 指向 `src/core/all.js` 并加轻量适配层（noble 风格 → 本实现），删 `eval(bundle)` | 发 npm |
| 4 | 补 README / `files` / `repository`，`npm pack` 体积核对 | 发 npm |
| 5 | 配置 `NPM_TOKEN`（仓库 secret）+ 本地 `npm login` | 发 npm |
| 6 | 打 tag 触发 `publish.yml`，`npm view fml-dsa version` 应为 0.1.0 | — |
| 7 | C/WASM/JS 三实现边界一致性、ASan、可复现构建 | 无（下一批） |

---

## 8 · 本轮未做的事（避免"报告看起来全绿"）

- 没有改任何被审计的代码（含 `verify.js`、`decapsulate`）。
- 没有发布任何包，没有改官网。
- 没有跑 ASan / fuzz / 重编译比对 / 幻觉扫描。
- 服务器只做了 `pm2 list`、`ss -lntp` 只读查询，未 reload、未改配置。
