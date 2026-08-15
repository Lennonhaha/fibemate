# VWZ/LG 研究线测试缺口评估（2026-08-13）

## 背景
用户贴出 8/12 记录的「三项测试缺口」（Frida 真实 WASM 追踪 / Angr 符号执行 / 大块数据测试）+「模拟层 vs 真实实现差距」待确认项，要求评估决策。

## 核实结论（与"未执行"记录有出入）

### 已执行（Python 模拟层，8/12 05:32~06:19）
- lg-samples.json (28KB)
- lg-mapping-table.json (1.3MB)
- lg-mapping-matrix.json / lg-mapping-fixed.json
- security-assessment.md (7KB 完整评估报告)

这些是 `simulate_lg_confuse`（XOR + S-box + Fisher-Yates）模拟层产出。

### 未执行（真实 WASM）
1. Frida 真实 WASM 追踪 — 未执行
2. Angr 符号执行 — 未执行（angr 对 WASM 支持实验性，低优先级）
3. 大块数据测试（256B→1KB/10KB/100KB）— 未执行（低优先级）

## 发现的套件 bug
`attack-run.sh` 中 WASM_PATH = `../../www/crypto/lgv2/lookingglass_v2_bg.wasm`
该路径本地 + 服务器均不存在（`www/crypto/lgv2/` 目录没有）。
真实 WASM 实际位置：
- research/lgv2/rust/pkg/lgv2_bg.wasm (26KB)
- research/lgv2-v2_1/lookingglass_v2_bg.wasm (48KB)
→ 即使 Frida/Angr 环境装好，run.sh 也会因路径错误 SKIPPED。

## 核心差距（诚实性关键）
Python 模拟层（XOR+S-box+Fisher-Yates）≠ 真实 WASM（affine Kronecker + sparse offset），两种数学结构。
攻击套件验证的是「攻击框架逻辑」，不是「真实实现攻击可行性」，结论不可直接迁移。

现状：security-assessment.md 已诚实标注「脚本就绪，待真实 WASM 环境验证」，无造假。
但 §3.2 的「5913 冲突」、§3.3 的「1000/1000 roundtrip」均为模拟层数据，易被误读为真实 WASM 结论。

## 决策
- 三项测试全部 8/31 后做，不进冻结期（属 experimental/vwz-lg 研究线，不阻塞生产主线）
- 两件纯文档/诚实性修正（符合冻结纪律，可立即做）：
  1. 修 run.sh 的 WASM 路径 bug
  2. security-assessment.md 顶部加醒目声明「§3 攻击数据为 Python 模拟层结果，未经真实 WASM 验证」
