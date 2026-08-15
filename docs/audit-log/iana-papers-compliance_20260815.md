# 归档：IANA #4590 措辞修正 + 论文对外呈现对齐（2026-08-15）

## 目标（Objective）

清查并修正仓库内三处「公开对外呈现」的不准确/冲突表述，使其对齐项目既有决策红线：

1. **IANA #4590 表述**：从「已获国际认可 / 已注册 / 双重安全 / 话语权」等夸大措辞，改为准确引用。
2. **论文对外呈现**：`publications.html` 从「待投稿论文」改为「内部研究存档」，对齐 MEMORY 2026-06-28「所有论文都不发」决策。

## 关键推理（Key Reasoning）

### 分类方法（A/B/C 三类）

| 类别 | 定义 | 处理 |
|:---|:---|:---|
| A 类 | 已修正的活跃页面（blog/pqc-readiness/security） | 不动 |
| B 类 | TSA 时间戳存证历史快照（docs/tsa/2026-06-28/...） | 不动（存证完整性红线） |
| C 类 | 活跃文档里的遗留夸大/政治化表述 | 修正 |

**B 类不动的原因**：`docs/tsa/2026-06-28/pqc-readiness-20260628.html` 里「IANA #4590 已成功获批、论文已刊发」是当时就错的表述，但它是 RFC 3161 时间戳存证的历史快照——改它等于篡改存证，破坏整条可信链。存证的意义正在于记录演进轨迹，哪怕当时写错了。

### IANA #4590 三个钉死事实

1. **#4590 是 TLS 命名组，不是端口号**。官方注册表原文：`4590 curveSM2MLKEM768 N N [draft-yang-tls-hybrid-sm2-mlkem-03]`，`Recommended=N`。
2. **FIBEMATE 无端口号申请需求**——所有端口本地/私有（reg-server 3080、backend 3001、https-server 3001/3443），仓库无 8766（8766 是测试 http.server 临时端口）。
3. **「申请」这个动作既不必要也不可行**：编号已存在，FIBEMATE 作为实现方引用即可；且项目已决策「不发 IETF 草案」。

## 结论（Conclusions）

### C 类 5 处修正（commit `af6d6967`）

| 文件 | 位置 | 原文 → 改为 |
|:---|:---|:---|
| `docs/crypto/HYBRID_KEX_COMPARISON.md` | L94 | 「4590 已获国际认可」→「已获 IANA 编号分配（Recommended=N，非国际标准背书）」 |
| 同上 | L110 | 「国际互认 ⭐⭐⭐（已获编号）」→「编号分配 4588(Y)/4590(N)」 |
| 同上 | L122 | 删除「话语权/存在感」政治化叙事 → 中性技术描述 |
| `docs/crypto/ALGORITHM_POSITIONING.md` | L29 | 「双重安全 (IANA #4590)」→「国密合规 + 抗量子混合（不引入新假设）」 |
| `docs/social-media-cn-2026-08-31.md` | L314 | 「已注册」→「已分配（Informational I-D，Recommended=N）」 |

### 脱敏 9 处（commit `98d5254b`，同文件 HYBRID_KEX_COMPARISON.md）

| 类型 | 处理 |
|:---|:---|
| 政治化叙事 | 「自主可控」「国产化」→「基于开源实现」「国密合规」 |
| 绝对化断言 | 「唯一合规的后量子安全路径」→「一条可行的合规路径」 |
| 价值判断 | 「全球技术标准的领导者」→「当前部署最广的混合方案」 |
| 可疑论文引用 | 「IEEE 论文设计目标」→「方案设计目标」；删除「《通信技术》期刊论文」 |
| 夸张修辞 | 「双重防护」→「防护」 |

### publications.html → 内部存档 6 处（commit `255431e5`）

| 位置 | 改动 |
|:---|:---|
| 页头 meta | 「研究成果」→「研究存档 · 暂不对外投稿」 |
| 论文 1/2 venue | 「TCHES/CHES 2026 (目标)」「FCCM/FPL 2026 (目标)」→「内部研究存档 · 暂不投稿」 |
| 论文 1/2 specs | 「~8/6 页 IEEE 短文 / ✅ 初稿脱稿 / 目标 xxx」→「~8/6 页 / 内部存档 / 目标 —」 |
| 底部状态条 | 「待确认投稿渠道和 arXiv 提交时间…符合双盲评审」→「按 2026-06-28 决策暂不对外投稿（含 arXiv/ePrint/会议/期刊），不构成投稿承诺」 |

## 验证

- 三文件 U+FFFD = 0（编码干净，无损坏）
- 残留「投稿」全部是「暂不投稿」否定表述，无投稿意向残留
- 三端一致（本地 = GitHub = 服务器）

## 今日 commit 链

```
af6d6967 docs: correct IANA #4590 wording (remove 'approved/registered' overstatement)
98d5254b docs: desensitize HYBRID_KEX_COMPARISON (remove political/absolute claims)
255431e5 docs: publications.html → internal archive, no submission (align MEMORY 06-28)
```

## 遗留观察（未处理，供后续参考）

`www/blog.html:667` 有「IANA #4590 是全球唯一的国密+后量子混合命名组」表述——「全球唯一」是绝对化措辞，但「国密+后量子混合命名组」这一事实本身成立（IANA 注册表里确实只有这一个 SM2+ML-KEM 组合）。是否脱敏留待后续统一口径时决定，本次未动。
