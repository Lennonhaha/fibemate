"""
gen-matrix-data.py — 生成 LG v2.2 7 层 Kronecker 矩阵 JSON 数据

产出: lg-matrix-layers.json
  - 7 层 256×256 矩阵 (每层是 Kronecker 乘积结果)
  - 非零元素索引 + 值 + 颜色编码
"""

import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) or '.')
from simulate_lg_matrix import (
    Q, ACTIVE_DIM, FULL_DIM, NUM_LAYERS,
    kron_ordered, expand_to_256, random_permutation
)

# 生成 7 层矩阵 (默认排列 [1,2,3,4,5,6,7])
perm_default = [1, 2, 3, 4, 5, 6, 7]
m_48 = kron_ordered(perm_default, inverse=False)
m_256 = expand_to_256(m_48)

# 收集非零元素
nonzero = []
for i in range(FULL_DIM):
    for j in range(FULL_DIM):
        v = m_256[i][j]
        if v != 0:
            # 颜色编码: 0..48 区域橙色, 48..256 蓝色(identity=值1), >1 白色
            in_active = i < ACTIVE_DIM and j < ACTIVE_DIM
            nonzero.append([i, j, v, in_active])

# 每层矩阵 (用于分层展示)
layers = []
for layer in range(1, NUM_LAYERS + 1):
    m_l = kron_ordered([layer], inverse=False)
    m_l_256 = expand_to_256(m_l)
    l_nz = []
    for i in range(FULL_DIM):
        for j in range(FULL_DIM):
            v = m_l_256[i][j]
            if v != 0:
                in_active = i < ACTIVE_DIM and j < ACTIVE_DIM
                l_nz.append([i, j, v, in_active])
    layers.append({
        "layer": layer,
        "name": ["S2(1D)", "C5(1D)", "S3(2D)", "D4(2D)", "A4(3D)", "D6(2D)", "CQ(2D)"][layer-1],
        "dim": [1, 1, 2, 2, 3, 2, 2][layer-1],
        "nonzero": len(l_nz),
        "elements": l_nz,
    })

# 排列空间采样 (从 5040 种排列随机抽 200 种, 降到 3D 用 PCA)
import random
perms = []
seen = set()
for _ in range(200):
    seed = random.randint(0, 2**64 - 1)
    p = tuple(random_permutation(seed))
    if p not in seen:
        seen.add(p)
        perms.append({
            "seed": f"0x{seed:016x}",
            "perm": list(p),
        })

# 输出
data = {
    "meta": {
        "Q": Q,
        "active_dim": ACTIVE_DIM,
        "full_dim": FULL_DIM,
        "num_layers": NUM_LAYERS,
        "perm_default": perm_default,
        "total_nonzero": len(nonzero),
        "density_pct": round(100 * len(nonzero) / (FULL_DIM * FULL_DIM), 2),
    },
    "full_matrix": {
        "nonzero": nonzero,
    },
    "layers": layers,
    "perm_sample": perms,
}

with open("lg-matrix-data.json", "w") as f:
    json.dump(data, f)
print(f"[gen-matrix-data] Saved: {len(nonzero)} nonzeros ({data['meta']['density_pct']}%) across {FULL_DIM}x{FULL_DIM}")
layer_descs = [f"{l['name']}({l['nonzero']} nz)" for l in layers]
print(f"[gen-matrix-data] Layers: {layer_descs}")
print(f"[gen-matrix-data] Perm sample: {len(perms)} unique perms")
