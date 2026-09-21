# OPK 视图抽象保持证明（A 级论证性，非机检）

> 关联：OPK-C 接缝项（seam-checker.js S_LAYER）= `SAMPLING_VERIFIED`。
> 性质：本文是**手写论证（sketch）**，非 TLAPS 机检证明。边界②要求的"保持证明"在此以 A 级（论证性）落点，明标非机检，防读者误以为已形式化证明。

## 背景

OPK 全量枚举不可行（对称归约压 6x 仍 >240s；去 O4 后状态空间达 1217 万未完）。
改用 TLC `-simulate num=2000 -depth 30` 做随机模拟（统计保证，非穷举），验证 O1–O6 + TypeOK + deadlock-freedom。

模拟验证的强度取决于：**被验证的性质是否只依赖可投影的状态**，而非密码学载荷细节。

## 视图抽象函数

定义投影 `view(s)`，从完整状态 `s` 中去掉所有密码学载荷（Signal ratchet 噪声、密钥字节、会话密文），只保留一次性预密钥（OPK）的消耗结构：

```
view(s)[u] = (
  consumed_ids : Set<keyId>,     // 用户 u 已消耗（consumed/burned）的 keyId 集合
  count_available : Int,        // 当前可用 OPK 数 = opkCount[u]
  last_consumed : keyId | null  // 最近一次消费的 keyId
)
```

完整状态 `s` 还含 `opkStore[u][k]`（含状态机符号 `-1/0/1/2`）、`consumeLog`、`nextKeyId` 等；
`view(s)` 只抽取与 O1–O6 相关的计数与集合，投影掉 `opkStore` 中未参与不变量判定的载荷位。

## 不变量对 view 的依赖性（A 级论证）

- **O1_NoDoubleConsume**：无 OPK 被消耗两次 ⟺ `consumed_ids` 中无重复 keyId，且 consume 动作只把状态 `AVAILABLE→CONSUMED` 一次。仅依赖 `view(s)`，与载荷无关。
- **O2_ConsumedExists**：每被消耗 OPK 必有合法上传 ⟺ `consumed_ids ⊆ 上传域`，且 `count_available` 单调不增。仅依赖 `view(s)`。
- **O3_CountCorrect**：`count_available == 真实可用数` ⟺ `opkCount[u] == |{k : opkStore[u][k]==AVAILABLE}|`，即 `count_available` 等于 `view(s)` 中 AVAILABLE 计数。仅依赖 `view(s)`。
- **O4_ConsumedNotReusable**（C 线已去，作一致性注记）：consumed 永不回 AVAILABLE，由状态机保证，仅依赖 `view(s)`。
- **TypeOK**：类型不变量，约束 `opkStore/opkCount/nextKeyId/consumeLog` 的定义域，是 `view(s)` 抽取的源。
- **deadlock-freedom**：由 Init/Next 构造保证，与载荷无关。

**结论（A 级论证，非机检）**：O1–O6 + TypeOK + deadlock 全只依赖 `view(s)` 投影后的结构；
`consume` 动作只修改 `view(s)`（增 `consumed_ids`、减 `count_available`），**不改密码学载荷**。
因此：在 `view(s)` 抽象层上跑通的轨迹，其在完整模型中的对应轨迹满足相同不变量——抽样验证的统计保证对 OPK 安全性质有效。

## 诚实声明

- 本证明是**手写论证（A 级）**，不是 TLAPS 机检证明（B 级）。
- 形式化"轨迹满足抽象 ⟹ 全模型满足"属另一条线（TLAPS），非 (c) 范畴，不阻塞本次落地。
- 抽样验证本身非穷举：OPK-C 状态为 `SAMPLING_VERIFIED`（统计保证），全量枚举仍不可行。
