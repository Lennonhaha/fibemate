# LG v2.3 Stage-2 开发记录（2026-08-16）

## 目标

按 VMProtect 路线图阶段 2，为 LG v2.3 添加「虚拟机保护」层——但采用**差异化设计**，完全避开 VMProtect 的具体实现，保证商业合规。

用户决策（选 A）：Stage-2 保留 VM 架构，但做差异化设计（混淆专用指令 + 随机 opcode 映射 + 独立命名体系）。

## 差异化方案

| 组件 | 避免（VMProtect 风格） | 采用（LG v2.3 风格） |
|:---|:---|:---|
| 指令命名 | VM_PUSH/VM_POP/VM_ENTER | OP_WREATH/OP_SHUFFLE/OP_SBOX/OP_MIX |
| 指令编码 | 固定 opcode 映射 | **随机 opcode 映射**（seed 驱动） |
| VM 入口/出口 | VM_ENTER/VM_EXIT | pipeline_enter/pipeline_exit |
| 文档定位 | 通用代码虚拟化 | **数学混淆管道** |

## 实现内容

### 新增 3 个模块（`experimental/vwz-lg/lg-v2.3/src/`）

1. **`opcode.rs`**（6408B）：16 条混淆专用指令集 + seed 驱动的 `OpcodeMap`（0..15 上的随机双射，每次编译不同，无固定编码可被主张侵权）
2. **`vm.rs`**（15416B）：栈式 VM 执行器。operand 约定：bit7 = 反向标志，bits0..6 = 参数。MAX_STACK=64 + MAX_STEPS=4096 防失控循环。
3. **`pipeline.rs`**（6528B）：seed 编译出 forward/inverse 程序，串联 `premix → VM → Wreath`（正向）与逆序（反向）

### 新增 4 个 WASM API（向后兼容）

- `lgv3_pipeline_obfuscate(data, seed, session_key)`
- `lgv3_pipeline_deobfuscate(data, seed, session_key)`
- `lgv3_pipeline_bytecode(seed)` → hex
- `lgv3_pipeline_bytecode_inverse(seed)` → hex

### 版本升级

- `lgv2_version()` → `"LG v2.3-alpha-stage2 (programmable pipeline VM, ...)"`
- `lgv3_audit_log()` modules 数组加入 `opcode`/`vm`/`pipeline`

## 关键 bug 修复

**Stage-1 遗漏**：`premix.rs` 从未被 git 跟踪（被 `.gitignore:137` 的 `experimental/` 规则挡住），但 `lib.rs` 里 `pub mod premix;` 引用了它 → 任何人 clone 后 `cargo build` 会直接失败。本次用 `git add -f` 强制补上。

**VM 逆操作正确性**（3 个测试失败 → 修复）：
- 非自逆操作（Mix/Rot/Add/Shuffle）最初没有正确的反向语义
- 统一用 **operand bit7 作为反向标志**，低 7 位作参数
- 自逆操作（XOR/Swap/Rev）忽略该标志
- Shuffle 逆操作需记录 swap 选择序列再反向应用

## 验证结果

- **Rust 测试**：46/46 全绿（含新增 depth 敏感性测试 + bytecode-depth/session 差异测试）
- **WASM 导出**：20 个函数全部就位
- **性能**：~14-17 MB/s（与 Stage-1 相当，VM 层开销可忽略）
- **功能**：roundtrip 各尺寸全 PASS、session 独立性 PASS、字节码 per-seed 差异 PASS、活跃维度 256

## 提交

```
3c7ac605d feat(lg-v2.3): Stage-2 programmable obfuscation pipeline VM
4188ece08 feat(lg-v2.3): Stage-2 API gains depth + session_key in bytecode compilation
```

推送到 `experimental/vwz-lg` 分支（`066933c9f..4188ece08`），三端一致。

## API 签名定稿（含 depth + session_key）

用户拍板选 B，API 从两参/单参升级为四参，让 depth 可变 + session_key 参与字节码编译：

```rust
lgv3_pipeline_obfuscate(data, seed, session_key, depth)
lgv3_pipeline_deobfuscate(data, seed, session_key, depth)
lgv3_pipeline_bytecode(seed, session_key, depth)
lgv3_pipeline_bytecode_inverse(seed, session_key, depth)
```

**防御增强**：不同 session（或 depth）现在产出完全不同的字节码，分析师无法在没有三个参数的情况下静态恢复 VM 布局。

## 合规声明（写入源码注释）

> LG v2.3 的虚拟机设计基于计算机科学标准概念（栈式 VM、自定义指令集），所有指令编码均为随机生成，与任何商用产品（包括 VMProtect）的具体实现无关。本项目的设计目标是为"数学混淆管道"提供执行环境，而非通用代码虚拟化。

## 下一步

- Stage-2 收尾：全 0 输入验证、session 差异 diff 比例量化
- Stage-3（变异+加密）：rand_seed 随机化 + ChaCha8 轻量加密（8/31 后）
- 生产评估（P1）+ Ghidra/IDA 反向工程耗时实测（P2）—— 8/31 后
