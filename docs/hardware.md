# FIBEMATE FPGA 硬件验证文档

## 概述

本文档记录 FIBEMATE 项目 FPGA 加速器的硬件验证状态、引脚分配和调试通道。

**FPGA 平台：** A7-Lite (XC7A35T-2FGG484)
**开发工具：** Vivado 2021.1
**当前 Bitstream：** v5_n19 (2026-07-24 验证)

---

## UART 调试接口

### 已验证的引脚分配 (XDC 约束)

| 信号 | FPGA 引脚 | 物理位置 | IOSTANDARD | 连接目标 |
|------|-----------|----------|------------|----------|
| `uart_tx` | **N19** | PMOD1 pin1 | LVCMOS33 | 外置 CH340 RXD → COM6 |
| `uart_rx` | **T19** | PMOD1 pin2 | LVCMOS33 | ⚠️ 未实连（保留位） |
| `led[0]` | **M18** | 板载 | LVCMOS33 | 心跳指示灯 (1Hz) |
| `led[1]` | **R17** | 板载 | LVCMOS33 | NTT 故障指示 |
| `led[2]` | **U20** | 板载 | LVCMOS33 | 报警指示 |
| `led[3]` | **V20** | 板载 | LVCMOS33 | NTT 轮转确认 |
| `sys_clk` | **J19** | 外部晶振 | LVCMOS33 | 50MHz |

### 已验证的物理连接方案

**外置 CH340 模块接线：**
```
FPGA N19 (PMOD1 pin1) → CH340 RXD
FPGA T19 (PMOD1 pin2) → CH340 TXD
FPGA GND              → CH340 GND
CH340 VCC             → 3.3V
```

**串口参数：**
| 参数 | 值 |
|------|-----|
| 波特率 | 115200 |
| 数据位 | 8 |
| 停止位 | 1 |
| 校验 | 无 |
| 流控 | 无 |

### 验证输出

上电后约 0.5 秒，UART 输出：

```
FibeMate FPGA alive
NTT OK
```

- `FibeMate FPGA alive` — Boot FSM 发送的启动消息
- `NTT OK` — NTT 前向+逆向 round-trip 验证通过

---

## 已知问题

### 板载 CH340 静默 (COM8)

A7-Lite 板载 CH340G 在重新上电和 5 种波特率扫描下均无输出。

**当前结论：** 板载 CH340G 的 RXD 不连 N19。在没有 A7-Lite 原理图的情况下，无法确认板载 CH340 实际连接的 FPGA 引脚。

**解决方案：** 使用外置 CH340 模块连接 PMOD1 (N19/T19)，已验证稳定工作。

### 历史调试记录

2026-07-24 调试过程简要记录（详见 Git diff）：

1. **初始症状：** UART 完全静默，所有 COM 端口无输出
2. **第一次诊断：** Vivado pinout 报告显示 `uart_tx` 被自动分配到 U2/V2 (悬空焊盘)，源 XDC 中 `led[0]` 与 `led[1]` 引脚冲突导致 Vivado 静默丢弃 UART 约束
3. **修复尝试 v1：** 固定 `uart_tx → N19`、`uart_rx → T19` — 综合/实现通过，但仍无声（板载 CH340 不连 N19）
4. **最终方案：** 外置 CH340 模块接入 N19/T19 → COM6 输出正常 ✅

---

## 重建指南

### 环境要求

- Vivado 2021.1（或更高版本）
- A7-Lite 开发板（XC7A35T-2FGG484）
- USB-JTAG 下载器

### 一键重建

```powershell
# 设置环境
$env:PATH = "E:\Xilinx\Vivado\2021.1\bin;$env:PATH"

# 构建
cd E:\fpga\fibemate
vivado -mode batch -source scripts/build.tcl -nojournal -nolog

# 烧录
vivado -mode batch -source scripts/program.tcl -nojournal -nolog
```

### 引脚自定义

修改 `fpga/constraints/a7lite_35t.xdc` 中的 `PACKAGE_PIN` 约束后重建。

**注意：** `led` 和 `uart_*` 均有 FIXED 约束。添加新信号时务必检查 `pinout.txt` 避免引脚冲突。

---

## 资源占用

| 资源 | 用量 | 总量 | 百分比 |
|------|------|------|--------|
| Slice LUTs | ~1,800 | 20,800 | ~9% |
| Slice Registers | ~2,100 | 41,600 | ~5% |
| Block RAM | 1 | 50 | 2% |
| DSP48E1 | 1 | 90 | ~1% |
| I/O | 37 | 250 | ~15% |

---

## NTT 核心

### 参数

- 模数: q = 3329 (ML-KEM-768)
- 点数: N = 256
- 数据宽度: 13-bit
- 蝶形单元: 统一 (unified) 2 路并行

### 状态机

```
WAIT_POR → LOAD_RAMP → FWD_START → FWD_WAIT → FWD_DONE
                                                    ↓
                           INV_CHECK ← INV_WAIT ← INV_START
```

### 当前功能

- ✅ 前向 NTT (256 点)
- ✅ 逆向 NTT
- ✅ Round-trip 验证 (RAM 对比)
- ✅ Boot message via UART
- ❌ 待实现: ML-KEM 完整加速管线 (sampleNTT, CBD, compress)

---

## 版本历史

| 日期 | Bitstream | 状态 | 备注 |
|------|-----------|------|------|
| 2026-07-24 | v5_n19 | ✅ 已验证 | 引脚冲突修复，外置 CH340 UART 输出正常 |
| 2026-07-07 | v5_3 | ⚠️ UART 静默 | 引脚冲突，Vivado 自动分配到悬空引脚 |
| 2026-06-29 | v5 | ⚠️ 未调通 | 初始版，UART 未成功 |

---

## 文件结构

```
fpga/
├── constraints/
│   └── a7lite_35t.xdc          # 主 XDC 约束文件
├── rtl/
│   ├── fibemate_fpga_top.v     # FPGA 顶层模块
│   ├── led_blink.v             # LED 心跳模块
│   ├── uart_tx.v               # UART 发送器
│   ├── ntt/                    # NTT 核心模块
│   │   ├── ntt_core_pipe2_v5_2.v
│   │   ├── ntt_butterfly.v / ntt_butterfly_unif.v
│   │   ├── mod_mult.v / mod_add.v / mod_sub.v
│   │   ├── zeta_rom.v / zeta_rom_synth.v
│   │   └── ...
│   └── vwz/                    # VWZ 签名模块 (实验)
│       └── vwz_lambda_rom.v / vwz_solve_preimage.v
├── scripts/
│   ├── build.tcl               # 一键综合+实现+bitstream
│   └── program.tcl             # 一键 JTAG 烧录
└── releases/
    └── v4/
        └── fibemate_fpga_top.bit    # 已验证的 bitstream

docs/
└── hardware.md                 # 本文档
```

---

*最后更新: 2026-07-24 — FPGA UART 调试打通，NTT 硬件验证通过*
