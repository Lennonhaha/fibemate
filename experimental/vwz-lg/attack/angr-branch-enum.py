#!/usr/bin/env python3
"""
angr-branch-enum.py — Angr 符号执行枚举 LG v2.2 WASM 控制流分支

Target: LG v2.2 7-layer wreath-product finite group obfuscation
      lookingglass_v2_bg.wasm (or lgv2.3 compiled binary)
Output: 控制流图分析报告 + 未触发分支枚举

原理:
  LG v2.2 的 7 层混淆每层包含条件逻辑（看门狗检测 / depth 验证等）。
  Angr 通过符号执行遍历所有可达路径，标记未触发的分支。

使用前提:
  - pip install angr
  - 需要 LG v2.2 WASM 编译产物
  - Angr 对 WASM 的支持有限，推荐先用 wasm2c 或 wasmtime 中转
  - 备选方案：如果 WASM 不可行，可以用 Angr 分析 services/lg-service.js 的 Node 进程

警告:
  纯实验验证。Angr 对 WASM 的符号执行属于研究前沿，
  可能需要手动适配加载器。见 RESULT.md 中的已知限制章节。
"""

import argparse
import json
import os
import sys
import time
from collections import defaultdict


# ---- WASM 基础分析 (不依赖 angr 时的纯结构分析) ----

def analyze_wasm_imports_exports(wasm_path: str) -> dict:
    """解析 WASM binary 的 imports/exports 和函数表 (不需要 angr)"""
    if not os.path.exists(wasm_path):
        return {"error": f"WASM not found: {wasm_path}"}

    with open(wasm_path, "rb") as f:
        data = f.read()

    # 验证 magic number
    if data[:4] != b"\x00asm":
        return {"error": "Not a valid WASM file (bad magic)"}

    version = int.from_bytes(data[4:8], 'little')
    result = {
        "file": wasm_path,
        "size_bytes": len(data),
        "wasm_version": version,
        "imports": [],
        "exports": [],
        "function_count": 0,
        "memory_limits": {},
        "sections": [],
    }

    # 简易 WASM 解析器 (只读 section types 和基本计数)
    pos = 8
    while pos < len(data):
        section_id = data[pos]
        pos += 1
        size, size_len = 0, 0
        shift = 0
        while True:
            byte = data[pos]
            pos += 1
            size_len += 1
            size |= (byte & 0x7f) << shift
            if not (byte & 0x80):
                break
            shift += 7

        section_start = pos
        result["sections"].append({"id": section_id, "size": size})

        # Section 1: Type (不详细解析)
        # Section 2: Import
        if section_id == 2:
            count, pos, _ = read_uleb128(data, pos)
            for _ in range(min(count, 50)):
                # module name
                mod_len, pos, _ = read_uleb128(data, pos)
                module = data[pos:pos+mod_len].decode('utf-8', errors='replace')
                pos += mod_len
                # field name
                fld_len, pos, _ = read_uleb128(data, pos)
                field = data[pos:pos+fld_len].decode('utf-8', errors='replace')
                pos += fld_len
                # import kind
                kind = data[pos]
                pos += 1
                if kind == 0:  # function
                    _, pos, _ = read_uleb128(data, pos)
                elif kind == 1:  # table
                    pos += 2
                elif kind == 2:  # memory
                    limits_flag = data[pos]
                    pos += 1
                    min_pages, pos, _ = read_uleb128(data, pos)
                    max_val = None
                    if limits_flag & 1:
                        max_val, pos, _ = read_uleb128(data, pos)
                    result["memory_limits"] = {"min_pages": min_pages, "max_pages": max_val}
                elif kind == 3:  # global
                    pos += 2
                result["imports"].append(f"{module}.{field}")

        # Section 7: Export
        if section_id == 7:
            count, pos, _ = read_uleb128(data, pos)
            for _ in range(count):
                name_len, pos, _ = read_uleb128(data, pos)
                name = data[pos:pos+name_len].decode('utf-8', errors='replace')
                pos += name_len
                kind = data[pos]
                pos += 1
                _, pos, _ = read_uleb128(data, pos)
                result["exports"].append(name)

        pos = section_start + size

    # 统计
    lg_exports = [e for e in result["exports"] if e.startswith("lgv2_") or e.startswith("lg_")]
    result["lg_related_exports"] = lg_exports

    return result


def read_uleb128(data: bytes, pos: int) -> tuple[int, int, int]:
    """Read LEB128 unsigned integer"""
    result = 0
    shift = 0
    length = 0
    while pos < len(data):
        byte = data[pos]
        pos += 1
        length += 1
        result |= (byte & 0x7f) << shift
        if not (byte & 0x80):
            break
        shift += 7
    return result, pos, length


# ---- Angr 符号执行 (需要 angr installed) ----

def angr_branch_enum(wasm_path: str) -> dict:
    """用 Angr 枚举所有控制流分支"""
    try:
        import angr
        import claripy
    except ImportError:
        return {
            "error": "angr not installed. Run: pip install angr",
            "note": "WASM symbol analysis requires angr. For basic structural analysis, run without --angr."
        }

    result = {
        "target": wasm_path,
        "method": "angr CFG + symbolic execution",
        "nodes_total": 0,
        "branches": [],
        "unreachable": [],
        "path_count": 0,
        "errors": []
    }

    try:
        proj = angr.Project(wasm_path, auto_load_libs=False,
                           load_options={"main_opts": {"arch": "WASM32"}})
    except Exception as e:
        result["errors"].append(f"Failed to load WASM project: {e}")
        result["note"] = ("Angr WASM support is experimental. "
                          "Try: wasm2c to convert to C, then angr on native binary. "
                          "Or: analyze the Node.js CLI wrapper instead.")
        return result

    # CFG 分析
    try:
        cfg = proj.analyses.CFGFast()
        result["nodes_total"] = len(cfg.nodes())
        for node in cfg.nodes():
            if not node.is_simprocedure:
                successors = list(cfg.get_successors(node))
                if len(successors) > 1:
                    result["branches"].append({
                        "addr": hex(node.addr),
                        "successors": len(successors),
                        "size": node.size,
                    })
    except Exception as e:
        result["errors"].append(f"CFG analysis failed: {e}")

    # 符号执行 (entry point)
    try:
        state = proj.factory.entry_state()
        simgr = proj.factory.simulation_manager(state)
        simgr.run(limit=1000)
        result["path_count"] = len(simgr.deadended)
        for i, path in enumerate(simgr.deadended[:5]):
            result.setdefault("sample_constraints", []).append(
                str(path.solver.constraints)[:200]
            )
    except Exception as e:
        result["errors"].append(f"Symbolic execution failed: {e}")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Angr branch enumeration for LG v2.2 WASM")
    parser.add_argument("--wasm", type=str,
                        default="www/crypto/lgv2/lookingglass_v2_bg.wasm",
                        help="LG v2.2 WASM 文件路径")
    parser.add_argument("--output", type=str, default="lg-branch-report.json",
                        help="输出报告文件")
    parser.add_argument("--angr", action="store_true",
                        help="启用 Angr 符号执行 (需要 pip install angr)")
    parser.add_argument("--verbose", action="store_true",
                        help="详细输出")
    args = parser.parse_args()

    print(f"[angr-branch-enum] Target: {args.wasm}")
    print(f"[angr-branch-enum] Angr mode: {'ON' if args.angr else 'OFF (structural only)'}")
    print()

    # 1. 基本 WASM 结构分析 (始终执行, 不依赖 angr)
    print("[1/2] WASM structural analysis...")
    wasm_info = analyze_wasm_imports_exports(args.wasm)
    if "error" in wasm_info:
        print(f"  ERROR: {wasm_info['error']}")
        return 1

    print(f"  File: {wasm_info['file']} ({wasm_info['size_bytes']} bytes)")
    print(f"  WASM version: {wasm_info['wasm_version']}")
    print(f"  Sections: {len(wasm_info['sections'])}")
    print(f"  Imports: {len(wasm_info['imports'])}")
    print(f"  Exports: {len(wasm_info['exports'])}")
    print(f"  LG-related exports: {wasm_info['lg_related_exports']}")
    if wasm_info["memory_limits"]:
        print(f"  Memory: {wasm_info['memory_limits']}")

    # 2. Angr 符号执行 (可选)
    report = {"wasm_info": wasm_info, "angr_results": None}

    if args.angr:
        print("\n[2/2] Angr symbolic execution...")
        start = time.time()
        report["angr_results"] = angr_branch_enum(args.wasm)
        elapsed = time.time() - start
        print(f"  Completed in {elapsed:.1f}s")
        if report["angr_results"].get("error"):
            print(f"  NOTE: {report['angr_results']['error']}")
        else:
            print(f"  Nodes: {report['angr_results']['nodes_total']}")
            print(f"  Branches: {len(report['angr_results']['branches'])}")
            print(f"  Paths: {report['angr_results']['path_count']}")
    else:
        print("\n[2/2] Angr symbolic execution SKIPPED (use --angr to enable)")
        print("  For Angr WASM analysis:")
        print("    1. pip install angr")
        print("    2. Ensure WASM binary exists at: " + args.wasm)
        print("    3. Run: python3 angr-branch-enum.py --angr")

    # 保存报告
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved: {args.output} ({os.path.getsize(args.output)} bytes)")

    return 0


if __name__ == "__main__":
    exit(main())
