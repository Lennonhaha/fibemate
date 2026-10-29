# verifact 报告查看器

这个页面只做一件事：把 `verifact verify --format json` 的输出文件渲染成可读的表格。

**它不执行任何安全判定。** 页面上的颜色只映射报告里 `status` 字段的字符串；未知状态显示为灰色 `st-unknown` 并原样打印，不会落回绿色。

## 为什么单独做一个只读页面

`verifact` 的结论来自 CLI 的判定链（产物解析 → 声明绑定 → 门禁）。任何在前端重算一遍的做法，都会制造第二个事实来源：页面和 CLI 一旦分叉，页面就会变成"看起来对"的假绿。所以这里刻意**不做判定**，只做渲染。

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 页面骨架、横幅、上传区、样式 |
| `demo.js` | 纯渲染函数（UMD，Node 可直接 require 做测试） |
| `sample-real.json` | 真实运行抽样：363 份文档 / 2301 条声明 / drift 0 / ref-missing 0，表格按状态各抽 6 条，计数为全量值 |
| `sample-drift.json` | **人工构造**的红色路径示例，页面会强制显示 SYNTHETIC 标记 |

## 契约测试

测试在工具仓：`Lennonhaha/fibemate-tools` → `scripts/test-verifact-demo.js`。

```bash
node scripts/test-verifact-demo.js --dir ../fibemate/www/tools/verifact-demo --self-test
```

14 项检查 + 8 个变异。重点几项：

- 每一行表格必须与 fixture 的 `id / status / file:line` 逐条对应
- `counts.drift > 0` ⇔ 出现红色横幅，且横幅必须写出条数
- 未知 status 必须渲染成 `st-unknown`，且**不得**出现 `st-verified`
- `meta.synthetic` 为真 ⇔ 出现 SYNTHETIC 横幅（真实样本不得带这个标记）
- 渲染函数必须是纯函数（不修改输入对象）
- HTML 必须转义（注入 `<script>` 不得原样输出）

变异测试会故意：删掉横幅、翻转 status、把 drift 计数清零、把未知状态映射成绿、关掉转义——每一项都必须让对应检查变红，否则测试以 exit 3 失败。

## 重新生成 sample-real.json

```bash
# 在 fibemate-tools/verifact 下
node bin/verifact.js verify --format json --out report.json
# 然后按状态各取若干条，保留全量 counts，写入 subset.shownClaims / ofClaims
```

`sample-real.json` 的 `counts` 是全量运行值，`subset` 块说明表格只显示了其中多少条——页面会把这个差异明确写出来，而不是让读者以为全量都在表里。
