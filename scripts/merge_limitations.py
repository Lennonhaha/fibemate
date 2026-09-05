#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Append pqc-readiness disclosed limitations to security-limitations.md"""

path = "/opt/fibemate-repo/docs/security-limitations.md"
with open(path, "r") as f:
    content = f.read()

appendix = """

---

## 附录 A: PQC 透明度文档交叉披露（pqc-readiness.md 同步）

以下限制在 pqc-readiness.md 公开披露，此处同步记录以确保三份文档自洽。

### A.1 LookingGlass 研究线 — 全部安全边界

| 版本 | 状态 | 核心限制 |
|:---|:---|:---|
| v1 DMTH (归档) | 多嵌套 Kronecker 积 | 可全局合并为单矩阵，高斯消元即可整体求逆；无密码增益 |
| v2 七层等变 LWE | 舒尔引理构造 | 不提升 LWE 格硬度（BKZ 可破最内层）；d=5~8 层工程上限 |
| v2.1 三层壁垒 | 仿射+层序+稀疏偏移 | 仍为纯线性变换；静态逆向成本提升 5–12x 但不改数学硬度 |
| v2.2 Rust WASM 闭环 | 源码重建 | 仅完成可复现性闭环；密码性质无改动 |
| v3.1 球面投影 (归档) | 48D ↔ 194B 映射 | 连续几何与 Z_3329 离散有限域天然不兼容；**数学不可行** |

> 统一结论：所有 LookingGlass 变体均为**线性混淆实验**，不构成密码安全增益。详见 pqc-readiness.md §7。

### A.2 VWZ 签名方案 — 额外局限

- 安全等级 k=8 时约 73 bits，远低于 NIST-I 128-bit 要求
- Hull 攻击评估仅基于 2025/596 号预印本；Vandermonde 结构特异性攻击尚未穷举
- 无正式 EUF-CMA 安全归约（仅满足 OW-VWZ → EUF-CMA 自证链）
- 签名 68B (k=16)，但公钥压缩依赖秩-1 张量假设（等价于陷门信息）

### A.3 FPGA 硬件原型 — 局限

- UART 物理链路未调通（CH340G 5V ↔ PGA 3.3V 电平不匹配，2026-07-16 暂缓）
- 仅在 Artix-7 A35T 仿真验证，未上板实测
- 掩码 NTT 双通路仅在行为级仿真通过，未做物理 TVLA 验证
- BRAM 求解器仅覆盖 VWZ 常数表 ROM，非通用格运算加速器

### A.4 TLS/PQC-Active 升级路径 — 已知阻断

| 阻断项 | 状态 | 说明 |
|:---|:---|:---|
| Nginx 原生 NamedGroup | 永久搁置 (2026-07-10) | 浏览器 TLS 协议栈不受 JS/WASM 控制；Nginx 缺 TLS 1.3 混合协商回调 API |
| ClientHello 载荷过大 | 理论风险 | ~1249B 首包可能被防火墙/CGNAT 截断 |
| Chrome 真实环境兼容 | 未验证 | 仅 OpenSSL s_client 内网测试通过 |
| 生产灰度切换 | 未启动 | fibemate.net 当前默认 ECDH，无原生抗量子能力 |

### A.5 形式化验证 — 覆盖范围局限

- TLA+ Path C-2 验证仅覆盖 **应用层握手核心不变量**（7 条 invariants / 101,467 states）
- **不覆盖**：Lossy 网络死锁、证书链验证、会话恢复、0-RTT 安全性
- 完整 TLS 1.3 握手状态机形式化验证仍需持续研究
- 混合 KEM IND-CCA2 的组合安全性证明依赖于至少一个组件安全的前提假设

### A.6 信任锚点 — 弱项

- Bus Factor = 1（单人项目）
- 无第三方安全审计（当前评分最大杠杆项）
- TSR 时间戳存证仅证明时间顺序，不代表安全审计结论
- OpenSSF Scorecard 评分依赖自动化扫描（非人工审查）
"""

content = content.rstrip() + appendix + "\n"

with open(path, "w") as f:
    f.write(content)

print(f"Appended appendix A ({len(appendix)} bytes) → {path}")
