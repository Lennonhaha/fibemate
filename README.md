# experimental/vwz-lg

VWZ & LookingGlass 实验研究线（默认关闭，无安全保证）。

## 内容

- **VWZ 签名**：`rust/vwz-sign-wasm/` + `scripts/vwz-148-test.js`
- **LookingGlass v2.3**：`www/crypto/lgv2/`（lgv2_3.js + wasm + d.ts + 可视化×7）
- **FPGA VWZ RTL**：`fpga/rtl/vwz/`（lambda ROM + 测试台）
- **安全评估**：`security-assessment/`（attack/ evidence/ fix/）
- **研究文档**：`docs/vwz-*.md` + `research/lgv2/`

## 运行测试

```bash
node scripts/vwz-148-test.js
```

## ⚠️ 声明

此分支为实验性研究代码，未经安全审计，不应用于生产环境。
