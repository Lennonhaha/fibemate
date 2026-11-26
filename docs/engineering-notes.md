# 工程笔记：踩过的坑与可复用的判据

这份文件不是教程，是**事故记录**。每条都写清：怎么发生的、当时看到什么、以后用什么判据避免。
只记那些「下次还会犯、且犯了不容易发现」的坑。

---

## 1. PowerShell 里 `git diff > file` 会写成 UTF-16LE

**怎么发生的（2026-11-18）**
要把 `git diff` 的改动留档复核，顺手写了：

```powershell
git diff -- docs/security-limitations.md > tmp\site-diff.txt
```

然后用读文件工具打开，满屏是 `d i f f   - - g i t   a / d o c s ...` 这种每个字母后面跟着空白的形态，汉字位置则变成了替换字符。

**当时的误判**
第一反应是「文件被写坏了 / 编码出问题了」，差点去查仓库里的源文件。

**真实原因**
Windows PowerShell 5.1 的 `>` 重定向默认按 **UTF-16LE** 写盘，还带 BOM。git 输出的 UTF-8 字节被当成 UTF-16 字符串重新编码，于是每个字符之间插进了 `\0`。**源文件一个字都没坏，坏的是我用来取证的管道。**

**判据**
- 文件开头是 `FF FE`（UTF-16LE BOM），或按 UTF-8 读出来每个字符间夹 `\0` ⇒ 是重定向产物，不是原始内容。
- 中文在控制台显示成乱码**不能**用来判断文件坏没坏（那是 GBK 显示层的问题，见仓库既有纪律）。

**正解（任选其一）**
1. 用 Node 直接拿字节，不经 shell 重定向：
   ```js
   const { execFileSync } = require('child_process');
   const out = execFileSync('git', ['diff', '--', 'docs/security-limitations.md'], { encoding: 'utf8' });
   fs.writeFileSync('tmp/site-diff.txt', out, 'utf8');
   ```
2. 必须用 PowerShell 时显式指定编码：`... | Out-File -FilePath tmp\site-diff.txt -Encoding utf8`
3. 只想看内容就别落盘：用 `read` 类工具读源文件，或让 node 打印指定行区间。

**为什么值得记**
这类坑的危险不在「看不懂」，而在**看懂了一个错的结论**：把管道产物当成源文件损坏，接下来就会去「修」一个根本没坏的文件。

---

## 2. 规则的正文，也得过规则本身

**怎么发生的（2026-11-18）**
要求是「官网不许再出现 TVLA 的单一汇总通过率」。我在 `docs/security-limitations.md` §3.2 里写了一句：

> TVLA 结果逐项记录，**不再使用「X/Y 全绿」这类汇总表述**……

这句话**自己把被禁的说法写了进去**。于是全仓 grep 那个数字仍然命中该文件，规则形同没执行。

**判据**
当目标是「某字面量在发布面 0 命中」时：
- 扫描范围必须包含**规则文档自身**，不能默认「这是说明文字所以豁免」；
- 验证命令就是那条 grep，命中数必须是 0；
- 若确实需要在文档里引用该字面量（例如检测器的模式表），必须**按路径显式豁免并打印豁免数量**，让豁免不能悄悄变大。

**正解**
用描述性措辞代替字面量：

> TVLA 结果逐项记录，**不再使用单一汇总通过率**……

需要写具体数字时，写进**可执行的检测器**（模式表 + 负向测试），而不是写在正文的禁令句子里。

**写这页时的第三次（2026-11-18）**
这条笔记的初稿里，为了举例，直接把两个替换字符粘进了正文。`bom-check` 的编码闸门立刻红在「U+FFFD」上，PR #552 第一个失败的就是它。
**样本要用文字描述，不要粘贴字符本身**；要举例就把字符写成 `\uFFFD` 这种转义形式。

**同族问题**
「禁用某 API」的文档里 import 了那个 API；「禁止硬编码版本号」的脚本里写死了版本号做比对。
**规则是代码，也要被自己的检查覆盖。**

---

## 3. 自指失效：规则的载体与规则的对象重合

**怎么发生的（2026-11-18，一天之内三层）**

1. **文档层**：正文要求官网不再出现单一汇总通过率，结果那句禁令自己把被禁的数字写了进去，全仓 grep 依然命中该文件，规则形同没有执行。
2. **规则层**：`docs/SM2_TVLA_STATUS.md` 顶部要加一句"这个数字从未有单一来源支撑"，草稿里又写了带斜杠的字面量，文件自己成了命中点。
3. **工具层**（PR #554 第一版）：`scripts/hooks/forbidden-literals.txt` 收录了要禁的模式，却没有把自己排除在扫描范围外，于是 hook 拒绝一切提交，包括只改这个规则文件的提交。

**当时的误判**

三次都是同一个念头："我是在写规则，不是在写内容。" 所以没把自己当成扫描对象。grep 不区分动机，它只看字节。

**判据**

写任何"禁用 X"的规则、文档或脚本之前，先问一句：**这份载体里会不会出现 X 的字面形态？** 会，就必须显式排除载体自己，并在文件里写明为什么排除。排除项写在暗处，等于没有判据。

反向也成立：一条规则如果不断需要增补豁免，先怀疑它写错了层次——多半应该交给可执行的检测器，而不是写在正文里靠人记。

**正解（模板）**

`scripts/hooks/forbidden-literals.txt` 是现成模板：三条规则、三条路径排除（`docs/audit-log`、`www/docs/tsa`、规则文件自己），每条附理由，且集中写在文件头部，任何人加规则时都看得见。

文档层的对应做法是不写带斜杠的字面量，改用描述性措辞（"关于『36』这个数字"）。

**为什么值得记**

这不是三次疏忽，是同一个结构问题的三层复现：**规则的载体与规则的对象重合时，规则会咬自己。** 和 quine、和"谁来检查检查器"同源。

---

## 4. `pgrep -f <路径>` 看不见 `node server.js`

**怎么发生的（2026-11-18）**
退役 `/opt/fibemate-full` 前，用 `pgrep -af fibemate-full` 检查「没有进程依赖这棵树」，输出为空，据此认定安全。改名之后才发现三个 mixnet 进程的 cwd 就在这棵树里——它们的命令行是 `node server.js`，路径只出现在内核的 cwd 里，`pgrep -f` 匹配的是 `cmdline`，永远看不到。

**当时的误判**
把「命令行里没有这个字符串」当成「进程没有引用这个目录」。工作目录、可执行文件、打开的 fd 都不在 `cmdline` 里。

**判据**
判定「谁还在用这个目录」要查三处，缺一不可：

```bash
for p in /proc/[0-9]*; do
  readlink "$p/cwd"   # 工作目录
  readlink "$p/exe"   # 可执行文件
  tr '\0' ' ' < "$p/cmdline"
done | grep <路径>
```

注意边界：`/proc/*/cwd` 不跨容器与 namespace。本机是裸机 systemd，所以够用；容器化部署要各自 `nsenter` 进去查。

**正解**
先查 `/proc`，再动目录；`pgrep` 只用来找「命令行里写死了路径」的那一类，不能当作完整答案。

---

## 5. 「配置了、还在写日志」不等于「在校验」

**怎么发生的（2026-11-18，两个实例）**

1. TSR 校验脚本硬编码了旧树的 TSA 目录，目录已被退役后它扫到 0 个文件，打印 `TOTAL=0 PASS=0 FAIL=0` 并 `exit 0`。cron 每早六点照常「成功」。
2. 另一个编码扫描脚本丢了可执行位（`-rw-r--r--`，git mode 644），cron 每三小时写一行 `Permission denied` 到日志，累计 731 行；它自己那份结果日志最后一次写入停在三个月前。

**当时的误判**
看「cron 有这一条」「日志文件在变大」就认为任务在跑。日志变大可能是失败在循环，退出码可能是零覆盖下的 0。

**判据**
- 退出码必须与「实际检查了多少对象」绑定：扫到 0 个文件不是通过，是**没有检查**（守卫要 `exit 1` 并写 stderr）。
- 判定「任务活着」看**产物**：结果文件的时间戳与内容，不是 cron 的 stderr。
- 三者不一致（`lastRunStatus=ok`、`lastDeliveryStatus=not-requested`、结果文件陈旧）时，按「没跑成」处理。

**正解**
零覆盖要显式失败；日志要被读，而不是被写着；把「跑完了」和「检查到了东西」写成两个独立的断言。

---

## 6. 改名不切断引用：`mv` 之后才暴露的依赖

**怎么发生的（2026-11-18）**
`mv /opt/fibemate-full /opt/fibemate-full.retired-*` 本身成功了，但立刻暴露四类此前不可见的依赖：三个 enabled systemd 单元的 `WorkingDirectory` 在树内；crontab 有一行指向树内脚本；nginx 有反代指向树内进程；三个进程的 cwd 在树内。任何一次 `systemctl restart` 或重启机器都会失败。

**当时的误判**
把「文件还在磁盘上、服务当前没报错」当成「没有依赖」——重命名只是改变了路径解析，运行中的进程仍握着旧的 inode。

**判据**
退役一棵树之前，按**活跃面**逐层列举，而不是按目录递归 grep：

| 活跃面 | 怎么查 |
| --- | --- |
| enabled / active 单元 | `systemctl list-unit-files --state=enabled`、`systemctl list-units --state=active`，再逐个 `systemctl show -p FragmentPath` 看单元内容 |
| nginx 实际解析 | `nginx -T`，不是磁盘上全部 `.conf` |
| cron | `crontab -l` |
| 进程 | `/proc/*/cwd`、`/proc/*/exe`、`cmdline` |
| 应用配置 | 部署目录下的配置、反代目标端口是否有监听 |

**正解**
先按上表取证并**贴输出**，再动手；改名只是最后一步，不是第一步。

---

## 7. 字面 gate 的 Goodhart 化：零字符串命中不等于零活跃引用

**怎么发生的（2026-11-18，最严重的一次）**
退役旧树前的检查被写成「`grep -r <旧路径>` 零命中再删」。当时有命中，执行端没有停手，删完又把 17 个文件（含 `.bak` 历史快照）里的旧路径改写成新路径，让 grep 归零，然后报告「满足前置条件」。

**当时的误判**
把「指标归零」当成「意图达成」。真正的意图是「没有任何**活跃**配置指向旧树」；`.bak`、`.disabled`、`sites-available` 里的字符串是历史，不是引用。改写它们既没有修好任何东西，又抹掉了「当时确实存在不一致」的证据。

**判据**
- gate 必须定义在**活跃面**上：`nginx -T` 而非 `find /etc/nginx`；enabled/active 单元而非 `/etc/systemd` 全量；`crontab -l` 而非 `/var/spool/cron` 全量。
- 指标必须与意图**同构**：能被「编辑字符串」满足的检查，检查的不是引用。
- 计数要可复现：同一模式在不同范围会得出 8 与 20 两个数，报数字时必须同时报范围、命令与控制项。

**正解**
活跃面零引用 = 通过；惰性残留**单列清单并保留原样**（要清理就作为一次显式的归档动作，而不是 grep 驱动的批量改写）。历史快照的价值就在于它没有被改过。

**复核补充（同日稍后）：两次盘点其实是同一个错误换了个位置**
删树前那次数出 8，恢复后那次数出 20，看起来是「前一个数错了」。把两次拆开看：

| 盘点 | 真依赖 | 惰性件 | 合计 |
| --- | --- | --- | --- |
| 删树前 | 3（mixnet 三个单元） | 5 | 8 |
| 恢复后 | 3（同一批单元） | 17 | 20 |

活跃引用两次都稳定是 **3**；变的只是惰性件数量，而惰性件根本不该进分母。所以结论不是「8 算错了」，而是**口径没定就开数**：分母混了两种东西，两次读数当然不同。

规则：**先定口径（分母 = 活跃面），再数，数完要可复现；可复现才能当 gate。** 顺序不能倒——先数出个数字再事后解释它属于什么口径，那个数字只是噪声。

---

## 8. 触发 gate 之后：先报告，不要先修到看起来合规

**怎么发生的（2026-11-18）**
同一个动作里连做两件错事：gate 有命中却继续执行；接着为了让结果好看，自行补救了现场。事后补的「零命中」在时间上晚于结论，不构成前置条件。

**当时的误判**
把「让检查通过」当成「把问题解决」。这两件事在结果上可能长得一样，在证据链上完全相反：前者消除了记录，后者保留记录。

**判据**
- 违规已经发生时，正确顺序是**停手 → 报告事实（含当时的原始输出）→ 等处置意见**。
- 恢复要按**备份**逐件核对：`ls` 列出备份与目标的一一对应，`cmp`/`sha256` 证明还原后字节相同；**不能凭 `cp -n` 的行为推断备份完整**（nest 的 basename 是否唯一，要用 `ls` 数出来，不是判断出来的）。
- 恢复后重跑的 gate，必须是**重新定义过的那个**，不能沿用被 Goodhart 化的版本，否则通过也没有意义。

**正解**
把「我发现了问题」与「我修好了问题」写成两条独立记录；前者可以立刻发生，后者需要授权。retroactive compliance 不是 compliance，写得再整齐也一样。

---

## 9. gate 的射程由授权方式决定，不是由脚本写的决定

**怎么发生的（2026-11-18）**
`check-nginx-drift.cjs` 看上去能「校验线上 nginx」，实际上它只做一件事：ssh 取 `/etc/nginx/sites-enabled/fibemate.net`，逐行比文本。CI 用的那把 key 在服务器上被限定为 `command="cat /etc/nginx/sites-enabled/fibemate.net"` —— 它**只能读这一个文件**。于是「脚本能做什么」被「钥匙允许做什么」封死了：解析层（`nginx -T`）和响应层（HTTP）都在射程外。

**当时的误判**
把「有这个 workflow」当成「这一层有覆盖」。工具的名字和它的权限范围是两件事；权限范围写在钥匙上，不在脚本里。

**另一个洞：沉睡窗口**
这个 gate 是 path-filter 的，只在 `deploy/nginx/**`、checker、workflow 自身变化时醒来。今天的事故是**在服务器上手工改配置**——不产生任何 commit，因此永远不会触发它。也就是说：恰好最需要它的那类事故，它永远看不到。补 `schedule` 是为了让陈旧自己浮出来，而不依赖「有人碰了仓库」。

**响应层必须正反双向**
- 正面：`/` 与 `/health` 是 200，`/mixnet/`、`/mixnet/foo` 是 410。这只证明「现在对」。
- 反向：`/mixnet/` 不得带 `Location`、不得出现 `x-powered-by` / `via` 之类代理头、`server` 必须是 nginx、响应体不得出现 `Cannot GET` / `Bad Gateway` / `ECONNREFUSED` / 上游框架名。这一半才抓得住「某天悄悄退回 502/302/200 代理」。
- 只有正面断言 = 半闭合的探针。而半闭合的探针在事故发生后也会是绿的（它只记得期望的那个状态）。

**边界（写明，不顺手扩）**
解析层（`nginx -T` 是否真的加载了这段配置）仍无自动覆盖。补它的正路不是放宽那把 key 的权限，而是单独立项（例如受限命令里再加一条只读的 `nginx -T`，或由部署脚本在本地做解析层断言）。在此之前，解析层的证据只能人工取。

**风险登记：`server` 白名单与架构演进**
探针断言 `server` 头必须是 `nginx`（或缺失）。一旦在 nginx 前面加一层 CDN 或反向代理，这个头会变成 `cloudflare` 之类，探针就会红——而那属于**架构演进，不是生产漂移**。

- 这不是假设：用 `--base https://example.com` 做真实世界负向验证时，`/mixnet/foo` 的 `server: cloudflare` 就被判红；同一断言在那种拓扑下是假阳性。
- 规则：增加 CDN / 前置代理时**必须同步改**这条白名单（连同反向头清单），并在 PR 里写明「这是架构变更，不是漂移修复」。
- 反过来也成立：如果没有人明确做过这次架构变更，那么 `server` 变了就是真信号，不能拿「反正可能是 CDN」去解释。

---

## 10. 估计值一律替换成实测值

**怎么发生的（2026-11-18）**
官网写「374 份存证，逐条清单见 manifest」。清单实际 216 行。第一轮我按「约六成覆盖」估了个缺口数字（158）就写进汇报；真去数：缺 178 行，另加 20 行指向根本不存在的路径。方向没变，数字全错。

**为什么估计值是有害的**
估计出来的缺口会被当成可讨论的量：看起来还可以接受，就往下走一步。实测出来的缺口没有这个空间——178/374 是 47.6%，它逼你对「这份清单还能不能叫清单」表态。**估计值的危害不在误差，在于它把结论变成可谈判的。**

**判据**
- 报任何「缺多少、覆盖多少、几成」之前，先跑出分母和分子：`matched/tracked`，并把命令与输出一起贴出来。
- 估计只允许出现在「还没开始查」的那一刻，并且必须写成「未测」。一旦开口报了数，那个数就必须来自某次运行。
- 同一个数在不同地方出现时，分别指认它的来源与口径（本仓的 `261` 曾经同时是 basename 数、被写成令牌数、又被当成覆盖率的分子）。

**正解**
`scripts/count-tsr.cjs` 出四个数，`scripts/build-tsr-manifest.cjs --check` 出 `coverage N/M`，`--write` 负责补齐。这三个命令就是这一条的执行体：数字不手打，覆盖不估算。

**同族**
「计数是线索不是结论」「--stat 只证动过同一批文件」「不看原始输出不签字」。本条比它们更靠前：那些讲的是**怎么读**一个数，这条讲的是**这个数能不能被造出来**。

---

## 11. 开 PR 前先问「这个分支的父提交是谁」

**怎么发生的（2026-11-18）**
#565（部署时编码断言）在等批准，#567（TSR 清单与措辞）从主分支切出。我用的是 `git checkout -B <new-branch>`——它沿用当前 HEAD，而当前 HEAD 是 `fix/encoding-at-deploy`。于是 #567 带着 #565 的提交一起 squash 进 main（`8da8de9`），「分两次部署、各归各的错」这个安排当场失效：第一次部署就跑了新加的 `[6b/8]`。

**当时的误判**
以为 `checkout -B` 只是「起个新分支」；实际上它是「在当前 HEAD 上改名」。`git status` 干净、`git log` 正常，都看不出来。

**判据**
开 PR 之前跑三条，比读任何日志都直接：

```
git switch main && git pull --ff-only        # 先回到主干
git switch -c <branch>                      # 再从主干起
git log --oneline origin/main..HEAD         # 只应出现本 PR 的提交
```

第三条是判据，不是仪式：只要多出一个「不该在这儿的提交」，PR 的归属就已经错了。

**正解**
内容级取证收尾（blob 相同 → 判重复、关闭而非合并），但取证是**事后**的；这条纪律的目标是让取证不必发生。

---

## 12. 证据清单里的 `sha256` 到底是谁的 sha256

**怎么发生的（2026-11-18）**
`docs/tsa/timestamp-manifest.json` 每行都有 `sha256`。照字面理解，它应该是「被盖章的产物」的摘要，于是 `openssl ts -verify -data <二进制摘要>` 应该能过。全量实测：**240/241 不匹配**。

**实际是什么**
把每行的 `sha256` 与 `sha256(<同名>.tsr)` 一比：**221 行完全相等**。也就是说这个字段记的是**存证文件自身**的哈希，不是它覆盖的产物。它回答的是「这个 .tsr 从登记后被改过没有」，而不是「这个戳盖的是哪份东西」。

**于是证据集必须分三类，不能一句「已验证」带过**：

| 结论 | 数量 | 依据 |
| --- | --- | --- |
| 可 imprint 复核 | 1 | sidecar 记了产物摘要且字节在树里 |
| 有证书、缺数据 | 46 | 签名可查，被盖的字节从未记录 |
| 无签名证书 | 186 | token 内不带 TSA 证书，离线复核无法开始 |
| 证书链不通过 | 8 | 证书在，链验不过（CA 包不全或证书问题）|
| 非 token | 1 | 只有状态/信息，没有时间戳 token |

合计 241。探针用 `-data /dev/null` 跑，是故意的：它把「这个 token 能不能查」与「我们有没有它覆盖的字节」拆开。

**为什么这件事比「少跑几个文件」严重**
旧 cron 报 `TOTAL=2 PASS=2 FAIL=0`：分母 2/241，且那 2 个的 PASS 来自 `Status: Granted`——只证明 TSA 回了一句，不证明 imprint 对得上。**分母错 + 判据错，两个假绿叠在一起。**

**正解（分两层，别混）**
- 机制：`scripts/tsr-verify.cjs` 递归枚举全部 `.tsr`，按上表分类，并与 `scripts/tsr-verify-allowlist.txt`（每行一个实测原因）严格比对；新增不可复核的文件、类别变化、清单里的条目消失，都判红。历史缺口只减不增。
- 上游：`tsa_stamp.sh` 记录 `tsr` / `dir` / `artifact_path` / `artifact_sha256` / `commit`，并保留 `-cert`（FreeTSA 可能不返证书，DigiCert 路径要核）。**今后新增的戳必须天生可复核，不能靠清单豁免。**

**边界**
allowlist 不是「已修好」，是「已点名」。它一旦被当成绿灯就会被滥用，所以 gate 连「类别变了」都报——包括变好：条目变成可复核时也要更新清单，否则证据集与清单脱节。

**待核对：`.tsr.sha256` 不是产物摘要**
2026-11-18 试过一个看起来更聪明的版法：侧边的 `.sha256` 里既然有 64 位十六进制，就拿去 `ts -verify -digest`，这样无需产物字节也能复核 imprint。实测在服务树上得到 `verified=0`——因为这批 `.sha256` 与清单同病：**它们哈希的是 `.tsr` 本身**。更危险的是反向：若某个 token 带证书、侧边摘要又是 `.tsr` 的哈希，这个版法会报 `IMPRINT_MISMATCH`，**凭空造出一个缺陷**。所以已被删掉，代码里写明「只接受 stamp 脚本记录的 artifact_sha256」。

**日志里必须能读出「点名不是绿灯」**
输出固定为 `allowlist=N known gaps (not a pass count); verified=M`。历史上 `M=0`，因为没有任何 token 记录了它覆盖的字节；只要 `M=0` 就额外打一行说明。把 `allowlist=241` 读成「241 个通过」是这条门禁最容易发生的误读，而误读它的成本正好是它要防的东西。

**`verified` 变成正数的那一天，是最危险的窗口**
`M=0` 是诚实的，但下一个带 `artifact_sha256` 的戳落地后，`M` 会变成 1、2、5……而一个正数在日志里看起来和「通过数」一模一样。所以计数不得单独行走：`verified>0` 时，**同一个日志块里逐行列被验证的对象**（超过 50 条时打前 50 加 `... N more`），`--json` 的 `summary.verifiedFiles` 同样带名单。判据是「数字能不能当场枚举出对象」：只有数字、没有文件名，视为不可读，不得引用。否则将来会亲手造出一个 `verified=5` 的新假绿。

---

## 13. 实测与权威预期冲突时，改口径、改实现、改预期，绝不该数据

**为什久单独列一节**
这是今天反复起作用的一条，而且每次都很诱人想去修那个数字。三次都不一样，但形态相同：

| 来源 | 预期 | 实测 | 改了什么 |
| --- | --- | --- | --- |
| 人工估计「约 158 行缺失」 | 158 | 178 + 20 死行 | 改**预期**（coverage 只能来自一次运行的 matched/tracked） |
| 临时脚本「1 个可复核」 | 240 gaps + 1 绿 | 241 gaps + verified=0 | 改**实现**（探针没有产物字节时不得声称已验证） |
| 旧 cron「PASS=2」 | 2 个通过 | 241 个里 0 个可验证 | 改**口径**（分类而不是判 Granted） |

三次共同的危险动作是把数字调回预期：把 178 写回 158、给 allowlist 留一个不该绿的、或者把 `verified=0` 改成一个好看的值。**一旦改了数据，后面所有证据都没有了价格，因为无法区分「验过了」与「抄了一遍预期」。**

**执行方式**
冲突时先声明改哪一项，并在同一句话里给出依据；不准静默调整。若三项都改不了（数据不支持任何口径），正确结果是**报告无法度量**（exit 2），不是报一个看起来完整的数。

**为什么它比单个 PR 重要**证据链项目的全部资产是「数字可核」。一个为了对齐预期而调过的数字，能让整份报告退回不可引用状态，而修回来的成本是重新取证一遍。

---

## 14. 管道最后一命令成功，不等于整条成功

**怎么发生的（2026-11-18）**
新的 TSR wrapper 写的是 `node tsr-verify.cjs ... | tee -a log || rc=$?`。bash 默认取**最后一个**命令的退出码，也就是 `tee` 的。于是 drift（`exit 1`）会被 tee 的成功掩盖，日志里写 `TSR VERIFY OK`。

这与 `TOTAL=2 PASS=2`、`编码 cron exit 0` 同族：**退出码正常、产出无效**。只是这次的假绿藏在一个管道里，读代码时看不出，得看 shell 的取值规则。

**正解**
- 需要看到真实退出码的管道一律 `set -o pipefail`（或 bash 内联 `set -o pipefail`），否则 `| tee` / `| head` / `| grep` 都会把上游的失败吃掉。
- 无法开 pipefail 时，用 `${PIPESTATUS[0]}` 显式取值。
- 写完任何“跑命令 + 写日志”的 wrapper，**必须做一次负向试验**：让被包裹的命令故意失败，确认日志里记录的是失败而不是 OK。不做这一步就不算测过。

---

## 15. 零凭证不是省掉一个 secret，是把「忘」从路径里去掉

部署机取不到构建产物，表面看是缺一个 token；实际缺的是「谁记得去填」。`--artifact-dir` 那种手工缓存，只在「有人记得先放好」时可用，而这与「token 没过期」是同一个形状——靠人的环节会被证明不可靠，然后才被发现。

所以判据不是「有没有 secret」，而是**失败会不会自己说话**：

- **失败必须响亮**。公开 release 资产用纯 HTTPS 取，asset 不存在就是 404，脚本直接 exit 2 并写「没有已发布的产物」，**不得**回落到本地缓存。回落是假绿的入口：部署日志会照样打 OK，用的是上一次的字节。
- **缓存必须可核**。tag 里带构建键（`native-node<major>-<key>`），键名即地址；产物必须与 `mlkem.node.sha256` 一致，`build-info.txt` 里的 key/native_tree 必须与本次算出的相同；部署日志同时打印「算出的 key」与「实际用的 key」。
- **同键不得异字节**。发布侧若发现同 tag 已有资产但 sha256 不同，**拒绝覆盖并失败**——键标识输入，同输入必须同字节，这正是 #533（不可复现）的信号；悄悄替换会把不可复现性藏起来。
- **凭证从主机移除，不是从不必要变成不必看**。主机上没有 token，就没有「过期」这件事；取代它的失败模式是「对象不存在」，后者是显式的、一行 curl 就能诊断的。

反例对照：`GH_TOKEN` 缺失时旧路径只会在取产物那一步报一句 curl/gh 错误，读者无法区分「没发布」「没权限」「网络问题」。新路径把三者分开：404 → 未发布（exit 2）、sha 不符 → 字节不对（exit 4）、key 不符 → 输入不同（exit 3）。

---

## 16. 查必需检查要查 rulesets，旧端点给的不是错数据，是不完整数据

**怎么发生的**：同一天，两份材料对同一个仓库分别给出「5 个必需检查」和「9 个必需检查」。前者来自 `GET /branches/main/protection`，后者来自 `GET /rulesets`。

**当时的误判**：把两个数字当成「其中一个是错的」，于是准备按「5」去补齐检查。补完只会得到重复项，真正的缺口仍然空着——因为缺口不在数量上，在名单里有没有那一项。

**判据**：

```
gh api repos/<owner>/<repo>/rulesets --jq '.[].id'
gh api repos/<owner>/<repo>/rulesets/<id> \
  --jq '[.rules[] | select(.type=="required_status_checks")
         | .parameters.required_status_checks[].context]'
```

本仓实测（2026-11-19）：ruleset `24591608`（name=main, enforcement=active, target=branch）给出 9 个 context —— lint / bom-check / bench / sbom / docs-check / dco / interop / ten checks / KAT-Regression；旧端点给出 5 个，正好是前五项。

规则：两个机制并存时**规则集优先**，旧端点是**子集**，不是错误值。只查旧端点会漏掉 dco、interop、ten checks、KAT-Regression，从而把「已经被门禁拦住」误读成「没有门禁」。

**正解**：

1. 报「必需检查有几个」时必须写清查的是哪个端点，数字要带端点名。只写数字的结论，换个人复核就会得出另一个数字。
2. 多个 ruleset 会叠加（含 organization 级），判据是**把所有 applicable ruleset 的 context 取并集**，不是只看第一条。
3. 端点口径之外还有一类真缺口：**检查存在，但不阻断**。本仓 CodeQL 的 check-run 名为 `CodeQL`、`Analyze (actions)`、`Analyze (javascript-typescript)`、`Analyze (python)`，全部能跑、能给结论，但都不在那 9 个 context 里——安全扫描红了也不阻断合并。这是「必要条件缺失」，与端点问题无关，不能因为「规则集已经有 9 个」就当成已覆盖。
4. 同一批材料里「通知说 failed，而列出的 job 全是 Succeeded」也是同一族：`cancelled`（macOS runner 排队被取消）会被计入 not successful，真正的失败 job 落在折叠区；而且通知里的 SHA 可能已被 force-update 取代。**通知不是状态**，状态只能来自 `commits/<sha>/check-runs`，并且要区分 `failure` 与 `cancelled`：前者要修，后者只需重跑。

同族：#12（数字必须带适用范围）。本次的错误形态是「查了一个端点就当全集」，与「只数命中数不看分母」是同一个动作。

---

## 17. Three shapes of a false green, and the one thing a gate owes you

A gate that cannot fail is not a gate. Three shapes turned up in this repository in one week:

| shape | looks like | real case here |
| --- | --- | --- |
| zero coverage, exit 0 | the command runs and reports success over an empty set | `check-encoding.cjs` printed `OK: no encoding corruption in 0 checked file(s)` when `git ls-files` returned nothing |
| wrong denominator | a correct pass rate over a fraction of the target | the TSR cron globbed `lg-*.tsr` at the top level only: `TOTAL=2 PASS=2` over 241 tokens (0.8%) |
| swallowed error | the step cannot report failure by construction | `markdown-link-check ... \|\| true` in `ci.yml`; the encoding cron's wrapper ended in `exit 0` |

They share nothing at the level of code and everything at the level of evidence: the exit code was fine and the output was empty, partial, or meaningless. So the property to test is not "does the gate pass", it is "does the gate fail when the target error is present".

That is why every gate added since has a negative-first suite that drives the real CLI and asserts the exit code, and why the pull request carries a run against real data:

- sitemap gate: injecting a fifth url into the real `www/sitemap.xml` gives `unlisted 1` and exit 1, and the url is named;
- TSR verifier: deleting one allowlist line gives `DRIFT drift=1` and names the token;
- encoding gate: an empty fixture tree exits 2 instead of reporting `OK`.

Two rules follow, and they are cheap to keep:

1. A gate ships with a case that must go red, and the output names the offending item. A count without a list is unreadable (see 12).
2. A gate that cannot be made to fail is labelled as advisory in its own name or comment, so the next person does not cite it as evidence.

The `\|\| true` in the dead-link step stays for now: it needs the network, and a flaky red would be worse than a known advisory. What makes it acceptable is that it is now named as advisory in the notes rather than counted as coverage.

## 18. A signature counts only if it is an asset somebody else can fetch

OpenSSF Scorecard's `Signed-Releases` probe does not open the artifact and check bytes. It lists
the release's assets and looks at their **names**:

```go
// probes/releasesAreSigned/impl.go (ossf/scorecard, main, 2026-11-19)
var signatureExtensions = []string{".asc", ".minisig", ".sig", ".sign", ".sigstore", ".sigstore.json"}
// probes/releasesHaveProvenance/impl.go
var provenanceExtensions = []string{".intoto.jsonl"}
```

Two consequences, both of which bit this repo:

- The four native addon releases scored zero not because they were unsigned but because the
  signature pipeline did not exist when they were published. `backfill-sign.yml` already knows how
  to fix that: keyless `cosign sign-blob` per asset, uploaded as `<asset>.sig` + `<asset>.pem`.
- A signature produced and then discarded on the runner is worth exactly nothing here. So
  `native-build.yml` now signs *after* publishing and uploads `*.sig` / `*.pem` back to the same
  release. `.sig` is in the list; that is the whole reason for the suffix.

Keyless (Fulcio + Rekor) rather than a long-lived key: the identity in the certificate is the
workflow file, so there is no secret to rotate and nothing in the repo to leak. That only works
with `id-token: write` on the job -- without it cosign has no OIDC token and the step fails. Note
that this is a *read* of the token service, not a write permission, which is why it does not cost
anything on the Token-Permissions check the way an unused `attestations: write` would.

### The signature needs a control, not just a check

`cosign verify-blob` exits 0 when the signature matches. If the verification is never shown to
fail, "verified" means "cosign ran", which is the same shape as every false green in section 17.
So the step appends a byte to a copy of the artifact and requires the verification to reject it.
If that copy ever verifies, the job fails with `the signature verified a modified copy`.

The static guard (`scripts/test-native-signing.cjs`) exists because the signing step is one
refactor away from being deleted without anyone noticing, and it runs its own `--self-test`
against mutated copies of the workflow: remove `id-token`, remove the upload, unpin the identity,
delete the negative control -- each mutation has to make the check red, or the check is decoration.

### Known gap, recorded rather than silently fixed

The release is published (and now signed) at step 10-12, while the load test, self-KAT and NIST
KAT run at steps 13-16. If those fail, a signed release for a broken artifact stays published.
The honest fix is to move publishing after the checks; that is a separate change, because it also
changes what "publish failed" means for the deploy hosts. Until then, the signature means "this is
what CI built from this key", not "this artifact passed the tests".

## 19. 配置 reload 是异步的，验证必须轮询

**怎么发生的。** 2026-11-19 修 `fibemate.link` 的 `:8443` 端口泄漏：`nginx -t` 通过，`systemctl reload nginx` 返回 0，
紧接着的 `curl -D - https://fibemate.link/docs` 仍然返回 `location: https://fibemate.link:8443/docs/`。
几秒后重跑同一条命令，Location 已经干净。同一天收尾（去掉 vhost 里无效的 `www.fibemate.link`）时，
reload 后的三次采样则从第一次就一致。

**当时的误判。** 把「reload 返回 0」加「一条响应」当成「新配置已生效」，于是第一反应是「修复没生效，准备回滚」。
返回 0 只证明信号送到了 master，不证明新配置已经在服务请求：信号送达与 worker 切换之间有窗口，
窗口里外部能观测到的只有旧行为；旧 worker 在 graceful shutdown 期间也会把手上的连接处理完。

**判据。** reload 之后的**单次采样不是判据**，只有稳定复现的结果才是。要区分「窗口还没过」和「配置真的没生效」，
靠的是时间序列，不是一次请求。这条与 §17 同源：一次成功无法证明机制正确，一次失败也无法证明机制错误。

**正解。** 验证段轮询到稳定，并记录收敛用了几轮；每轮结果都要打出来，只打最后一行等于没有时间序列。

```bash
for i in 1 2 3; do
  loc=$(curl -s -o /dev/null -D - --resolve fibemate.link:443:127.0.0.1 https://fibemate.link/docs \
    | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  echo "try=$i location=$loc"
  sleep 1
done
```

本次收尾实测（`server_name` 去掉 `www` 之后）：

```
try=1 apex_code=200 docs_location=https://fibemate.link/docs/
try=2 apex_code=200 docs_location=https://fibemate.link/docs/
try=3 apex_code=200 docs_location=https://fibemate.link/docs/
```

配套两条：部署脚本里「reload 成功」不等于「部署成功」，后面必须跟验证段；验证脚本必须输出每一轮的结果，
否则「等了 3 秒」和「只跑了一次」在日志上长得一样。

### 同批的第二个坑：`cp -a` 保留 mtime，`ls -t` 会选错备份

备份文件名带时间戳是对的，但用 `cp -a` 复制会保留源文件的 mtime，于是 `ls -t | head -1` 选中的是**内容最旧**的那份。
本次比对因此一度对着错误的备份做 diff，差点得出「备份里也是这样」的错误结论。
判据：备份的定位标识必须是**文件名里的时间戳**，或者脚本自己打印出来的路径（`BACKUP=/root/fibemate.link.bak-<epoch>`），
不是 mtime。凡是「按最新」取文件的地方，都要先问一句：这个时间是谁的时间。


## 20. `/code-scanning/alerts?pr=N` 的 `pr` 参数被静默忽略

**怎么发生的（2026-11-26）**
复核 PR #721 时，checks 全绿（51 success / 4 skipped / 0 failed），但 PR 上挂着三条
`github-advanced-security[bot]` 的评论。为了确认"这个 PR 到底还有没有告警"，查了：

```bash
gh api "repos/Lennonhaha/fibemate/code-scanning/alerts?state=open&pr=721"
```

返回 `[]`。

**当时的误判**
把 `[]` 读成"这个 PR 零告警"。差一点据此宣布 CodeQL 收口 —— 而当时 PR 上确实有三条
告警评论（两条 `</script>` 过滤正则、一条未使用的 `CI_DIR`）。

**真实原因**
`pr` 不是这个端点的过滤器，**被静默丢弃**，请求退化成"全仓 open 告警"。那一天全仓恰好是 0 条，
所以无论 PR 有几条告警，都会显示 `[]`。**不报错、不提示、不忽略参数报 400** —— 这是最难识别的
一种假绿：命令是真的、返回是真的、只有"验的是谁"是错的。

**判据**
1. 取 PR 的告警，用 `?state=open&ref=refs/pull/N/merge`，返回 0 才算干净。
2. 或者读 CodeQL check run 的 `output.title`，应为
   `No new alerts in code changed by this pull request`。
3. `Analyze (*)` / `CodeQL` 在 checks 里是 `success` 只说明"分析跑完了"，不说明"没有告警"；
   `neutral` 才是等待。**告警为零与 job 状态是两件事，不能互相替代。**
4. 看见一个"刚好是我想要的"空数组时，先问该端点是否真的接受这个参数：换一个**已知非空**的
   过滤条件做对照（例如按 `ref=` 取旧 commit），能返回非空才说明过滤生效。

**正解**
查 PR 的 code scanning 一律走 `ref=refs/pull/N/merge` 或 check run title；`pr=` 只出现在
网页链接里，不是 API 参数。同族错误见本文第 16 条（旧保护端点给的是不完整数据）：
两次都不是数据假，是**坐标假**。


## 21. 累积型文件被整写覆盖：先查 delta，再从段文件恢复

**怎么发生的（2026-11-26）**
`memory/2026-11-26.md` 从 33,165 B 降到 1,364 B，只剩最后一段。触发点是当日一个写日志的内联脚本用了 `fs.writeFileSync(target, segment)` 而不是追加——正是 TOOLS.md 已明令禁止的 write-not-append。

**当时的误判**
append 工具返回 `before=1364`，第一反应是「统计口径变了」，而不是「文件真的变小了」。如果按记忆重写，20 KB 已发生的内容会变成「我以为发生过的事」，而且读起来同样连贯。

**判据**
1. 累积型文件（`memory/*.md`、`TOOLS.md`、`MEMORY.md`、`docs/engineering-notes.md`）只允许追加，禁止整写；写入器必须打印 `before / after / delta`。
2. `delta` 与段文件字节数对不上时，先怀疑重复或覆盖，再谈内容。本次 `before=1364` 与早间实测 33,165 B 相差 31,801 B，两个独立数字同时异常，才确认是丢失而不是显示问题。
3. 恢复用证据，不用记忆：9 个段文件在 `tmp/seg-*.md` 原样存在，按 `.segledger.json` 的时间顺序重放；另外 3 段没有段文件，用 patch 拦截 `appendFileSync` 拿到原文本。
4. 先重建到临时文件并校验，通过后才覆盖：唯一 marker 数、标题无重复、U+FFFD=0、NUL=0；覆盖后再核字节完全相同。

**正解**
所有累积型写入走 `tools/append-memory.cjs`（段标记幂等守卫 + 字节级 before/after/delta + BOM/NUL/U+FFFD 体检）。本次恢复到 29,244 B / 14 段 / 02:30→11:5x 连续，残缺版留档 `tmp/memory-2026-11-26.broken-20261126T1205.md`。一句话：**「我记得写过」不是证据，段文件字节数和 delta 才是。**

## 22. 以 `ms` 结尾的不都是毫秒：单位后缀必须要求词边界

**怎么发生的（2026-11-26）**
修 verifact 的量纲判据时（fibemate-tools#228），要判断「产出物的键名有没有写单位」。第一版用「键名以 `ms` 结尾」当条件，于是 `dimensions.crypto_inventory.algorithms` 被判成毫秒。那一版一跑，verified 从 108 掉到 98 —— 十条真实核验消失，原因不是量纲判据方向错了，是「谁有单位」认错了。

**当时的误判**
把「听起来对」当判据。更早一步的自检探针里，我自己写的 `msKey` 正则先把 `algorithms` 计成了毫秒；探针打出 `{msKey: true}` 时我只确认了「有单位」，没有核对**命中的是哪一个键**。判据本身没被核，于是它给出的绿灯也不可信。

**判据**
1. 单位后缀必须带词边界：`p95_ms` / `latency.ms` / `avgMs` / `p99Ms` 算写了单位；`algorithms` 不算（`ms` 前是小写 `r`，既不是分隔符也不是驼峰）。
2. 校验时把**命中的具体键名打出来**，不要只看布尔值。`keys ending in ms: dimensions.crypto_inventory.algorithms` 一眼能看出问题；`msKey: true` 看不出来。
3. 单位别名显式列出（`µs/μs/us`、`%/pct/percent`），不做「包含」判断——包含关系会把噪声词当单位。

**正解**
`unitNamedInKey()` 三条规则并用：分隔符锚定 `[._-]ms$`、驼峰锚定 `[a-z0-9]Ms$`、裸 token 精确相等。回归用例把两侧都钉住：`p95_ms = 81.2` 必须能与文档 `78.5 ms` 比对，`max_score = 100` 必须判不可比。一句话：**「以 X 结尾」不是判据，「以 X 结尾且前面有词边界」才是。**

## 附注：DCO 署名里的中文名 vs 纯 ASCII 硬闸门

对外文本（PR body、commit message、release notes）走纯 ASCII 校验时，`Signed-off-by: 刘天赫 <research@fibemate.net>` 会被判 3 个非 ASCII 字符。

这不是漏网：DCO 要求署名与 commit author 同源，而仓库本地身份就是中文名。
**处理方式**：把「sign-off 行里的姓名」列为**明确豁免**并写进校验器的说明，而不是每次靠人记着「我知道这条没事」。豁免不写下来，就等于没有判据。

---

## 记录格式

新增条目请保持四段：**怎么发生的 / 当时的误判 / 判据 / 正解**。
只写「结论」而不写「当时看到什么」的条目，过半年就没人信它，也没人知道它防的是哪种错。
