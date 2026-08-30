# 攻击测试现状与方向校正（2026-08-16）

## 一、背景

收到一份「攻击测试引入方案」，要求立即运行 `vwz-bkz-sim.py`、`lg-diff-analysis.py`、`lg-angr-symbolic.py` 等脚本。核实后确认该方案为 AI 生成内容，与真实代码和项目状态严重脱节，存在三个根本性方向错误。本文档钉死正确方向，避免后续再次照搬虚构方案。

## 二、攻击资产盘点（真实 vs 虚构）

### 真实存在的 attack/ 资产（13 个文件）

```
experimental/vwz-lg/attack/
├── README.md              # LG v2.2 攻击实验套件说明（5 步攻击链）
├── angr-branch-enum.py    # Angr 符号执行枚举控制流分支
├── collect-samples.py     # Frida Python 采集密文↔明文映射样本
├── deobfuscate.py         # 批量离线去混淆
├── fit-mapping-matrix.py  # 拟合置换映射矩阵
├── fit-mapping.py         # 拟合置换映射表
├── lg-trace.js            # Frida 动态追踪 LG 置换函数
├── real-wasm-findings.md  # 2026-08-12 实测记录
├── run.sh                 # 一键执行 5 步
├── simulate_lg_matrix.py  # Kronecker 矩阵模型
├── test-real-wasm-v2.js
├── test-real-wasm.js
└── wasm-trace.js          # WASM 调用追踪
```

### 虚构的资产（方案中声称存在，实际不存在）

| 虚构文件 | 实际 |
|:---|:---|
| `attack/frida/` 目录 | 不存在（README 提 Frida，但无 frida 子目录） |
| `attack/vwz-bkz-sim.py` | 不存在 |
| `attack/vwz-forge-test.py` | 不存在 |
| `attack/vwz-timing.py` | 不存在 |
| `attack/vwz-entropy.py` | 不存在 |
| `attack/lg-diff-analysis.py` | 不存在 |
| `attack/lg-known-plaintext.py` | 不存在 |
| `attack/lg-groebner.py` | 不存在 |
| `attack/lg-entropy-test.py` | 不存在 |
| `attack/lg-angr-symbolic.py` | 不存在 |
| `attack/generate-attack-report.py` | 不存在 |

## 三、三个根本性方向错误

### 错误 1：VWZ BKZ 攻击 / 签名伪造方向错误

VWZ 签名方案的格基安全**已于 2026-06-22 评估完毕**（见 MEMORY 与 `hull-attack-assessment.md`）。已知攻击全矩阵已覆盖：

- Hull 攻击（Couvreur & Levrat, 2025/596）：Õ(q^130) ≥ 2^2080，完全不可行
- Narayanan-Qiao-Tang：cubic only，不适用 VWZ
- Ran-Samardjiska：~1/q 实例，q ≥ 2^16 可忽略
- Beullens：ATFE only，不适用 VWZ

用 fpylll 跑 BKZ-β=60~100 是**无效测试**：真实 VWZ 格维度 d≈512+，需 β≈400，fpylll 跑不动，且这是已知结论的重复劳动。

### 错误 2：LG 符号执行恢复 session_key 目标错误

- LG v2.3 是 **Rust crate**（`cargo test`），不是 WASM 文件；`angr.Project('lg_v2_3_bg.wasm', backend='wasm')` 的 wasm backend 是实验性的
- 更根本：LG v2.2 设计文档（attack/README.md）明确写「LG v2.2 不提供密码学安全保证，预期 Frida/Angr **能够**攻破」
- 所以「符号执行」的目标不是「防住」，而是「验证能被攻破 + 量化攻击成本」

### 错误 3：VWZ 与 LG 混为一谈

| 组件 | 类型 | 攻击测试目标 |
|:---|:---|:---|
| VWZ | 签名方案（密码学原语） | 格基安全边界（已闭环） |
| LG | 混淆引擎（逆向工程壁垒） | 攻击成本量化（进行中） |

两者攻击目标、方法、判定标准完全不同，不应放在统一攻击框架。

## 四、LG v2.2 攻击实验现状

README 的 5 步攻击链（针对 LG v2.2）：

1. `lg-trace.js`（Frida）→ 动态追踪置换函数入参与内存缓冲
2. `collect-samples.py` → 采集 10,000+ 密文↔明文映射样本
3. `fit-mapping.py` → 拟合置换映射表
4. `deobfuscate.py` → 批量离线去混淆
5. `angr-branch-enum.py` → 符号执行枚举控制流分支

预期结论：Frida/Angr 能够攻破 LG v2.2，结果写 `docs/lookingglass-security-assessment.md`。

**状态：目标版本 LG v2.2 已落后于当前研究线 LG v2.3（Stage-2）。**

## 五、8/31 后攻击测试待办（按优先级）

### P0：LG v2.3 Stage-2 攻击成本量化

- 将 README 5 步攻击链对齐到 LG v2.3 Stage-2（premix + Wreath + VM pipeline）
- 重跑，量化：Frida hook 耗时、样本量、映射表覆盖率、去混淆成功率
- 产出 `attack/attack-report-202609XX.md`

### P1：LG 差分 / 雪崩效应测试

- 针对 LG v2.3（不针对 VWZ）
- 1 bit 变化 → 输出差异分布，验证混淆质量
- 仅研究线，不涉密码学安全声明

### P2：VWZ 签名伪造失败率回归测试（可选）

- VWZ 格基安全已闭环，无需新 BKZ 攻击
- 可补「签名伪造失败率」回归测试作为文档佐证

## 六、冻结期纪律

- 距 8/31 剩 15 天，冻结期守基线，不写攻击代码、不装环境依赖（frida-tools/angr/numpy）
- 本文档仅归档方向校正，零代码改动
- 攻击测试全部押后 8/31 后

## 七、结论

攻击测试方向已校正：

1. VWZ 格基安全已闭环，不重复 BKZ 攻击
2. LG 攻击测试目标 = 量化逆向成本（非"防住"），需对齐 v2.3 Stage-2
3. VWZ（密码学）与 LG（混淆）分离定位，不混入统一框架
4. 真实资产 = attack/ 13 文件，方案中 11 个脚本为虚构
