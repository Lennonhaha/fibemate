# P0-01: TLS Path A 废弃代码清理 + VWZ 论文描述修正 — 执行总结

## 执行时间
2026-07-19 17:15~17:25

## P0-01: TLS Path A 废弃代码清理

### 结论：代码层面已清干净
- `src/tls-hybrid/` — 不存在
- `scripts/tls-path-a/` — 不存在
- `tls-hybrid/` — 不存在
- `src/index.js`、`src/pqc-hybrid-server.js` 中无 Path A 残留

### 清理项目
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/flags.js` | 删除 `LEGACY_TLS` flag | 无任何消费者，死代码 |
| `src/flags.js` | 删除 `ARCHIVE` flag | 无任何消费者，死代码 |
| `docs/tls-hybrid-deployment.md` | 状态 Active → Shelved 2026-07-19 | 明确搁置状态 |
| `docs/tls-hybrid-deployment.md` | 删除双轨道叙事 | Path A 不再作为"可选通道"宣传 |

## VWZ 论文描述修正（用户请求）

### 问题分类对照

| 问题 | 分类 | 状态 |
|------|------|------|
| "Security Reduction → VMQ-SPARSE" 虚假归约声明 | 事实硬伤 🔴 | ✅ 已删除 |
| "Custom assumption" 贬义措辞 | 术语错误 | ✅ 已改为 "novel tensor-based hardness assumption" |
| ⚠️ 警示符号 | 格式问题 | ✅ 已删除 |
| 43/43 vs 148/148 测试数冲突 | 事实硬伤 | ✅ 已明确区分 |
| VWZ 缩写无全称 | 格式问题 | ✅ 已展开 |
| "Simulation" 模糊 | 术语错误 | ✅ 已改为 "Cryptanalysis simulation" |
| (under editor review) + (pending) 重复 | 格式问题 | ✅ 已合并 |
| README-current.md 残留 | 冗余 | ✅ 已删除 |
| 白皮书"归约证明"声称 | 事实硬伤 | ✅ 已改为"安全分析" |
| vwz-148-report "Reduction proof" | 事实硬伤 | ✅ 已改为"VMQ-SPARSE analysis" |

### 修改文件
| 文件 | 修改 |
|------|------|
| `README.md` | VWZ Publication 段落重写（已在 c79aeec + 98d2bdb）|
| `docs/FIBEMATE-whitepaper-v3.3-preview.md` | 行412: "归约证明" → "安全分析" |
| `docs/vwz-148-test-report.md` | "Reduction proof" → "VMQ-SPARSE analysis" |
| `README-current.md` | **删除**（UTF-16 LE 旧版，untracked） |

### 未修改（有 TSQ/R 签名的证据记录）
- `www/docs/tsa/2026-07-10/manifest_20260710-vwz.json` — 含 TSR 签名，历史描述不可改

## 验证结果

```
10/10 PASS
  [PASS] No 'Security Reduction' as claim (only negative denials)
  [PASS] No 'Custom assumption'
  [PASS] Full VWZ acronym
  [PASS] 43 vs 148 distinct
  [PASS] No emoji in VWZ section
  [PASS] Whitepaper: No '归约证明'
  [PASS] Whitepaper: Has '安全分析'
  [PASS] vwz-report: No 'Reduction proof'
  [PASS] vwz-report: Has 'VMQ-SPARSE analysis'
  [PASS] Stale README-current.md deleted
```
