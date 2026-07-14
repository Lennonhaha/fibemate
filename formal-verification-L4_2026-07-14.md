# L4 形式化验证 — Path C-2 TLA+ 模型检查（2026-07-14 · v2）

## 目标
为 FIBEMATE path C-2（SM2 + ML-KEM-768 应用层混合密钥交换）建立 TLA+ 状态机模型，通过 TLC 模型检查验证安全性不变式。

## 工具链
| 组件 | 版本/来源 | 备注 |
|------|---------|------|
| Java | OpenJDK 21 | 服务器已安装 |
| TLC | 2026.07.14 (tla2tools.jar) | Lamport TLA+ toolbox |
| 下载路径 | `github.com/tlaplus/tlaplus/releases` → `/tmp/tla2tools.jar` |
| 服务器 | fibemate.net `/opt/fibemate-full/docs/tla/` | 工作目录 |
| 运行命令 | `java -XX:+UseParallelGC -cp /tmp/tla2tools.jar tlc2.TLC C2 -workers 4 -deadlock -nowarning` | |

## 模型结构

### 状态机（2 并行会话）

**Client 侧**（`cState[i]`）：
```
init → sentCH → rcvdSK → active → closing
```

**Server 侧**（`sState[i]`）：
```
waiting → sentSH → sentSK → active → closing
```

**消息交换序列**：
```
ClientHello (pq+sm2)   →
                        ← ServerHello (pq+sm2)
ClientKeyFinish (tlsExporter) →
                        ← Finished (verifyData)
```

### KeyValue 模型（K3 强形式扩展）
- `cKeyValue[i] = 0` → 密钥尚未派生
- `cKeyValue[i] = i` → 密钥已派生（i 为会话索引）
- `DeriveKey(i) = i` → 会话唯一派生函数

真实协议中：
`key_i = HKDF-Extract-SHA256(sm2_ephem_i || mlkem_ss_i)`
SM2 ephemeral 随机数和 ML-KEM 封装随机数各自独立采样 → `key_i ≠ key_j`（概率 1 - 2⁻²⁵⁶）

## 不变式（7 条，全部通过）

| 不变式 | 内容 | 状态 |
|--------|------|------|
| TypeOK | 状态变量格式正确 | ✅ |
| K1 | Client active 前密钥必然已派生（且值非零） | ✅ |
| K2 | Server 派生前提：两端密钥均已交换 | ✅ |
| **K3** | **任何两不同会话 i≠j，派生后密钥值永不相等** | ✅ |
| **K3'** | **Server 侧 K3 同等保证** | ✅ |
| K4 | Active 前 tlsExporter 不明文出现于网络层 | ✅ |
| K5 | Server active 需 Client 已发送 ClientKeyFinish | ✅ |

**K3 强形式**（核心扩展）：
```
K3_StrongKeyIndependence ==
  \A i \in 1..MaxSessions:
  \A j \in 1..MaxSessions:
    (i /= j /\ cKeyValue[i] # 0 /\ cKeyValue[j] # 0
      => cKeyValue[i] # cKeyValue[j])
```

## 模型检查结果

```
TLC2 Version 2026.07.14.071606
Running breadth-first search with fp 70 and seed 0 with 4 workers on 2 cores
Running on 2 cores with 359MB heap and 64MB offheap memory (Linux 6.8.0, Ubuntu 21.0.11)

Model checking completed. No error has been found.

101,467 states generated
26,115 distinct states found
0 states left on queue
Depth of complete state graph: 17
Average outdegree: 1 (min 0, max 4, p95 3)
Fingerprint collision probability: 3.9E-11 (negligible)

Finished in 02s
Exit code: 0
```

## 技术细节

### TLA+ 操作符优先级陷阱
`\A x \in S: P /\ Q => R` 在 TLA+ 中解析为：
`\A x \in S: ((P /\ Q) => R)`（正确，符合预期）

修复方法：显式括号包裹 `(P /\ Q => R)`，避免语义歧义。

### Deadlock 处理
Lossy network 模型允许消息丢失，导致单向握手卡住：
- `ClientKeyFinish` 丢失 → Server 卡在 `sentSK`
- TCP 重传/超时在真实协议中解决，但 TLA+ 网络抽象层不建模
- 使用 `-deadlock` 标志关闭死锁检测（TLA+ 标准做法）

## 已知限制（诚实声明）

| 缺口 | 严重程度 | 说明 |
|------|----------|------|
| Lossy network deadlock | 中 | Liveness 问题；不变式不受影响 |
| K3 强形式依赖模型假设 | 中 | `DeriveKey(i)=i` 断言会话唯一性；真实协议靠密码学随机性保证 |
| 密码学安全性（EasyCrypt） | 高 | TLA+ 只验证协议逻辑，不验证 ML-KEM-768 IND-CCA2 |

> **核心保证**：TLA+ 证明的是"**如果密码原语安全，则协议逻辑安全**"。ML-KEM-768 本身的安全性属于 FIPS 203 范畴。

## 下一步建议

| 优先级 | 任务 | 工作量 |
|--------|------|--------|
| **P1（建议）** | Liveness 不变式：`<>(cState[i]="active" /\ sState[i]="active")` | 2h |
| **P2（长期）** | EasyCrypt / CryptoVerif 密码学证明 | 数周-数月 |

## 产出文件

```
docs/tla/
  C2.tla    — TLA+ 模块（~250行，含注释）
  C2.cfg    — TLC 配置（7条不变式）
```

## 经验教训

1. **函数初始化**：`cState = [i ∈ 1..N |-> "init"]` 在 TLC BFS 中正确初始化函数变量；使用 `<<...>>` 会导致 DOMAIN 量词失败
2. **逗号缺失**：`"ClientKeyFinish" \ * ...` 缺少逗号导致 parse error
3. **类型混用**：`cKeyValue[i]` 先用 `""` 后改 Nat，需同步修改 TypeOK 和哨兵值（`""`→`0`）
4. **操作符优先级**：TLA+ 中 `=>` 优先级低于 `\A`；建议始终显式加括号
5. **不变式 Guard**：使用 `(antecedent => consequent)` 显式括号，避免 TLC BFS 歧义

---

时间戳：2026-07-14 21:15 CST  
工具：TLC 2026.07.14 · Java 21 · tla2tools.jar  
结果：101,467 states · 7 invariants · 0 violations · EXIT 0
