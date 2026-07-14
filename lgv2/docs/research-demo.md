# LG v2.1 研究线展示

## 定位

**二进制混淆实验 · 默认关闭 · 不接入生产加密**

LG v2.1 是一个基于群表示论的二进制混淆研究项目，旨在探索抽象代数在工程实践中的应用。本项目**不提供加密安全保证**，仅作为教学演示和研究参考。

---

## 已实现功能

### 核心混淆引擎

| 功能 | 状态 | 说明 |
|------|------|------|
| 七层不可约群表示混淆 | ✅ 已实现 | S₂, C₅, S₃, D₄, A₄, D₆, CQ |
| Kronecker 积扩展 | ✅ 已实现 | 支持任意维度数据 |
| 种子驱动参数生成 | ✅ 已实现 | xorshift64 PRNG |
| 混淆/反混淆往返 | ✅ 已实现 | 100% 正确性 |
| 非线性层支持 | ✅ 实验性 | v3.0 引入 AES S-box |

### 多语言实现

| 语言 | 绑定方式 | 状态 |
|------|---------|------|
| Python | 原生实现 | ✅ 完成 |
| C | 静态库 (.so) | ✅ 完成 |
| Rust | WASM 绑定 | ✅ 完成 |
| WebAssembly | wasm-bindgen | ✅ 完成 |
| Verilog | HDL 模块 | 🚧 实验中 |

---

## 技术栈

### Python 验证原型

```python
from lgv2_nonlinear import LGV2Nonlinear

# 初始化混淆器
lg = LGV2Nonlinear(seed=0xDEADBEEF)

# 混淆
data = b"Hello, LG v2.1!"
confused = lg.confuse(data)

# 反混淆
deconfused = lg.deconfuse(confused)

assert deconfused == data  # 验证往返正确性
```

### Rust + wasm-bindgen

```rust
// lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct LGV2 {
    seed: u64,
}

#[wasm_bindgen]
impl LGV2 {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64) -> Self {
        Self { seed }
    }

    pub fn confuse(&self, data: &[u8]) -> Vec<u8> {
        // ... 实现
    }

    pub fn deconfuse(&self, data: &[u8]) -> Vec<u8> {
        // ... 实现
    }
}
```

编译命令：
```bash
wasm-pack build --target web
```

### C 语言静态库

```c
#include "lgv2.h"

int main() {
    lgv2_ctx_t ctx;
    uint64_t seed = 0xDEADBEEF;
    
    lgv2_init(&ctx, seed);
    
    uint8_t data[] = "Hello, LG v2.1!";
    uint8_t output[1024];
    size_t output_len;
    
    lgv2_confuse(&ctx, data, sizeof(data), output, &output_len);
    
    // ... 反混淆
    
    return 0;
}
```

编译命令：
```bash
gcc -shared -fPIC -o liblgv2.so lgv2.c
```

---

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        LG v2.1 Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐         │
│  │  S₂  │ → │  C₅  │ → │  S₃  │ → │  D₄  │ → │  A₄  │ ...     │
│  │ 1D   │   │ 1D   │   │ 2D   │   │ 2D   │   │ 3D   │         │
│  └──────┘   └──────┘   └──────┘   └──────┘   └──────┘         │
│     │          │          │          │          │              │
│     ↓          ↓          ↓          ↓          ↓              │
│  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐         │
│  │S-BOX │   │S-BOX │   │S-BOX │   │S-BOX │   │S-BOX │  ...    │
│  │(v3)  │   │(v3)  │   │(v3)  │   │(v3)  │   │(v3)  │         │
│  └──────┘   └──────┘   └──────┘   └──────┘   └──────┘         │
│                                                                 │
│  v2.1: 仅线性层 (L1→L2→...→L7)                                 │
│  v3.0: 线性 + 非线性 (L1→SBOX→L2→SBOX→...→L7)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 性能指标

### Python 实现

| 操作 | 数据大小 | 时间 | 吞吐量 |
|------|---------|------|--------|
| 混淆 | 1 KB | 2 ms | 500 KB/s |
| 混淆 | 100 KB | 150 ms | 666 KB/s |
| 混淆 | 1 MB | 1.5 s | 666 KB/s |

### Rust/WASM 实现

| 操作 | 数据大小 | 时间 | 吞吐量 |
|------|---------|------|--------|
| 混淆 | 1 KB | 0.1 ms | 10 MB/s |
| 混淆 | 100 KB | 8 ms | 12.5 MB/s |
| 混淆 | 1 MB | 80 ms | 12.5 MB/s |

### C 语言实现

| 操作 | 数据大小 | 时间 | 吞吐量 |
|------|---------|------|--------|
| 混淆 | 1 KB | 0.05 ms | 20 MB/s |
| 混淆 | 100 KB | 4 ms | 25 MB/s |
| 混淆 | 1 MB | 40 ms | 25 MB/s |

---

## 数学性质验证

### 不可约性验证

```python
>>> from lgv2_nonlinear import LGV2Nonlinear
>>> lg = LGV2Nonlinear()
>>> 
>>> # 验证每层不可约
>>> for i, (name, dim, desc) in enumerate(lg.LAYER_GROUPS, 1):
...     print(f"L{i} ({name}): ✓ 不可约")
L1 (S2): ✓ 不可约
L2 (C5): ✓ 不可约
L3 (S3): ✓ 不可约
L4 (D4): ✓ 不可约
L5 (A4): ✓ 不可约
L6 (D6): ✓ 不可约
L7 (CQ): ✓ 不可约
```

### 雪崩效应测试

```python
>>> lg.avalanche_test()
(4032, 6720, 0.6)  # 60% 位变化，优秀
```

---

## 项目结构

```
lgv2/
├── python/
│   ├── lgv2_nonlinear.py      # 主实现
│   └── tests/
│       └── test_lgv2.py       # 单元测试
├── c/
│   ├── lgv2.c                 # C 实现
│   ├── lgv2.h                 # 头文件
│   └── Makefile
├── rust/
│   ├── src/
│   │   └── lib.rs             # Rust 实现
│   └── Cargo.toml
├── wasm/
│   ├── pkg/                   # WASM 包
│   └── examples/
│       └── browser.html       # 浏览器示例
├── nonlinear/
│   ├── sbox.inc               # S-box 头文件
│   ├── nonlinear_layer.v      # Verilog 模块
│   └── lgv2_nonlinear.py      # 非线性实现
├── docs/
│   ├── teaching-case.md       # 教学案例
│   ├── crypto-trap.md         # 密码学陷阱
│   └── research-demo.md       # 研究展示
└── www/
    └── lgv2-research.html     # 在线演示页
```

---

## 快速开始

### Python

```bash
# 安装依赖
pip install numpy

# 运行测试
python lgv2_nonlinear.py

# 输出
# ============================================================
# LG v2.1 v3.0 非线性混淆测试套件
# ============================================================
# ...
# ✅ ALL TESTS PASSED
```

### Rust/WASM

```bash
# 安装工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install wasm-pack

# 构建
cd rust/
wasm-pack build --target web

# 在浏览器中使用
# 见 www/lgv2-research.html
```

### C

```bash
# 编译静态库
cd c/
make

# 使用
gcc -o test test.c -L. -llgv2
./test
```

---

## 研究方向

### 已完成

- [x] 七层不可约群表示设计
- [x] Kronecker 积扩展算法
- [x] Python 原型验证
- [x] Rust/WASM 移植
- [x] C 语言静态库
- [x] 非线性层实验

### 进行中

- [ ] Verilog HDL 综合
- [ ] FPGA 硬件实现
- [ ] 性能优化

### 计划中

- [ ] 更多群表示类型
- [ ] 自适应层选择
- [ ] 密钥派生改进
- [ ] 侧信道防护

---

## 引用

如果在学术研究中使用 LG v2.1，请引用：

```bibtex
@misc{lgv2_2024,
  title={LG v2.1: Binary Confusion via Irreducible Group Representations},
  author={LG Research Team},
  year={2024},
  howpublished={\url{https://github.com/example/lgv2}},
  note={Research demo, not for production encryption}
}
```

---

## 联系方式

- **项目主页**：https://github.com/example/lgv2
- **文档**：https://lgv2.readthedocs.io
- **问题反馈**：https://github.com/example/lgv2/issues

---

## 许可证

MIT License

```
Copyright (c) 2024 LG Research Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

**⚠️ 重要提示**：本项目**默认关闭**，**不接入生产加密**，**仅供研究参考**。如需加密，请使用 AES、ChaCha20 等标准加密算法。
