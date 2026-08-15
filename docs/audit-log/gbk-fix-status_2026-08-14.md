# GBK 双重误解码修复 - 最终状态报告（2026-08-14 10:17）

## ✅ 已完成修复（5 个文件）

所有文件已通过 node 检测：GBK 指纹 = false，U+FFFD = false，语法通过。

| 文件 | 处理方式 | 字节 | 状态 |
|------|---------|------|:---:|
| `double-ratchet-pq.js` | 符号级替换 14 处（13 em-dash + 1 箭头） | ~21KB | ✅ 干净 |
| `backend/timestamps/TIMESTAMP-MANIFEST.md` | 符号级替换 1 处 | ~3KB | ✅ 干净 |
| `www/docs/FAQ.html` | 从 `db81c7f55` 恢复 | 10279 | ✅ 干净 |
| `www/docs/sm2-frontend-verification.html` | 从 `db81c7f55` 恢复 | 4059 | ✅ 干净 |
| `www/timestamps/index.html` | 从 `69b9a22c4` 恢复 | 9114 | ✅ 干净 |

**验证命令**（已执行）：
```bash
node -e "const fs=require('fs'); const files=['double-ratchet-pq.js','backend/timestamps/TIMESTAMP-MANIFEST.md','www/docs/FAQ.html','www/docs/sm2-frontend-verification.html','www/timestamps/index.html']; for(const f of files){const s=fs.readFileSync(f,'utf8'); console.log(f+': GBK='+/鈥|鈫|鈺|鈽|鈮|閬|閳|閸|閺|閻/.test(s)+' U+FFFD='+s.includes('\uFFFD')); }"
# 输出：全部 GBK=false, U+FFFD=false

node --check double-ratchet-pq.js
# exit=0
```

## ⏳ 待执行：Git 提交与推送

5 个文件已修改但未提交。需执行：
```bash
git add double-ratchet-pq.js backend/timestamps/TIMESTAMP-MANIFEST.md www/docs/FAQ.html www/docs/sm2-frontend-verification.html www/timestamps/index.html
git commit -m "fix(encoding): repair GBK double-misdecode corruption in 5 files"
git push ssh://git@github.com/Lennonhaha/fibemate.git main
```

## ⏸️ 保留现状（2 个不可逆文件）

| 文件 | 状态 | 决策 |
|------|------|------|
| `www/session-manager.js` | 双重 GBK + ? 替换符，全网无干净版本 | **保留现状（A）** |
| `www/sm-v12.js` | 同上，是 session-manager.js 的早期版本（579 vs 679 行） | **保留现状（A）** |

**分析结论**：
- `sm-v12.js` 不是重复副本，是 `session-manager.js` 的早期版本（可能为向后兼容保留）
- 两文件代码逻辑完整，仅中文注释损坏
- 被 `www/docs/bloom-risk.html` 等页面引用，不能删除
- 8/31 开源前不处理（改动风险 > 收益）

## 📊 损坏类型总结

| 类型 | 特征 | 可修复性 | 文件数 | 处理结果 |
|------|------|---------|-------|---------|
| 符号级 | `鈥?`→`—`，仅注释符号 | ✅ 直接替换 | 2 | 已修复 |
| 双重GBK+emoji丢失 | 中文乱码+emoji变`?`，有干净历史 | ✅ 从历史恢复 | 3 | 已修复 |
| 双重GBK+?替换 | 含`?`替换符，无干净历史 | ❌ 不可逆 | 2 | 保留现状 |

## 📝 关键教训

1. **PowerShell `>` 重定向 = UTF-16**，必须用 node `fs.writeFileSync(path, content, 'utf8')`
2. **PowerShell 显示 GBK 乱码 ≠ 文件损坏**，node 检测是权威
3. **正则 `\uFFFD` 后不能用半角 `?`**（量词），需 `\uFFFD\uFF1F`
4. 双重 GBK 误解码理论可逆，但 emoji 4 字节 UTF-8 被替换成 `?` 后永久丢失

## ⏭️ 下一步

1. 执行 git commit + push（当前工具执行受阻，需用户手动或换环境执行）
2. 服务器同步 `git pull`
3. 8/31 开源前不再处理 session-manager.js / sm-v12.js（选 A）
