# GBK 双重误解码损坏修复（2026-08-14）

## 背景

用户指出 GitHub 上 `double-ratchet-pq.js` 有乱码。排查后发现这是**上一轮 38 文件修复的盲区**：上一轮只扫 U+FFFD 替换符，没扫 `鈥?`/`鈫?` 这类「GBK 误解码后的合法中文字符」。

## 损坏类型（共 7 个文件，分 3 类）

### 类型 A：符号级损坏（可精确还原，已修复）

`鈥?`→`—`（em-dash）、`鈫?`→`→`（箭头），仅注释内符号损坏，代码和英文完好。

| 文件 | 修复处数 | 状态 |
|------|---------|------|
| `double-ratchet-pq.js` | 14（13 em-dash + 1 箭头） | ✅ 已修，语法通过 |
| `backend/timestamps/TIMESTAMP-MANIFEST.md` | 1 | ✅ 已修 |

### 类型 B：双重 GBK + 问号替换，有干净 git 历史（已从历史恢复）

整段中文被 GBK 误解码成生僻字（`閸ヨ棄鐦戦弨顖涘瘮` = 国密支持），且 emoji（✅❌🕐 等 4 字节）被 GBK 替换成 `?`，**不可逆**。但 git 历史里有干净版本。

| 文件 | 干净历史 ref | 恢复后字节 | 状态 |
|------|-------------|-----------|------|
| `www/docs/FAQ.html` | `db81c7f55` | 10279 | ✅ 已恢复 |
| `www/docs/sm2-frontend-verification.html` | `db81c7f55` | 4059 | ✅ 已恢复 |
| `www/timestamps/index.html` | `69b9a22c4` | 9114 | ✅ 已恢复 |

验证：node 检测 GBK 指纹 = false，U+FFFD = false，中文提取正确（`国密支持` hex `e59bbde5af86e694afe68c81`）。

### 类型 C：双重 GBK + 问号替换，无干净历史（不可逆，待决策）

`www/session-manager.js`（24283B）和 `www/sm-v12.js`（20218B）从 initial commit 起就带双重 GBK+`?` 替换符的不可逆损坏。服务器所有副本（`/opt/fibemate-full`、`/opt/fibemate-ghpages`、`/opt/backups/fibemate-20260609`）同样损坏，全网无干净版本。

- 两文件头部完全一致（都是 `FIBEMATE SessionManager v1.0 ... X3DH + PQ ... Double Ratchet`）
- 功能定位：都导出 `window.SessionManager` / `window.SessionManagerCompat` / `module.exports`
- `sm-v12.js` 疑似 `session-manager.js` 的旧版/v1.2 变体
- 被 `www/docs/bloom-risk.html` 等页面引用
- 代码本身（英文标识符、逻辑）完整，**仅中文注释和中文字符串损坏**
- 损坏分析：session-manager.js 45 行含 `?` 不可逆、sm-v12.js 42 行含 `?` 不可逆

## 编码链原理

正确中文「国密支持」的 UTF-8 字节被 GBK 误解码 2 次：
1. UTF-8 字节 → GBK 误解码 → 「鍥藉瘑鏀寔」
2. 「鍥藉瘑鏀寔」的 UTF-8 → 再次 GBK 误解码 → 「閸ヨ棄鐦戦弨顖涘瘮」

双重还原链（iconv-lite）：`閸ヨ棄鐦戦弨顖涘瘮` → GBK 编码 → UTF-8 解码 → 再 GBK 编码 → UTF-8 解码 → `国密支持`（hex 完全一致，已验证）。

但 emoji 是 4 字节 UTF-8，GBK 无法映射时被替换成 `?`（0x3F），该信息永久丢失，故类型 B/C 含 emoji 的文件不可完整还原。

## 关键教训

1. **PowerShell `>` 重定向是 UTF-16**，`git show ... > file` 会写坏文件（size 翻倍 + U+FFFD）。必须用 node `fs.writeFileSync(path, content, 'utf8')`。
2. **PowerShell 终端显示 GBK 乱码 ≠ 文件损坏**：node 检测是权威，显示层乱码（`鍥藉瘑`）是 codepage 误读。
3. **正则里 `\uFFFD` 后不能拼半角 `?`**（`?` 是量词），需 `\uFFFD\uFF1F` 或转义。
4. 双重 GBK 误解码理论可逆，但仅限「纯中文无 emoji/无 `?` 替换」的片段。

## 待决策

- `session-manager.js` / `sm-v12.js` 两个不可逆文件：是（A）保留现状（代码可用，仅中文注释乱码）、（B）重写中文注释、（C）删除其一（疑似重复副本）？
