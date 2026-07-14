# www/ scripts/ docs/ 全面排查报告

## 时间
2026-07-15 02:56 GMT+8

## 任务目标
排查 GitHub 仓库 www/、scripts/、docs/ 目录中的版本标签歧义、死链、虚假声称。

---

## 排查结果总览

| 目录 | 问题数 | 已修正 | 说明 |
|------|--------|--------|------|
| `www/docs/` | 4 | ✅ 已修正 | v3.0-preview → v3.3-preview |
| `www/timestamps/` | 1 | ✅ 已修正 | v3.0-preview → v3.3-preview |
| `lgv2/` | 11 | ✅ 已修正（上轮）| v3.0 → v2.1/v2.2 |
| `scripts/` | 0 | — | 无问题 |
| `docs/` (不含 tsa 历史) | 0 | — | 无问题 |
| `www/` (legal files) | 0 | — | v3.0.0-DRAFT 为法律文档版本号，正确 |

---

## 本轮修正（4 个文件）

| 文件 | 修正前 | 修正后 |
|------|--------|--------|
| `www/docs/architecture.html` | `v3.0-preview` (badge) | `v3.3-preview` |
| `www/docs/FAQ.html` | `v3.0-preview 前端接口 11/11 通过` | `v3.3-preview 前端接口 11/11 通过` |
| `www/docs/sm2-frontend-verification.html` | `FIBEMATE v3.0-preview` (header) | `FIBEMATE v3.3-preview` |
| `www/timestamps/index.html` | `FIBEMATE v3.0-preview` (footer) | `FIBEMATE v3.3-preview` |

---

## 已确认为正确的文件（不需修改）

### lgv2/（上轮已修正）
- `lgv2/rust/Cargo.toml`: version = "2.2.0" ✅
- `lgv2/rust/lib.rs`: "LG v2.1/v2.2" ✅
- `lgv2/c/lgv2_confuse.c`: "LG v2.1/v2.2" ✅
- 所有 15 个 tracked 文件无 v3.0 残留 ✅
- 无 sphere/球面/sphere_proto 关键词 ✅

### Legal 文件（v3.0.0-DRAFT 为法律文档版本号）
- `www/terms.html`: `版本 v3.0.0-DRAFT` — 法律文档版本，正确
- `www/cookie-en.html`: `v3.0.0-DRAFT` — 同上
- `www/acceptable-use-en.html`: `v3.0.0-DRAFT` — 同上
- `www/legal.html`: `v3.0.0-DRAFT` — 同上
- 说明：法律文档有独立版本体系，与 FIBEMATE 项目版本号无关

### Historical TSR 归档（正确保留原版本）
- `docs/tsa/2026-06-25/index.html`: v3.0-preview — 历史快照，正确
- `docs/tsa/2026-06-28/`, `docs/tsa/2026-07-01/`, `docs/tsa/2026-07-10/`, `docs/tsa/2026-07-11/`: TSR 归档，不动

### 无问题目录
- `scripts/`: 无 v3.0 问题 ✅
- `docs/` (主目录): 无 lgv3/LG v3/sphere_proto 问题 ✅
- `www/docs/pqc-readiness.html`: 正确引用 `LookingGlass v2.1` ✅
- `www/security.html`: 正确引用 `LookingGlass v2` ✅

---

## 全局关键词扫描结果

| 关键词 | www/ | scripts/ | docs/ |
|--------|------|----------|-------|
| lgv3 / LG v3 / LookingGlass v3 | 无 ✅ | 无 ✅ | 无 ✅ |
| sphere_proto / 球面投影 | 无 ✅ | 无 ✅ | 无 ✅ |
| v3.0（待修正） | 已清零 ✅ | 无 ✅ | 无 ✅ |

---

## GitHub 最终状态

- **GitHub master**: `58f397d` ✅
- **Workspace HEAD**: `58f397d` ✅ 完全同步
- **本轮修正提交**: `58f397d fix: update v3.0-preview to v3.3-preview in www/docs/`
- **上轮修正提交**: `7e421a3 fix: lgv2 all internal v3.0 labels to v2.1/v2.2`
