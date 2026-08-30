#!/usr/bin/env python3
"""
deobfuscate.py — 用拟合好的 LG v2.2 置换映射表批量离线去混淆

Target: LG v2.2 7-layer wreath-product finite group obfuscation
Input: lg-mapping-table.json (from fit-mapping.py) + obfuscated data file
Output: deobfuscated data

工作方式:
  1. 读取映射表
  2. 按 (seed, depth) 组合查找对应的置换映射
  3. 对混淆数据逐字节查表逆映射

警告:
  - 仅当拥有对应的 seed+depth 映射表时有效
  - 不同的 seed 是独立的加密域 (security via diversity)
  - 纯实验验证用途，非生产攻击工具
"""

import argparse
import json
import os
import sys
from typing import Optional


def load_inverse_mapping(mapping_file: str, seed: str, depth: int) -> dict[int, dict[int, int]]:
    """
    加载逆映射表: pos → {obfuscated_byte → original_byte}

    seed: 十六进制字符串，如 "0x1234"
    depth: 整数 1-7
    """
    with open(mapping_file) as f:
        data = json.load(f)

    mappings = data.get("mappings", {})
    fwd_table = mappings.get(seed, {}).get(str(depth), {})
    if not fwd_table:
        print(f"[deobfuscate] WARNING: No mapping found for seed={seed} depth={depth}", file=sys.stderr)
        return {}

    # 逆映射: pos → {output_byte → input_byte}
    inv = {}
    for pos_key, table in fwd_table.items():
        pos = int(pos_key.split("_")[1])
        inv[pos] = {}
        for in_hex, out_hex in table.items():
            out_byte = int(out_hex, 16)
            in_byte = int(in_hex, 16)
            if out_byte in inv[pos]:
                print(f"[deobfuscate] CONFLICT at pos={pos}: output byte 0x{out_byte:02x} "
                      f"maps to both 0x{inv[pos][out_byte]:02x} and 0x{in_byte:02x}", file=sys.stderr)
            inv[pos][out_byte] = in_byte

    coverage = len(inv)
    max_pos = max(inv.keys()) if inv else 0
    print(f"[deobfuscate] Loaded inverse mapping: {coverage} positions, "
          f"max position index={max_pos}", file=sys.stderr)
    return inv


def deobfuscate(data: bytes, inv_mapping: dict[int, dict[int, int]],
                fallback: str = "identity") -> bytes:
    """
    逐字节查逆映射表去混淆。

    fallback:
      - "identity": 无映射的位置保持原字节
      - "error": 无映射的位置抛异常
      - "replace": 用 0x00 替换
    """
    result = bytearray(len(data))
    missing_count = 0

    for pos in range(len(data)):
        obf_byte = data[pos]

        if pos in inv_mapping and obf_byte in inv_mapping[pos]:
            result[pos] = inv_mapping[pos][obf_byte]
        else:
            missing_count += 1
            if fallback == "error":
                raise ValueError(f"No inverse mapping for pos={pos}, byte=0x{obf_byte:02x}")
            elif fallback == "replace":
                result[pos] = 0x00
            else:  # identity
                result[pos] = obf_byte

    if missing_count:
        print(f"[deobfuscate] {missing_count}/{len(data)} bytes ("
              f"{100.0*missing_count/len(data):.1f}%) had no inverse mapping, "
              f"used fallback='{fallback}'", file=sys.stderr)

    return bytes(result)


def verify_roundtrip(original: bytes, recovered: bytes) -> dict:
    """验证去混淆是否完全恢复原始数据"""
    total = len(original)
    match = sum(1 for a, b in zip(original, recovered) if a == b)
    return {
        "total_bytes": total,
        "matched": match,
        "mismatched": total - match,
        "accuracy": match / total if total > 0 else 0,
    }


def main():
    parser = argparse.ArgumentParser(description="Deobfuscate LG v2.2 data using fitted mapping table")
    parser.add_argument("--mapping", type=str, default="lg-mapping-table.json",
                        help="映射表文件 (from fit-mapping.py)")
    parser.add_argument("--seed", type=str, required=True,
                        help="混淆种子 (hex, 如 0xAABB1234)")
    parser.add_argument("--depth", type=int, default=7,
                        help="混淆深度 (1-7)")
    parser.add_argument("--input", type=str, required=True,
                        help="混淆后的数据文件")
    parser.add_argument("--output", type=str, required=True,
                        help="去混淆后输出文件")
    parser.add_argument("--original", type=str,
                        help="原始明文文件 (用于验证 roundtrip)")
    parser.add_argument("--fallback", type=str, default="identity",
                        choices=["identity", "error", "replace"],
                        help="无映射时的回退策略")
    args = parser.parse_args()

    # 1. 加载逆映射
    print(f"[deobfuscate] Loading inverse mapping for seed={args.seed}, depth={args.depth}...")
    inv = load_inverse_mapping(args.mapping, args.seed, args.depth)

    if not inv:
        print("[deobfuscate] ERROR: No valid inverse mapping loaded")
        return 1

    # 2. 读混淆数据
    with open(args.input, "rb") as f:
        obf_data = f.read()
    print(f"[deobfuscate] Input: {len(obf_data)} bytes from {args.input}")

    # 3. 去混淆
    result = deobfuscate(obf_data, inv, args.fallback)

    # 4. 写输出
    with open(args.output, "wb") as f:
        f.write(result)
    print(f"[deobfuscate] Output: {len(result)} bytes to {args.output}")

    # 5. 验证 (if original provided)
    if args.original:
        with open(args.original, "rb") as f:
            original = f.read()
        report = verify_roundtrip(original, result)
        print(f"[deobfuscate] Verification: {report['matched']}/{report['total_bytes']} matched "
              f"({report['accuracy']:.4%})")
        if report['accuracy'] < 1.0:
            print(f"[deobfuscate] ⚠️  {report['mismatched']} bytes NOT recovered correctly")
            return 1
        else:
            print(f"[deobfuscate] ✅ Roundtrip verified — 100% recovery")

    return 0


if __name__ == "__main__":
    exit(main())
