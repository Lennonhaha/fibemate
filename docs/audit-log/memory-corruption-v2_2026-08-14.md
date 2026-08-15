# MEMORY.md 损坏调查 v2（2026-08-14 10:55-）→ 关键更正

## 重大更正：c52320d85 实际是干净的，但之前两次被终端 GBK 误判

### 原始字节层面证据（Python 严格 UTF-8 解码）
| 提交 | 字节 | Python utf-8 解码前80字 | 结论 |
|------|-----:|------|:---:|
| `c52320d85` (07-14 21:53) | 62934 | `## 2026-07-14：文档全面同步完成（v3.3-preview）` | ✅ **干净中文** |
| `baa0ded52` (07-15 00:07) | 79949 | `## 2026-07-14\ufeff...` + 字节 0xbf 非法 | ❌ **首次损坏（BOM+非法字节）** |
| `7b7a2b377` (08-05 08:28) | 130999 | `=======|>Stashed changes|## 2026-07-31：宏观评估` | ❌ 损坏+未解决冲突 |
| HEAD | 130999 | 同上 + 工作树又叠 13KB | ❌ 双重损坏 |

### 关键认知
1. **c52320d85 (07-14 21:53) 是真正干净的**——之前 Node 检测报 GBK=true 是**误报**（正则把 `efbc9a`=全角冒号 `：` 当成 GBK 指纹，实为正常 UTF-8 CJK 标点）
2. **损坏起点 = baa0ded52 (07-15 00:07)**——比之前判断的 07-15 早，但根因同：PowerShell/GBK 注入
3. **损坏不可逆**：baa0ded52 含 BOM + 0xbf 非法序列，标准 GBK/GB18030/GB2312 全部 decode 失败 → 不是单层误解码，是**多重编码污染**或**部分字节丢失**
4. **iconv-lite / Python 逆向均失败**（产生 U+FFFD = 不可逆铁证）

## 修订后的损坏图谱
```
07-14 21:16 f4a7f5c5  ✅ 干净 (62411B)
07-14 21:37 a585af4e  ✅ 干净 (62656B)
07-14 21:53 c52320d8  ✅ 干净 (62934B) ← 最后干净基线
07-15 00:07 baa0ded5  ❌ 损坏起点 (79949B, BOM+0xbf)
... 22 commits 持续损坏 ...
08-05 08:28 7b7a2b37  ❌ 损坏+冲突标记 (130999B)
HEAD          ❌ 双重损坏 (130999B + 工作树+13KB)
```

## 结论：方案 B 基线选择正确，但需重新评估"追加摘要"范围

### 可行路径（不 force-push，不丢历史）
1. **从 c52320d85 恢复 MEMORY.md**（07-14 21:53，确实干净）
2. **手工追加 07-15 ~ 08-14 关键事件**（D-15~D-19 + 今日）
   - 这是**唯一可行路径**——因为 baa0ded52 之后的损坏不可逆，无法程序化恢复
   - 我有完整的 lossless summary（D-15~D-19 全部 turn），可精确重建
3. 新 commit + push（不 force-push，main 线性前进）

### 需用户最终确认（已在上一轮确认选 B，此处重申证据）
- ✅ c52320d85 确实干净（已用 Python 严格解码验证）
- ✅ 07-15 起的损坏不可逆（已用 4 种 codec 验证）
- ✅ 必须手工重建 07-15~08-14 内容

## 下一步待执行（用户已批准 B，现在动手）
1. `git show c52320d85:MEMORY.md` → 写回工作树（已存 _memory-clean-baseline.md）
2. 追加"## 2026-07-15 ~ 2026-08-14 重建摘要"段（从 lossless summary 提取）
3. `git add MEMORY.md && git commit -m "fix(memory): restore from c52320d85 + append D-15~D-19 summary"`
4. `git push origin main`（443 HTTPS，token 已配）

## 防范（已存在，需加强）
- scripts/check-encoding.cjs 已测 U+FFFD/NUL/无效UTF-8 → 但**未覆盖"合法UTF-8但含mojibake"和"BOM+非法字节"**
- 建议新增：git pre-commit hook 调用 check-encoding.cjs，拦截任何新写入的损坏
- 本次修复后 MEMORY.md 必须过 check-encoding.cjs
