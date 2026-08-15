# 量子群攻击科普页 + 首页卡片上线（2026-08-13）

## 目标
用户提出「模拟攻击可视化」，经评估否决「VWZ 攻击模拟」（要么是猜谜、要么是虚构，会踩诚实红线），改做**解耦的纯教育科普页**《量子攻击如何作用于群结构》，通篇不提 VWZ。

## 交付物

### 1. 新页面 `www/viz/quantum-group-attack.html`（356 行）
- 纯教育科普，5 步叙事：群作用 → 隐子群编码(HSP) → Kuperberg 非交换困难 → 半直积亚指数量子攻击 → 结论「结构决定量子脆弱性」
- 讲的是真实存在的量子算法（Shor 交换群多项式 / Kuperberg 二面体·半直积亚指数），不牵涉任何自研方案
- 顶部黄框脚注：「纯教育科普，不含任何具体密码方案的安全性结论」
- 3D 场景：群元素节点环 + 作用连线 + 脉动核心 + 量子查询粒子流 + 攻击射线
- 技术栈：复用 `/docs/lib/three.min.js` + OrbitControls，零 CDN、零后处理依赖（three.min.js 压缩版无 examples 后处理模块，改用 AdditiveBlending 发光材质达到科技感）

### 2. 首页卡片 + 计数
- 在「工程可视化工具集」区块插入新卡片（⚛️ 图标，青色 #7dd3fc 顶边，位置在「协议×算法族谱」后、「文档中心」前）
- 卡片醒目标注「纯科普 · 不涉及任何方案安全性结论」
- 计数「35 → 36 个交互式工具」同步改两处（JSON-LD SEO description + 区块 h2 标题）

## 关键决策
1. **否决「VWZ 攻击模拟」**：VMQ-SPARSE 未经评议、无已知真实攻击可模拟；预计算 λ-set 让用户猜 = 带隐藏答案的猜谜游戏；半直积量子攻击与 VWZ 无归约关系，动画它是 security theater。改做解耦科普页。
2. **不提 VWZ**：比原方案更干净——连脚注都不出现，彻底避免「包装伪安全」嫌疑。
3. **不引入 UnrealBloomPass**：保持零外部依赖原则。

## 提交与同步
- commit `520e51656`「feat(viz): quantum group-attack educational 3D page + homepage card」（2 files, +365/-2）
- push 到 GitHub main：`f21aa09d9..520e51656`
- **push 网络坑**：QMTAP 虚拟网卡阻断 443，HTTPS 和 SSH 443 均失败；22 端口通，用 `GIT_SSH_COMMAND="ssh -p 22"` 覆盖端口后 push 成功
- 服务器同步：fetch 后 content 校验（scp 引入的两个文件内容 == main 新提交）→ 删 untracked qga + checkout index.html → fast-forward pull 到 `520e5165`

## 三端最终状态
- 本地 HEAD = `520e51656` ✅
- GitHub main = `520e51656` ✅
- 服务器 HEAD = `520e5165` ✅
- 线上验证：首页 200、新卡片出现、新页面 200 ✅

## 遗留
- 服务器 `origin/main` ambiguous 警告（多 remote 历史遗留），不影响实际状态
- 服务器 1327 个 untracked（rust 目录 1298 个构建产物等），独立整理任务，不阻塞 8/31
