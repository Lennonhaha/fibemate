# LookingGlass 安全评估报告

**版本**: LG v2.2 · v2.3 (模块化重构)  
**基准**: lookingglass-v2 v2.2.3, commit f9cc379  
**分支**: `experimental/vwz-lg`（严禁合并 main）  
**最后更新**: 2026-08-12  
**状态**: 实验验证中

---

## 1. 定位声明

LookingGlass 是一个**代数置换递归混淆实验引擎**，使用七层 wreath product 有限群表示对中间向量进行可逆混淆。

**它不是密码学原语，不提供密码学安全保证。**

| 声明 | 说明 |
|------|------|
| 对抗自动化静态分析 | ✅ 高度有效（IDA/Ghidra/反编译符号执行受阻） |
| 对抗动态调试/内存捕获 | ❌ 无效（运行时内存必然暴露原始语义） |
| 对抗专业逆向团队 | ❌ 仅增加时间成本，无法阻止 |
| 提供 LWE 难度提升 | ❌ 不碰格困难假设 |
| 生产防护用途 | ❌ **严禁**。仅实验研究用途 |

---

## 2. 设计概览

```
LG v2.2 Pipeline (9级: 7层混淆 + 2级看门狗)

Input → [S1] → [S2] → [S3] → [S4] → [S5] → [S6] → [S7] → [W1] → [W2] → Output
         wreath  wreath  wreath  wreath  wreath  wreath  wreath  inv    dist
                                                                  watchdog watchdog

S1-S7: 每层 = seed-derived Fisher-Yates 排列 + XOR mask + AES S-box 置换
       层间通过 wreath product 群作用级联，不同维度子群不共享交换矩阵
       数学上不可约（Schur's Lemma：不同维度的不可约表示间无非平凡交换矩阵）

W1: 可逆性看门狗 — 实时计算总矩阵行列式 ≠ 0，退化则旁路输出原向量
W2: 分布漂移看门狗 — 统计模长/熵/正负占比，超限旁路

逆变换完全对称（逆 S-box + 逆排列 + unmask），保证无损还原。
```

---

## 3. 攻击实验结论

### 3.1 实验环境

| 项目 | 配置 |
|------|------|
| 实验脚本 | `experimental/vwz-lg/attack/` (5-step Frida/Angr suite) |
| 模式 | Python 模拟（S-Box + XOR + Fisher-Yates，与 wreath.rs 语义一致） |
| 基准 | LG v2.2 7-layer wreath-product finite group |

### 3.2 攻击步骤

| 步骤 | 方法 | 结果 |
|:---:|------|------|
| 1 | Frida 动态追踪 LG 置换函数 | 脚本就绪（`lg-trace.js`），待真实 WASM 环境验证 |
| 2 | 批量采集 10,000+ 映射样本 | 脚本就绪（`collect-samples.py`），模拟模式已验证 |
| 3 | 逐字节拟合置换映射表 | **5,913 冲突** — 上下文相关置换，字节级逆映射不可行 |
| 4 | 批量离线去混淆 | 仅 block-level roundtrip 可行（需逆 S-box），逐字节不可行 |
| 5 | Angr 符号执行枚举分支 | 脚本就绪（`angr-branch-enum.py`），待真实 WASM 环境 |

### 3.3 Roundtrip 验证

```
Test:    1,000 roundtrips (varying block size 8-256B, random seed, random depth 1-7)
Result:  1,000/1,000 PASSED (100%)
S-Box:   INV_SBOX[SBOX[i]] == i for all 256 bytes (100%)
Determinism:  PASS (same seed+input → same output)
Seed independence: PASS (different seed → different output)
```

### 3.4 关键发现

| # | 发现 | 影响 |
|:--:|------|------|
| 1 | **wreath-product 是上下文相关置换** | 同一字节在不同输入块中映射到不同输出（5,913 conflicts detected）。标准逐字节查表法 **完全失效**。 |
| 2 | **确定性与种子独立** | 同 seed 同输入必得同输出（确定性双射）；不同 seed 产生完全不同输出（security via diversity）。 |
| 3 | **block-level roundtrip 可行** | 需要完整的 INV_SBOX + 逆排列 + unmask 链。Python 模拟已验证正确。 |
| 4 | **逐字节破解的代价** | 攻击者需要对每个 (seed, depth) 组合存储一个 256×n 的映射表（n = block size），且该映射表是 seed 相关的。对于 7 层 × 随机 seed 的组合，攻击者必须逐实例破解。 |
| 5 | **Angr WASM 支持有限** | Angr 对 WASM 的符号执行是实验性的（需 wasm2c 中转或分析 Node.js 包装层）。脚本已提供 fallback 结构分析路径。 |

---

## 4. 威胁模型

### 4.1 攻击者分级

| 等级 | 描述 | 预期效果 |
|:---:|------|------|
| ⭐ | 自动化扫描/反编译工具（IDA/Ghidra） | **高度有效** — CFG 碎片化、反编译产物无法直接阅读 |
| ⭐⭐ | 普通工程师手动逆向 | **显著耗时** — 需逐一恢复置换参数 |
| ⭐⭐⭐ | 专业密码分析师 + 动态调试 | **仅延迟** — 可逐层剥离，但需人工介入每层 |
| ⭐⭐⭐⭐ | 国家级定向攻击 + 完整工具链 | **无效** — 运行时内存暴露原始语义 |

### 4.2 不设防的攻击向量

- **动态调试**：Frida/gdb 可 hook 置换函数，获取原始输入/输出
- **内存转储**：运行时中间变量（明文向量）在堆栈/堆上可读取
- **侧信道**：时序/功耗差异可能泄露 seed 信息（未做 constant-time）
- **Frida 内联 Hook**：可替换 LG 置换函数为 identity，完全绕过

---

## 5. 与 VMProtect / Tigress 对比

| 维度 | VMProtect / Tigress | LookingGlass v2.2 |
|------|:---:|:---:|
| 自定义 VM 指令集 | ✅ | ❌ |
| 分层加密（外层解密内层） | ✅ | ❌ |
| 反调试/反虚拟化 | ✅ | ❌ |
| 软件水印/完整性校验 | ✅ | ❌ |
| 代数置换混淆 | ❌ | ✅ (wreath-product) |
| 纯数学结构保证不可约 | ❌ | ✅ (Schur's Lemma) |
| 与 PQC 管线集成 | ❌ | ✅ (ML-KEM binding) |

**结论**: LookingGlass 不替代 VMProtect/Tigress — 它是**补充性逆向工程开销层**，利用群论结构提供差异化的静态度量混淆。

---

## 6. 实验套件目录

```
experimental/vwz-lg/attack/
├── README.md             — 实验说明 + 目标声明
├── lg-trace.js           — Frida 动态追踪脚本
├── collect-samples.py    — 批量采集映射样本 (+ simulate_lg_confuse/deconfuse)
├── fit-mapping.py        — 拟合置换映射表
├── deobfuscate.py        — 批量离线去混淆 + roundtrip 验证
├── angr-branch-enum.py   — Angr 符号执行枚举
└── run.sh                — 一键执行全流程
```

---

## 7. 项目决策记录

| 决策 | 时间 | 说明 |
|------|------|------|
| 默认关闭 | 2026-06-28 | WASM 体积 20KB gzip ~10KB，模块默认禁用 |
| 不发论文 | 2026-06-28 | 所有论文都不要发（含 DMTH/LookingGlass/VWZ），属主动选择 |
| 不合并 main | 持续 | 实验分支保持隔离，8/31 冻结期内不部署 |
| 安全边界声明 | 2026-06-28 | "仅逆向混淆，不提升 LWE 安全位数" |
| 禁用生产 | 持续 | README/文档均标注禁止生产依赖 |
| LG v2.3 重命名 | 2026-08-12 | lg-v3 → lg-v2.3，避免版本号混淆 |

---

## 8. 参考

- `experimental/vwz-lg/lg-v2.3/src/wreath.rs` — 七层置换核心实现
- `experimental/vwz-lg/lg-v2.3/src/bind.rs` — Keccak-256 ML-KEM 绑定
- `experimental/vwz-lg/lg-v2.3/src/cleanup.rs` — 安全内存清理
- `experimental/vwz-lg/attack/README.md` — 攻击实验详细说明
- MEMORY.md 2026-06-28 — 四层默认关闭策略 + DMTH 研究价值三层次评估
- MEMORY.md 2026-06-28 — LookingGlass v2 安全能力定产
