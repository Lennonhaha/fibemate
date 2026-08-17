# LG v2.3 diffuse 3D 热力图可视化挂载官网 — 交付记录

日期：2026-08-17
分支：main（官网生产线）
提交：`e3ef125e2`（7 文件，+55693/-1）
三端：本地 == GitHub == 服务器（`e3ef125e`）

## 背景

用户要求把 monkeycode-ai 预览环境（`https://8000-...monkeycode-ai.online/crypto/lgv2/lgv3_heatmap3d.html`）的「LG v2.3 diffuse 3D 扩散颗粒云」挂到官网可视化页。

用户三问拍板：
1. 挂到 **viz-index 可视化索引页**
2. 研究线 v2.3 WASM **进 main**（标注默认关闭）
3. 加**诚实声明**（混淆引擎不提供密码学安全保证）

## 交付物

### 1. 新页面目录 `www/docs/lgv3-diffuse-heatmap/`
自包含 5 文件：

| 文件 | 大小 | 说明 |
|---|---|---|
| `index.html` | 21.6KB | 主页面（内联 JS + 诚实声明） |
| `lgv2_3.js` | 24KB | wasm-bindgen 绑定，导出 `lgv3_diffuse`/`lgv3_diffuse_inverse` |
| `lgv2_3_bg.wasm` | 61.6KB | **研究线 v2.3 diffuse 混淆 WASM**（比官网旧 `lookingglass_v2_bg.wasm` 25KB 新） |
| `vendor/three/three.module.js` | 1.27MB | three.js **r160** |
| `vendor/three/examples/jsm/controls/OrbitControls.js` | 30KB | OrbitControls r160 |

### 2. viz-index.html 加卡片
- `analysis` 分类新增「LG v2.3 扩散颗粒云」卡片，href 指向 `lgv3-diffuse-heatmap/index.html`
- 「可视化页面」计数 14 → 15

### 3. 诚实声明（index.html 顶部）
> ⚠️ 本页可视化 lgv3_diffuse 的运行态扩散行为。LookingGlass 是混淆引擎，不提供密码学安全保证，不增强 LWE 格硬度，默认关闭、永不进入生产加密路径。仅作研究展示。

## 关键技术决策

1. **three.js 版本不能复用**：monkeycode 用 r160，官网现有 r157（`www/vwz-tensor/lib/`）。r160 的 OrbitControls 路径/API 与 r157 不同，强行复用会报错。因此完整自包含 r160，不依赖官网 r157，避免版本冲突。
2. **wasm 用 `git add -f` 强制跟踪**：`.gitignore:105` 有 `*.wasm` 全局忽略。官网已有两条反忽略规则（`!www/crypto/lgv2/*.wasm` 等）但位置在 `*.wasm` **之前**，实际不生效（gitignore 的 `!` 必须出现在忽略规则之后）。历史做法就是 `git add -f`，本次沿用，并追加一条 `!www/docs/lgv3-diffuse-heatmap/*.wasm` 反忽略规则作文档记录（与已有两条同类规则保持一致）。
3. **viz-index.html 编码坑**：`git show > 文件` 重定向会因 PowerShell UTF-16 写入产生 387 个 U+FFFD。改用 `git cat-file blob` 拿原始字节（0 U+FFFD、7805B、中文完好）写入工作区，避免损坏。

## 验证

- 页面 JS 语法 OK（剥离 import 后 `new Function` 通过）
- 资源引用路径全部存在（✅）
- U+FFFD = 0（中文完好）
- viz-index JS 语法 OK、16 张卡片
- 线上 4 项全 200：
  - `https://fibemate.net/docs/lgv3-diffuse-heatmap/index.html` → 200 (22190B)
  - `.../lgv2_3_bg.wasm` → 200 (61647B)
  - `.../lgv2_3.js` → 200 (23970B)
  - `https://fibemate.net/docs/viz-index.html` → 200，含「LG v2.3 扩散颗粒云」卡片

## 注意

- 这是**研究线产物进 main**，但页面诚实声明已明确「默认关闭、不提供密码学安全保证」，符合合规要求。
- subtitle 里「26 个交互式 3D 可视化」是历史遗留打架数字（与 stats「可视化页面 15」口径不一致），本次**未动**，属既有「可视化数量口径待统一」待办，不在本次范围。

---

## ⚠️ 后续收敛（2026-08-17 14:20）

本页面 `www/docs/lgv3-diffuse-heatmap/` 已于同日被收敛移除。

**原因**：另一位协作方 monkeycode-ai 在 `5cdaf2270` 推入了更完整的 6 个 LG 可视化 demo（`www/crypto/lgv2/`：heatmap 2D/3D、path_profile 2D/3D、defense_demo 2D/3D），与本页面功能重叠。经用户拍板：

1. **移除**本单页面目录 `www/docs/lgv3-diffuse-heatmap/`（被 monkeycode 的 3D 颗粒云覆盖）
2. **收敛资产**：`www/crypto/lgv2/` 下的 `lgv2_3.js`/`lgv2_3_bg.wasm`/`three.module.js` 作为唯一官方资产（blob hash 与本目录完全一致，逐字节相同）
3. **清理引用**：viz-index.html 删本页卡片（22→21 卡）、.gitignore 删本目录反忽略规则

**最终状态**：官网 LG 可视化统一走 `www/crypto/lgv2/`，viz-index 21 张卡，无冗余资产。
