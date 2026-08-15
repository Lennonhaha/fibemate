# 架构可视化节点质感升级 — 2026-08-14

## 目标
用户反馈两个架构 3D 页（木火通明 / 三层护盾）的节点小圆球质感不足、色彩对比简单、背景星空偏单薄。要求：节点加金属/水晶/玻璃等元素质感，背景参考项目既有星空风格。

## 改动内容

### 1. 节点材质（MeshStandardMaterial → MeshPhysicalMaterial，按层分本体）
- **理论层**（金/内层）：能量水晶 — 高透射 `transmission:0.55` + 厚 `thickness:1.3` + `clearcoat:0.9`，`emissive` 发光，`envMapIntensity:1.5`
- **工程层**（青绿/紫）：抛光金属 — `metalness:0.95` + `roughness:0.16` + `clearcoat:0.55`
- **表现层**（橙/蓝）：玻璃等离子 — `transmission:0.3` + `clearcoat:1.0` + 高 `emissive`
- **规划中节点**：雾化玻璃 — 半透 `opacity:0.78` + 提亮 `emissiveIntensity:0.7`（解决初版发黑问题）

### 2. 程序化环境贴图（PMREMGenerator）
金属/水晶反射必需。用 5 个彩色发光球（白 + 层主题色）生成 `scene.environment`，否则金属材质在纯黑背景下发黑。

### 3. 星空背景升级
- **三层彩色星点**：700/500/350 颗，白/蓝/金/青（护盾版加紫），AdditiveBlending 叠加
- **四块星云**：Canvas 径向渐变 → Sprite，金/青/橙/蓝（护盾版紫/蓝/金/青），opacity 0.32~0.44，呼应各层主题色

### 4. 节点光晕外壳
每个节点加 `SphereGeometry(size*1.4)` 的 BackSide 光晕（done 0.15 / plan 0.06 opacity），增强体积感。

## 验证
- Playwright + Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）无头实测：两页 WebGL 正常、零 JS 报错
- 本地静态服务器 root 必须是 `www/`（nginx 生产 root 一致），非工作区根，否则 404
- 视觉分析确认玻璃/水晶质感到位；初版问题（规划节点发黑、星云不明显）经两轮精修解决

## 部署
- commit `9a9777d13`，GitHub + 服务器三端一致
- 线上验证 200：muhuo 19694B / shield 19606B

## 关键技术要点
- `MeshPhysicalMaterial` 的 `transmission`/`thickness`/`ior` 是玻璃质感核心；`metalness:0.95 + roughness:0.16` 是金属核心
- 金属材质必须有 envMap，否则发黑 → PMREMGenerator.fromScene 程序化生成
- 星空：`PointsMaterial` 加 `vertexColors:true + AdditiveBlending` 才有彩色光点；星云用 Canvas 径向渐变 + Sprite
- 待办：是否加首页入口卡片、命名（木火通明/三层护盾）定稿，仍未拍板
