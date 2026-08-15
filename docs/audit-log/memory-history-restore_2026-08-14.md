# MEMORY.md 历史缺失修复（08-14 收尾）

## 目标
修复 MEMORY.md 在上一轮编码损坏恢复中**丢失的两段干净历史**，恢复完整时间线。

## 背景真相（逐步核实）
1. 上一会话恢复工作**其实已提交**（2 个 commit：`c9bee4ca9` 恢复 + `801e99979` 追加笔记），但**未推送**。
2. 磁盘上 MEMORY.md 已是干净状态（strict UTF-8 OK），但上一轮 `c9bee4ca9` 的恢复方式是「从 clean baseline + append D-15~D-19」，实际做了 **-959 行删除**，把 06-12~07-14 的 mojibake 历史整段删掉，却**没有把 `c52320d85` 里的干净版本补回来**。
3. 07-15 当天的 7 个 section 也缺失（既不在 HEAD 也不在磁盘文件）。

## 修复动作（commit `e00deb964`）
三步合并，零信息损失：
1. **补回 06-12~07-14 干净历史**：从干净基线 `c52320d85`（28 sections，fffd=0）提取，插入 07-31 head 之后、D-15~D-19 tail 之前。
2. **补回 07-15 七个 section**：从 `d9dde153f`（07-15 当天最后状态，187 行，fffd=0）提取 7 个 section，插入「07-16 凌晨」之前。含 lgv2 v3.0 推送 / FPGA UART 诊断×2 / IANA #4590 TLS 混合扩展 / E2E hybrid KEX / P1-1 密钥生命周期 / DynamicPathSelector 修复。
3. **修掉残留空标题**：删除 idx 79 的孤立 `## ` 行。

## 验证结果
- 50 个 `## ` section（06-12 记忆系统启用 → 08-14 编码损坏修复，完整时间线）
- strict UTF-8 通过，U+FFFD = 1（唯一且**有意保留**的 health-check.js 正则 `锟斤拷|�{2,}` 检测字符）
- mojibake 字符 = 0（此前报的 4 个「mojibake」经字节级验证全是正常「滑」字 U+6ED1，检测字符集误报）
- 两处重复 section（「用户身份与偏好」「技术规范偏好」各×2）为**不同时期的偏好快照**，内容互补，非错误，保留。

## 推送
HTTPS 443 被 QMTAP 阻断（Connection reset）→ 切 SSH 22 端口稳定通道成功：`801e99979..e00deb964 main -> main`。
（stderr 的 dependabot 漏洞提示被 PowerShell 误报为 exit 1，看 `main -> main` 判定成功，TOOLS.md 已知坑。）

## 关键教训
1. **Python 读文件 vs read 工具显示**：read 工具显示真实 UTF-8；Python 直接 print 含 CJK 扩展字符会触发 `UnicodeEncodeError: 'gbk' codec`，必须写 UTF-8 文件再 read 读回。
2. **文件在脚本运行间会变**：早先读到的 155551 字节是后台进程中间态，稳定后为 66537 字节。做合并前必须先 `git status` + 权威 snapshot 确认当前真实状态。
3. **git show 的 UTF-16 文件**：`baa0ded52` 的 MEMORY.md 是 UTF-16（0xFF 起始），本身是编码损坏源。
4. **section 末尾无下一个 `## ` 时**，提取块要到文件末尾（EOF），否则 `section_end` 为 None 报 TypeError。
