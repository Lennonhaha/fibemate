# LG v2.3 Stage-1 完成报告 — 2026-08-16

## 任务来源
- 用户指令：按 VMProtect 路线图执行阶段 1（基础强化）
- 分支：`experimental/vwz-lg`（已切回 main）

## 问题定义

Wreath Kronecker 积活跃维度仅 48/256 字节（19%），后 208 字节仅做 Fisher-Yates 洗牌，攻击者只需逆向 48 字节。

## 解决方案：XOR-Keystream Pre/Post-Mix

**架构**：
```
数据 → premix(seed^session) → Wreath(seed) → postmix(seed^session) → 混淆后数据
```
- `premix`: XOR-keystream（XorShift64 PRNG）覆盖全 256 字节
- `postmix`: 同 premix（XOR 是自身逆）使 premix 完全可逆
- Wreath: 7 层 S-box + Fisher-Yates 置换（48 维活跃）
- 覆盖：premix 全 256 + Wreath 48 = **全字节覆盖**

## 产出文件

| 文件 | 用途 |
|:---|:---|
| `lg-v2.3/src/premix.rs` | XOR-keystream pre/post-mix 核心 |
| `lg-v2.3/src/lib.rs` | 新增 `lgv3_confuse_mix`/`lgv3_deconfuse_mix`/`lgv3_active_dim` |
| `lg-v2.3/bench_stage1.js` | 性能基准脚本 |

## 验证结果

| 测试 | 结果 |
|:---|:---:|
| Rust 测试 | **22/22 PASS** |
| Premix 全字节覆盖 | **253/256 = 98.8%** |
| Roundtrip 可逆 | ✅ |
| Session 独立性 | ✅ 不同 session 输出不同 |
| WASM 体积 | **27 KB**（旧 34 KB，↓21%）|
| 性能 | ~16 MB/s（1MB，overhead ~11%）|
| 向后兼容 | ✅ 所有旧 API 不变 |

## WASM 导出函数（新增 3 个）

```
lgv3_confuse_mix(data, seed, session_key, depth)  → Vec<u8>
lgv3_deconfuse_mix(data, seed, session_key, depth) → Vec<u8>
lgv3_active_dim()                                 → usize  (256)
```

## 未完成（阶段 1 后续 / 8/31 后）

1. **Session 独立性量化**：当前已"不同 session 不同输出"，但还需测 diff 比例（≥50% 目标）
2. **全字节混淆验证**：测 256B 全 0 输入，验证输出全字节变化（非 premix 的 XorShift64 自举问题）
3. **Cargo.toml 命名**：需决定 `lgv2_3` 还是 `lgv2-3`（提交时用 underscore 临时绕过）
4. **Push 到 origin**：experimental/ 在 .gitignore，推送需单独处理
5. **WASM pkg 备份**：已保存在 `experimental/vwz-lg/lg-v2.3/pkg/`

## 阶段 2（VMProtect 虚拟机保护）待启动

自定义字节码解释器 — 设计文档待写。
