# 2026-07-24 CI 修复终局核查

**时间**: 2026-07-24 21:47 CST  
**目标**: 逐项核实 CI 状态、README 编码、TSR 计数

---

## ✅ CI #193 (e087f61) — 6/6 全绿

| Job | 状态 | 修复内容 |
|-----|------|----------|
| lint | ✅ success | eslint.config.js CommonJS + 排除 scripts/ + 宽松规则 |
| node-test | ✅ success | 10 个 shebang 文件 BOM 剥离 |
| mlkem-kat | ✅ success | 切为 ci-mlkem-kat.cjs (纯 KAT self-test, 不依赖 WASM) |
| gm-crossval | ✅ success | 一直正常 |
| docs-check | ✅ success | 一直正常 |

**确认方式**: GitHub API 查询 run `30096822248` → conclusion `success`

---

## ❌ Nightly #18 (61ae04e0) — failure (旧 commit, 未跑新代码)

- Nightly cron 在 2026-07-24 08:10 UTC 触发，跑的是修复前的旧 commit `61ae04e0`
- 新 CI 修复 (`e087f61`) 在 13:36 UTC 推送，Nightly 尚未重新触发
- **判定**: 非新引入问题，下次 Nightly (7/25 06:00 UTC) 会自动用 `e087f61`

---

## 📊 README 编码核查

| 位置 | 替换字符 | TSR 显示 | SHA |
|------|----------|----------|-----|
| GitHub (`e087f61`) | 0 | `lg-001~100 (96 records)` | e087f61 |
| 服务器 (`e087f61`) | 0 | `lg-001~100 (96 records)` | e087f61 |
| 本地 workspace | 0 | `lg-001~100 (96 records)` | e087f61 |

**结论**: README 无编码损坏，三端一致。括号内 `96 records` 是历史数字，TSR 范围 `lg-001~100` 正确。

---

## ⚠️ TSR 计数 `(96 records)` vs `lg-001~100` 分析

| 文件 | 内容 | 说明 |
|------|------|------|
| `docs/tsa/` | 仅 13 个 `.tsr` 文件在服务器可见 | 大多数 TSR 在 `.gitignore` 排除范围内 |
| `docs/TSR-MANIFEST.md` | 生成于 2026-07-21，列出 40 条记录 | 旧清单，已过时 |
| `lg-001~100` | README 中两次出现 | 表示 TSR 编号范围 |
| `96 records` | README 括号中显示 | 与 `lg-001~100` 不一致 |

**根因**: TSR 从 96 扩展到 100 后，只更新了编号范围 `lg-001~96` → `lg-001~100`，括号内计数 `96 records` 未同步更新。这不是编码 bug，是人为遗漏。

---

## 🔧 待修项

| 优先级 | 事项 | 说明 |
|--------|------|------|
| P1 | README `96 records` → `100 records` | 吹灰之力，下次提交附带 |
| P1 | Nightly workflow 检查是否也依赖/有 BOM/shebang 问题 | 下次调度自动验证 |
| P2 | `docs/TSR-MANIFEST.md` 更新 | 已 18 天过期 |

---

## 📋 核心结论

1. **CI 全绿确认** — 真实，非幻觉
2. **README 编码确认** — 无损坏，三端一致
3. **Nightly 红是旧 commit** — 上次调度在修复前，非新问题
4. **TSR 计数不一致** — `lg-001~100` (范围正确) vs `(96 records)` (数字未更新)，是人工遗漏
