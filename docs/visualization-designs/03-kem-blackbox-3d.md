# 密钥封装"黑盒"3D 交互模型 — 可视化设计文档

**类型**：3D 爆炸拆解
**状态**：设计阶段（冻结期内不实现）
**优先级**：#3

---

## 1. 目标

将 ML-KEM-768 的三阶段（KeyGen / Encaps / Decaps）表示为可点击拆解的 3D 黑盒模型。每个黑盒点击后展开内部子模块，展示数据在模块间的流动。

**核心叙事**："黑盒里面不是魔法——是三个确定性的数学步骤。"

---

## 2. 数据来源

| 数据项 | 来源 |
|--------|------|
| KeyGen 流程 | `packages/pqc-kem/native/kem.c` → crypto_kem_keypair_derand |
| Encaps 流程 | `packages/pqc-kem/native/kem.c` → crypto_kem_enc |
| Decaps 流程 | `packages/pqc-kem/native/kem.c` → crypto_kem_dec |
| IND-CPA 子层 | `packages/pqc-kem/native/indcpa.c`（KeyGen / Enc / Dec） |
| NTT 模块 | `packages/pqc-kem/native/ntt.c` |
| CBD 采样 | `packages/pqc-kem/native/cbd.c` |
| 参数表 | `packages/pqc-kem/native/params_768.h`（K=3, ETA1=2, ETA2=2, du=10, dv=4） |

---

## 3. 视觉结构

### 3.1 三黑盒布局

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│  KeyGen  │ →  │  Encaps  │ →  │  Decaps  │
│  (pk,sk) │    │  (ct,ss) │    │    ss    │
└──────────┘    └──────────┘    └──────────┘
```

### 3.2 点击 KeyGen 展开后

```
┌─────────────────────────────────────────┐
│  KeyGen 内部                             │
├─────────────────────────────────────────┤
│  [seed d] → INDCPA_KeyGen                │
│              ├─ NTT(A)     (矩阵生成)     │
│              ├─ CBD(s)     (噪声采样)     │
│              ├─ basemul     (矩阵乘法)     │
│              └─ pack/compress            │
│                                            │
│  输出: pk = ek || H(ek)                   │
│       sk = d || ek || H(ek) || z          │
└─────────────────────────────────────────┘
```

### 3.3 点击 Encaps 展开后

```
┌─────────────────────────────────────────┐
│  Encaps(pk) 内部                         │
├─────────────────────────────────────────┤
│  [random m] → INDCPA_Encrypt             │
│               ├─ unpack(pk)              │
│               ├─ NTT(A^T)  (转置矩阵)     │
│               ├─ CBD(e1) / CBD(e2)       │
│               ├─ compress / pack         │
│               └─ G(m ‖ H(pk)) → (K, r)   │
│                                            │
│  输出: ct = (c1, c2)                      │
│       ss = KDF(K ‖ H(ct))                 │
└─────────────────────────────────────────┘
```

### 3.4 点击 Decaps 展开后

```
┌─────────────────────────────────────────┐
│  Decaps(sk, ct) 内部                     │
├─────────────────────────────────────────┤
│  unpack(sk) → (d, ek, H_ek, z)           │
│  m' = INDCPA_Decrypt(s, ct)              │
│    ├─ unpack(ct)                         │
│    ├─ NTT(s)   (秘密向量)                 │
│    ├─ basemul + invNTT                   │
│    └─ decompress / unpack                │
│                                            │
│  (K', r') = G(m' ‖ H_ek)                 │
│  K₀ = KDF(K' ‖ H(ct))                    │
│  K₁ = PRF(z, ct)   ← 拒绝密钥             │
│  ss = cmov(K₀, K₁, ct_original == ct)    │
│     (constant-time 条件选择)              │
└─────────────────────────────────────────┘
```

---

## 4. 交互设计

| 交互 | 行为 |
|------|------|
| 点击黑盒 | 3D 爆炸拆解，子模块飞出 |
| 悬停子模块 | 高亮该模块 + 显示输入/输出尺寸 + 数学公式 |
| 双击子模块 | 复位/收拢回黑盒 |
| 复位按钮 | 全局收拢所有黑盒 |
| 数据流粒子 | 小粒子在被选中的模块之间流动（表示数据传递） |

---

## 5. 颜色编码

| 颜色 | 含义 |
|------|------|
| 蓝色 | 确定性计算（矩阵/多项式） |
| 绿色 | 随机采样（噪声/种子） |
| 橙色 | 压缩/解压缩（pack/unpack） |
| 紫色 | 哈希/KDF/PRF |
| 红色 | 条件选择 cmov（安全关键） |

---

## 6. 技术栈

- Three.js 3D（BoxGeometry + Group 层级）
- GSAP 动画库（爆炸/收拢缓动）
- 自托管

---

## 7. 部署

| 项目 | 值 |
|------|------|
| 文件名 | `kem-blackbox-3d.html` |
| 路径 | `/opt/fibemate-repo/www/viz/kem-blackbox-3d.html` |

---

*冻结期状态：仅设计文档。*
