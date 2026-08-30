#!/usr/bin/env python3
"""
fit-mapping.py — 根据 LG v2.2 置换样本拟合映射表

Target: LG v2.2 7-layer wreath-product finite group obfuscation
Input: lg-samples.json (from collect-samples.py)
Output: lg-mapping-table.json

数学原理:
  LG v2.2 混淆是确定性双射 f_s,d: B^n → B^n (seed=s, depth=d)。
  对于每个 (s,d) 组合，存在置换映射表 Π_{s,d}: [0,255]^n → [0,255]^n。
  本脚本从样本中拟合出完整的 Π_{s,d}。

验证标准:
  - 映射关系完整：每个输入值在每个位置有唯一输出
  - 无冲突：同一位置的同一输入值不能映射到两个不同输出
  - 覆盖率：给定样本数 K 和块大小 n, 覆盖率 = K / (256^n)

警告:
  这是实验验证脚本，非生产攻击工具。
  LG v2.2 定位为逆向工程开销层，非密码学防护层。
"""

import argparse
import json
import os
from collections import defaultdict


def fit_mapping_table(samples: list[dict]) -> dict:
    """
    从样本中拟合每个 seed+depth 的置换映射表。

    返回结构:
    {
      "meta": ...,
      "mappings": {
        "<seed_hex>": {
          "<depth>": {
            "pos_0": {"00": "ab", "01": "cd", ...},
            "pos_1": {...},
            ...
          }
        }
      }
    }
    """
    # 嵌套 defaultdict: seed → depth → pos → input_byte → output_byte
    mappings = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    conflicts = []
    total_pairs = 0

    for sample in samples:
        seed = sample["seed"]
        depth = sample["depth"]
        in_bytes = bytes.fromhex(sample["in"])
        out_bytes = bytes.fromhex(sample["out"])
        n = len(in_bytes)

        for pos in range(n):
            in_b = in_bytes[pos]
            out_b = out_bytes[pos]
            existing = mappings[seed][depth][pos].get(in_b)
            if existing is not None and existing != out_b:
                conflicts.append({
                    "seed": seed,
                    "depth": depth,
                    "pos": pos,
                    "in_byte": in_b,
                    "existing_out": existing,
                    "new_out": out_b,
                })
            mappings[seed][depth][pos][in_b] = out_b
            total_pairs += 1

    # 序列化到 JSON-serializable 结构
    serialized = {}
    stats = {"total_seeds": 0, "total_depth_combos": 0, "total_positions": 0,
             "covered_cells": 0, "max_coverage": 0, "conflicts": len(conflicts)}

    for seed, depthes in mappings.items():
        seed_key = str(seed)
        serialized[seed_key] = {}
        stats["total_seeds"] += 1
        for depth, positions in depthes.items():
            depth_key = str(depth)
            serialized[seed_key][depth_key] = {}
            stats["total_depth_combos"] += 1
            for pos, table in positions.items():
                pos_key = f"pos_{pos}"
                # 转为字符串键（JSON 要求）
                str_table = {f"{k:02x}": f"{v:02x}" for k, v in sorted(table.items())}
                serialized[seed_key][depth_key][pos_key] = str_table
                stats["total_positions"] += 1
                stats["covered_cells"] += len(table)
                # 每个位置最多 256 个可能输入
                coverage = len(table) / 256.0
                if coverage > stats["max_coverage"]:
                    stats["max_coverage"] = coverage

    return {
        "meta": {
            "target": "LG v2.2 7-layer wreath-product finite group",
            "samples_used": len(samples),
            "total_pairs_processed": total_pairs,
        },
        "stats": stats,
        "conflicts": conflicts[:20],  # 只记录前 20 个冲突
        "mappings": serialized,
    }


def print_report(result: dict):
    """打印拟合报告"""
    meta = result["meta"]
    stats = result["stats"]
    conflicts = result["conflicts"]

    print("=" * 60)
    print("LG v2.2 Mapping Table Fit Report")
    print("=" * 60)
    print(f"Samples used:     {meta['samples_used']}")
    print(f"Pairs processed:  {meta['total_pairs_processed']}")
    print(f"Unique seeds:     {stats['total_seeds']}")
    print(f"Depth combos:     {stats['total_depth_combos']}")
    print(f"Total positions:  {stats['total_positions']}")
    print(f"Covered cells:    {stats['covered_cells']}")
    print(f"Max coverage:     {stats['max_coverage']:.2%}")
    print(f"Conflicts:        {stats['conflicts']}")

    if conflicts:
        print(f"\n⚠️  CONFLICTS DETECTED ({len(conflicts)} total, showing first 5):")
        for c in conflicts[:5]:
            print(f"  seed={c['seed']}, depth={c['depth']}, pos={c['pos']}, "
                  f"in=0x{c['in_byte']:02x} → 0x{c['existing_out']:02x} vs 0x{c['new_out']:02x}")
        print("  → 冲突意味着同一输入在不同样本中映射到不同输出。")
        print("  → 可能原因：随机种子生成不一致 / 样本污染 / WASM 语义不同于 Python 模拟。")
    else:
        print("\n✅ No conflicts — deterministic bijection confirmed.")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Fit LG v2.2 permutation mapping table from samples")
    parser.add_argument("--input", type=str, default="lg-samples.json", help="样本文件")
    parser.add_argument("--output", type=str, default="lg-mapping-table.json", help="输出映射表文件")
    parser.add_argument("--verbose", action="store_true", help="详细输出")
    args = parser.parse_args()

    print(f"[fit-mapping] Loading samples from {args.input}...")
    with open(args.input) as f:
        data = json.load(f)

    samples = data.get("samples", data if isinstance(data, list) else [])
    if not samples:
        print("[fit-mapping] ERROR: No samples found in input file")
        return 1

    print(f"[fit-mapping] Fitting mapping table from {len(samples)} samples...")
    result = fit_mapping_table(samples)
    print_report(result)

    # 保存
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"[fit-mapping] Saved to {args.output} ({os.path.getsize(args.output)} bytes)")

    return 0 if result["stats"]["conflicts"] == 0 else 1


if __name__ == "__main__":
    exit(main())
