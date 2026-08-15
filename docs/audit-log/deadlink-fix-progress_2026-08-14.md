# 死链修复 + .gitignore 误伤修复（2026-08-14 13:20）

## 一、本次已完成的动作

### 1. 拉回服务器「磁盘先行」文件到本地
- `www/vwz-tensor/`（整个目录，之前本地完全缺失）：4 个 HTML + 1 JSON + lib/（three.module.js 1.2MB + OrbitControls.js）
- `www/lg-tensor/`（之前本地只有 tensor-field.html）：补齐 lib/（three.module.js + OrbitControls.js）+ lg-matrix-data.json

### 2. 修复 .gitignore 误伤（4 条裸规则加 `/` 根锚定）
| 行 | 原规则 | 改为 | 误伤对象 |
|----|--------|------|----------|
| 370 | `lg-matrix-data.json` | `/lg-matrix-data.json` | www/lg-tensor/lg-matrix-data.json |
| 387 | `lg-*.json` | `/lg-*.json` | www/lg-tensor/*.json |
| 388 | `vwz-tensor-data.json` | `/vwz-tensor-data.json` | www/vwz-tensor/vwz-tensor-data.json |
| 396 | `tensor-field.html` | `/tensor-field.html` | www/vwz-tensor/tensor-field.html |

验证：9 个新文件全部 `check-ignore` OK；根目录 scratch 文件仍正确被 ignore。

## 二、纠正的误判

**documentation.html 无 GBK 乱码**。字节级 hexdump 证实 title =「📖 FIBEMATE 文档中心」，`📖` 是 emoji 码点 U+1F4D6（字节 `f09f9396`），文件是干净 UTF-8。之前 read/PowerShell 显示的「馃摉」是显示层 GBK 误读（MEMORY.md 已记录的经典陷阱）。**问题不在编码，在路径。**

## 三、真正的 documentation.html 死链根因（路径/版本分离）

nginx root = `/opt/fibemate-repo/www`，所以：
- 首页链接 `/docs/documentation.html` → 对外服务的是 `www/docs/documentation.html`
- 但 `www/docs/documentation.html` **本地不存在、git 未跟踪**（服务器上有 6869B 旧版）
- 而 git 跟踪的是根 `docs/documentation.html`（9603B 新版，88 个链接）

**两个版本差异**：
- 根 docs 新版：88 个链接，绝大多数指向 `/docs/*.md`（80 个 md 文件在根 docs/）
- www/docs 旧版：47 个链接，指向 `/docs/*.md`（www/docs/ 下只有 18 个 md）

**更深层问题**：documentation.html 链接了大量 `/docs/*.md`，但 nginx root 下 `/docs/` = `www/docs/`，而 80 个 md 在**根 docs/**（不在 www/docs/）。所以即使修好 documentation.html 本身，它的 88 个链接里 79 个仍是死链。

## 四、待你拍板的决策（阻塞项）

### 决策 A：documentation.html 用哪个版本、放哪个位置？
- **选项 1**：把根 `docs/documentation.html` 复制到 `www/docs/documentation.html`（nginx 能服务），但需同时解决 79 个 `.md` 死链
- **选项 2**：改首页链接指向根 docs 的正确路径（但 nginx root 不含根 docs/，需加 location alias）
- **选项 3**：documentation.html 是「自动生成」的导航页，应重新生成，让链接只指向真实存在的 `www/docs/` 内容

### 决策 B：`/docs/*.md` 的 80 个 md 文件为什么不部署到 www/docs/？
- 这是独立的部署架构问题（md 是否通过某种构建转成 html？还是根本不该在 documentation.html 里链接 md？）

## 五、已提交并三端同步 ✅

commit `d3462752a`（11 files, +107822/-11），三端一致（本地 == GitHub == 服务器）：
- `.gitignore` 4 条裸规则加 `/` 根锚定
- `www/vwz-tensor/`（4 HTML + JSON + lib/）
- `www/lg-tensor/lib/` + lg-matrix-data.json

验证：服务器磁盘文件 hash 与 git blob 完全一致（无数据丢失），`reset --hard FETCH_HEAD` 后服务器 HEAD 同步到 d3462752。

## 六、documentation.html 架构问题已解决 ✅（方案 C）

### 根因（彻底）
`scripts/generate-doc-index.js` 本身设计正确（默认扫 www/docs/ → 输出 www/docs/documentation.html）。但曾有人用错误参数生成一次，产物错误提交到根 `docs/documentation.html`（76284acd4），88 个链接中 79 个指向根 docs/*.md = 死链。而正确位置 `www/docs/documentation.html` 从未进 git → 首页 `/docs/documentation.html` 一直 404。

### 修复（commit `92b31fe5e`，2 files +27/-27）
1. 重新生成 www/docs/documentation.html（干净，18 链接 0 死链，无乱码）
2. 删除根 docs/documentation.html（错误产物，唯一引用来自 index.html 且指向 /docs/ 正确路径）
3. 三端同步

### 验证
- 线上 curl https://fibemate.net/docs/documentation.html → **200, 5643B**
- 三端 HEAD = 92b31fe5
- check-encoding.cjs 通过，0 编码损坏

## 六、建议

1. **确定部分先提交**：.gitignore 修复 + 两个 tensor 目录进 git（这是死链修复的正确步骤，无争议）
2. **documentation.html 是独立问题**：涉及「md 文档是否/如何对外部署」的架构决策，不应和数字口径混在一起仓促改

下一步我先提交确定部分，documentation.html 等你定 A/B 两问？
