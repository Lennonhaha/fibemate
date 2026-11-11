# CBOM 安全等级语义：时间线与判据

本文回答一个具体问题：CycloneDX 的 `nistQuantumSecurityLevel` 在「没人评估过」时应该写什么，
本项目的输出是否符合该语义，以及这个判断凭什么成立。

三条结论先说：

1. `0` 表示「已评估，且 NIST 各分类都不满足」，**不能**表示「未评估」。省略该字段才表示不作任何断言。
2. `cbom-tools` 从 v0.1.0（2026-09-26）起就不输出该字段；`cbom-diff` 从第一版起就把「缺失」与 `0` 当作两种状态。
3. 真正被标准侧讨论、并被写成一句可引用的话，是 2026-10-25 之后的事。**先后顺序本文不修饰。**

## 一、标准侧

| 日期 | 事件 | 状态（2026-11-11 实测） |
|---|---|---|
| 2026-10-25 | issue [#1175](https://github.com/CycloneDX/specification/issues/1175)：该字段无法表达「未评估」，且不携带评估依据 | open，本项目提出 |
| 2026-10-26 | PR [#1177](https://github.com/CycloneDX/specification/pull/1177)：为 1.7 的三份产物补一句「省略不等于 0」 | **open / blocked**，等 code-owner |
| 2026-10-29 | issue [#1185](https://github.com/CycloneDX/specification/issues/1185)：1.6/1.7/2.0 的 schema 允许 `6`，但 NIST 只定义 1–5 | open，非本项目提出 |
| 2026-10-30 | PR [#1186](https://github.com/CycloneDX/specification/pull/1186)：2.0 的取值收敛到 0–5；已发布的 1.6/1.7 schema 不动 | **merged** |

口径：#1175 是 issue，不是 PR；对应 PR 是 #1177，**至今未合并**。因此对外只能说
「与一项在审的澄清一致」，不能说「标准已澄清」，更不能说「合并后的语义」。

## 二、本项目

| 日期 | 证据 | 事实 |
|---|---|---|
| 2026-09-26 | `fibemate-tools@55dffbc`（cbom-tools v0.1.0） | `cbom-scan` 自第一版起就不输出 `nistQuantumSecurityLevel`；该字段只出现在 `cbom-diff` 的比较里，且用 `!==`，所以「缺失」与 `0` 从未相等 |
| 2026-10-25 | `fibemate-tools@080a390`（#89） | 补三件对照夹具：显式 `0` / 完全省略 / 省略但标注 `fibemate:nistQuantumSecurityLevel="notEvaluated"` |
| 2026-10-26 | `fibemate-tools@f2bf486`（#114） | 三件夹具做 JSON ↔ XML 往返，证明省略在往返中不被物化成 `0` |
| 2026-10-28 | `fibemate@4064ba8` | 入库的 `tools/cbom-cyclonedx.json`：9 个组件 9/9 省略该字段、9/9 带 `notEvaluated` 属性、显式 `0` 为 0 个 |
| 2026-11-11 | `fibemate-tools@d957691`（#179） | 每份输出带 `fibemate:nistQuantumSecurityLevel:semantics`；`cbom-diff` 把缺失渲染为 `<absent>`（此前是 `undefined`，恰好糊掉这个区分）；新增 7 条边界断言，全量 83 passed |

## 三、能主张与不能主张

**能主张：9 月就实现了诚实省略；不能主张：不是我们定义的语义。**

展开说清楚，因为这两句经常被混成一句：

- 能主张的是**行为**：文件级扫描无法诚实地选出一个 NIST 分类，所以从 v0.1.0 起就省略，而不是填一个看起来无害的 `0`。这一条有 commit 与测试背书。
- 不能主张的是**语义的所有权**：当时只是「按能力诚实省略」，并没有把它写成一句可引用的话，也没有论证省略应当被读作「未评估」。把它写成可引用的话、并推动标准侧澄清，是 2026-10-25 之后的事。
- 因此也不主张「本项目先于标准定义了语义」。顺序如实写，别人才翻得动 git log。

## 四、可复核

```bash
# 一、scanner 是否输出该字段：期望 0
npx cbom-tools@0.2.6 scan --dir . --out /tmp/cbom.json --spec 1.7
node -e "const j=require('/tmp/cbom.json');const has=c=>'nistQuantumSecurityLevel' in ((c.cryptoProperties||{}).algorithmProperties||{});console.log(j.components.length, j.components.filter(has).length)"

# 二、入库 CBOM 的构成：期望 components 9 / omitted 9 / explicit-zero 0 / noted 9
node -e "const j=require('./tools/cbom-cyclonedx.json');const c=j.components;const has=x=>'nistQuantumSecurityLevel' in ((x.cryptoProperties||{}).algorithmProperties||{});console.log('components',c.length,'omitted',c.filter(x=>!has(x)).length,'explicit-zero',c.filter(x=>has(x)&&x.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel===0).length,'noted',c.filter(x=>(x.properties||[]).some(p=>p.name==='fibemate:nistQuantumSecurityLevel')).length)"

# 三、历史起点
git -C ../fibemate-tools log --reverse --format='%h %ad %s' --date=short -S nistQuantumSecurityLevel -- cbom-tools
```

命令二在本仓根的实测输出：`components 9 omitted 9 explicit-zero 0 noted 9`。

## 五、边界

- `notEvaluated` 是**命名空间属性**（`fibemate:nistQuantumSecurityLevel`），不是 schema 字段。只读标准字段的消费方看不到它——这正是 #1175 要解决的问题本身，本文不主张已经解决。
- 不主张本项目的取值有 NIST 分类依据：扫描是文件级、按算法族，任何 0–6 的整数都会是编造。
- 本文只覆盖本仓与 `fibemate-tools`；第三方库对同一字段的处理不在范围内。
- `cbom-tools@0.2.6`（npm 当前 latest）与仓内 `0.2.7-rc.1` 在「省略」这一点上行为一致；本文不涉及何时发版。

## 变更历史

- 1.0（2026-11-11）：首版。对应 `fibemate-tools#179`。
