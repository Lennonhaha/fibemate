# 全仓库 GBK 乱码/UTF-8 损坏修复 归档

日期：2026-08-14
任务：排查并修复全仓库因 PowerShell GBK 误解码导致的 UTF-8 损坏（U+FFFD 替换符 + 中文乱码 + 吞换行代码级损坏）。

## 一、问题根因

历史会话中多次使用 PowerShell `Set-Content -Encoding UTF8` / `Out-File` / `>` 重定向写文件，这些在中文 Windows（默认 CP936/GBK codepage）下把 UTF-8 字节流按 GBK 误解码，产生三类损坏：

1. **U+FFFD（�）替换符**：UTF-8 被 GBK 误解码后不可逆损坏，原始 em-dash（—）、emoji（✅/❌）、中文尾字已丢失
2. **吞换行（代码级 P0）**：中文尾字 + `）` + 换行 被损坏成 `�?`，换行符丢失，导致下一行代码被并入注释
3. **反引号/引号损坏**：模板字符串反引号 `` ` `` 被吞成单引号，破坏 JS 语法

## 二、修复范围（38 文件，+281/-224）

### 代码级损坏（吞换行/语法错误，P0）
- `mixnet/mix-node.js`（14 处）：SphinxPacket/forwardToNextHop 等函数定义被吞进注释，恢复
- `mixnet/healthcheck.js`（6 处）：同类吞换行
- `scripts/bench-diff.js`：printReport 整个 box-drawing 表格（═┌│）GBK 损坏，重写为 ASCII 表格
- `scripts/test-uart-rx.js`：`function send_byte` 被吞进注释（运行时报 `byte is not defined`），修复后 10/10 PASS
- `scripts/daily-audit.js`：`icon`/`sev` 模板字符串 emoji 损坏
- `scripts/eiprint-annotation.cjs`：`html.includes('VWZ 148/148 ✅')` 字符串未闭合
- `scripts/fix-vwz-website.cjs`：3 处正则字符串吞引号
- `www/demo/ml-kem-768.js`：块注释开头 `/**` 被吞 + 42 处 em-dash 注释损坏
- `www/js/sm3_implementation.js`：`compress(V, B)` 参数 B 与 `let B = V[1]` 重名冲突
- `www/message-crypto.js`、`www/zk-auth-poseidon.js`：模板字符串反引号损坏
- `www/privacy-layers/mix-config.js`：3 处 `addressFallback` 模板字符串损坏
- `www/privacy-layers/mixnet-router.js`：`btoa(String.fromCharCode(...))` 缺右括号
- `www/js/network-detector.js` + `www/modules/satellite/network-detector.js`：`5gRTTThreshold` 数字开头非法标识符
- `ecosystem.config.template.js`：`#` 注释（bash 语法）应为 `//`（JS）
- `www/tests/e2e/*.spec.js`（5 个）：`'window.location.origin + '/api''` 反引号损坏

### 注释级损坏（em-dash/中文，不影响运行）
- `packages/pqc-kem/src/ml-kem-768.js`（37 处）：ML-KEM 核心代码注释 em-dash + HW(even) 括号
- `api/a2a/a2a-core.js`（8 处）、`scripts/*.cjs`（多个）、`packages/pqc-kem/native/bench.js` 等

## 三、验证结果

- **全量语法检查**：383 个 git 跟踪的 JS/mjs/cjs 文件 `node --check` 全部通过（0 语法错误）
- **全仓库 U+FFFD 扫描**：除 `scripts/health-check.js:79` 的故意检测正则（`/锟斤拷|�{2,}|.../` 用于检测网页乱码，保留）外，全仓库 0 处 U+FFFD
- **功能冒烟**：
  - `packages/pqc-kem/src/ml-kem-768.js`：keygen OK（pk=1184B），encap/decap 一致 ✅
  - `www/demo/ml-kem-768.js`：浏览器版（window.MLKEM768），encap/decap 一致 ✅
  - `scripts/test-uart-rx.js`：10/10 PASS ✅

## 四、关键教训（写入 AGENTS.md 的规范）

1. **禁止 PowerShell `Set-Content -Encoding UTF8` / `Out-File` / `>` 重定向写文件**——中文 Windows 下会 GBK 误解码损坏 UTF-8
2. **统一用 node 原生 `fs.readFileSync/fs.writeFileSync(f, s, 'utf8')` 读写**
3. **git 显示乱码 ≠ 文件损坏**——PowerShell 显示 git diff 时也会 GBK 误读，用 `node -e` 或 `read` 工具看真实内容
4. **U+FFFD 替换符是「不可逆损坏」铁证**——原始字节已丢失，git 历史/E 盘备份都同样损坏（损坏发生在进 git 前）

## 五、遗留

- `scripts/health-check.js:79` 故意检测正则保留（1 处 U+FFFD，已被新脚本豁免）
- 历史 `_*.js`/`_*.sh` 临时脚本未清理（之前会话积累，未跟踪，不阻塞 8/31）

## 六、防范机制（已建立，commit b12757d2b）

- **scripts/check-encoding.cjs**（新增）：Node.js 权威检测器，检测 U+FFFD 替换符 + 无效 UTF-8 + NUL 字节 + BOM（是 check-bom.cjs 的超集）。跨平台，946 文件全绿。
- **scripts/scan-corrupted.sh**（新增）：bash 快速版（仅 U+FFFD），CI/ubuntu 用。
- **ci.yml**（修改）：bom-check job 新增 `node scripts/check-encoding.cjs`。
- **豁免逻辑**：两个脚本都豁免「故意检测乱码」的正则（health-check.js 的 `/锟斤拷|�{2,}|/`），避免误报。
- **.gitattributes 与 check-bom.cjs 之前已存在**（只测 BOM），本次补齐 U+FFFD/NUL/无效 UTF-8 检测。
- 附带修复 MEMORY.md 自身的 2 处 NUL 字节（wasm-bindgen 0.2.126 / getrandom 0.2.17 的 `0` 被损坏成 NUL）。
