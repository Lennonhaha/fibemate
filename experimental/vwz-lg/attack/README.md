# LG v2.2 攻击实验套件

**目标版本**: LG v2.2（七层有限群表示混淆）
**攻击方法**: Frida 动态追踪 + 置换映射表拟合 + Angr 符号执行
**状态**: 实验验证中（research line, 不合并 main）

## ⚠️ 实验声明

本实验套件仅用于 **验证 LG v2.2 混淆引擎的安全边界**：
- LG v2.2 不提供密码学安全保证
- 其设计目标为阻挡自动化静态分析，非防御动态调试
- 本实验的预期结果是：Frida/Angr **能够**攻破 LG v2.2 混淆
- 实验结果将写入 `docs/lookingglass-security-assessment.md`

**Running in production is prohibited.**

## 实验概览

| 步骤 | 脚本 | 工具 | 产出 |
|:---:|------|------|------|
| 1 | `lg-trace.js` | Frida | 动态追踪 LG 置换函数入参与内存缓冲区 |
| 2 | `collect-samples.py` | Frida Python | 密文↔明文映射样本数据集 (10,000+ 对) |
| 3 | `fit-mapping.py` | Python | 拟合置换映射表 `lg-mapping-table.json` |
| 4 | `deobfuscate.py` | Python | 批量离线去混淆 |
| 5 | `angr-branch-enum.py` | Angr | 符号执行枚举所有控制流分支 |

## 环境依赖

```bash
pip install frida-tools angr numpy
# Frida: https://frida.re/docs/installation/
# Angr: https://angr.io/
```

## 快速开始

```bash
# 一键执行全部 5 步
./run.sh

# 或逐步执行
python3 collect-samples.py        # 步骤 2: 采集样本
python3 fit-mapping.py            # 步骤 3: 拟合映射表
python3 deobfuscate.py            # 步骤 4: 去混淆
python3 angr-branch-enum.py       # 步骤 5: 符号执行
```

## 预期结果

| 步骤 | 预期结果 |
|:---:|------|
| 1 | Frida 成功 hook `lg_permute` / `lg_inv_permute` |
| 2 | 10,000+ 映射样本采集，覆盖率 > 99% |
| 3 | 映射表完整无冲突（有限群置换是确定性双射） |
| 4 | 去混淆后数据与原明文块完全一致 |
| 5 | 控制流路径覆盖 > 90%，未触发分支被枚举 |

## 版本

- Baseline: LG v2.2 (7-layer wreath-product finite group representation)
- Branch: `experimental/vwz-lg` (DO NOT merge to main)
- Last updated: 2026-08-12
