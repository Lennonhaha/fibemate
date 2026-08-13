# PQC 可视化设计系统 — 设计文档

**类型**：前端设计规范 + 组件库蓝图
**状态**：设计阶段
**优先级**：⭐⭐⭐⭐
**预计实现耗时**：持续（规范可即时生效，组件库需 8/31 后）

---

## 1. 产品定位

FIBEMATE 已有 29 个可视化页面，但各自独立开发，缺乏统一的设计语言。本文档定义一套可复用的可视化组件库和设计规范，让后续新增页面保持一致性，降低维护成本。

---

## 2. 设计原则

| 原则 | 说明 |
|------|------|
| **零外部 CDN** | 所有资源自托管，CSP `default-src 'self'` 不破 |
| **Canvas 2D 优先，Three.js 其次** | 2D 图表用 Canvas 直绘，3D 场景用 Three.js（自托管） |
| **暗色主题** | 统一 `--bg: #08080d; --card: #0f0f18; --accent: #10b981` |
| **纯静态** | 无后端，无构建工具，单个 HTML 文件即页面 |
| **自描术数据** | 每个页面内嵌 Schema 数据，不依赖外部 API |

---

## 3. 色彩系统

| 变量 | 值 | 用途 |
|------|-----|------|
| `--bg` | `#08080d` | 页面背景 |
| `--card` | `#0f0f18` | 卡片/面板背景 |
| `--surf` | `#141424` | 按钮/输入框背景 |
| `--text` | `#d0d0d0` | 正文 |
| `--muted` | `rgba(255,255,255,.35)` | 次要文本 |
| `--accent` | `#10b981` | 主强调色（VWZ/PQC 安全） |
| `--warn` | `#f59e0b` | 警告/实验性 |
| `--red` | `#ef4444` | 错误/高风险 |
| `--violet` | `#8b5cf6` | FALCON/格方案 |
| `--blue` | `#3b82f6` | ECDSA/经典方案 |
| `--cyan` | `#06b6d4` | SLH-DSA |

---

## 4. 可复用组件规范

### 4.1 TopBar（工具栏）

```
┌────────────────────────────────────────────────────┐
│ 🏷️ 页面标题  │  [按钮] [▼下拉] │  [滑块] │ [链接→] │
└────────────────────────────────────────────────────┘
```
- 统一 `padding: 10px 16px; background: var(--card); border-bottom: 1px solid rgba(255,255,255,.06);`
- 按钮：`background: var(--surf)` / 激活态：`var(--accent)`

### 4.2 View Switcher（视图切换）

适用于多视图页面（柱状/雷达/批处理/数据表）。当前 `performance.html` 已实现，提取为模板。

### 4.3 k-Value Slider（参数滑块）

适用于参数空间探索（VWZ k 值、ML-KEM 安全等级、NTT 维度）。当前 `performance.html` 已实现。

### 4.4 Legend Box（图例面板）

```
┌──────────────────┐
│ ■ 方案A  1.2k/s  │
│ ■ 方案B  800/s   │
└──────────────────┘
```
- `position: absolute; right: 12px; top: 8px;`
- `background: rgba(15,15,24,.92); border-radius: 8px; padding: 8px 12px;`

### 4.5 Round Rect（圆角矩形辅助函数）

```js
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
```

### 4.6 Chart Grid Helper（网格线 + Y 轴标注）

```js
function drawGrid(ctx, mg, w, h, maxVal, yTicks=6) { ... }
```

### 4.7 Three.js Bootstrap（3D 场景脚手架）

```html
<script type="importmap">
{
  "imports": {
    "three": "./lib/three.module.js",
    "three/addons/": "./lib/"
  }
}
</script>
```

---

## 5. 页面模板

### 5.1 2D 图表页模板

```html
<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><!-- 标题 --></title>
<style>/* 设计系统 CSS */</style></head><body>
<div id="topBar"><!-- 工具栏 --></div>
<div id="main"><div class="panel"><canvas id="chart"></canvas></div></div>
<div id="bottom"><!-- 状态栏 --></div>
<script>
// Canvas 2D 绘制逻辑
function redraw() { ... }
window.addEventListener('resize', redraw);
redraw();
</script></body></html>
```

### 5.2 3D 场景页模板

```html
<script type="importmap">...</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
// Three.js 场景逻辑
</script>
```

---

## 6. 部署规范

| 规则 | 说明 |
|------|------|
| 路径 | `/opt/fibemate-repo/www/viz/<page>.html` |
| Symlink | `/var/www/html/viz/<page>.html` → repo 路径 |
| Nginx | 独立 location 块，`try_files $uri =404`，CSP 扩展 |
| Three.js libs | 自托管在 `lib/three.module.js` + `lib/OrbitControls.js` |
| 首页卡片 | 插入 `#visualizations` 区域，计数 +1 |

---

## 7. 实现细节（伪代码）

### 7.1 组件工厂 `lib/viz-factory.js`

```js
// 统一创建可视化页面的工厂函数
function createVizPage(opts) {
  const {
    title,           // string: 页面标题
    variant,         // '2d' | '3d'
    controls = [],   // [{ type:'button'|'slider'|'switch', id, label, onChange }]
    panels  = [],    // [{ id, width, render(ctx, state) }]
    data,            // 内嵌数据对象
    onResize,        // (w, h) => void
  } = opts;

  // 注入公共 CSS
  const style = vizStyles();  // 返回 <style> 内容（色彩系统、布局、组件）

  // 构建 Toolbar
  const toolbar = buildToolbar(controls);

  // 构建面板
  const main = panels.map(p =>
    p.id === '3d'
      ? `<canvas id="${p.id}"></canvas>`  // Three.js 接管
      : `<div class="panel"><canvas id="${p.id}"></canvas></div>`
  ).join('\n');

  // 注入标准化 footer
  const footer = standardFooter({ variant:'standard' });

  return `<html>...<body>${toolbar}${main}${footer}<script>...<\/script></body></html>`;
}
```

### 7.2 设计系统 CSS 变量（标准化注入）

```css
/* 每个页面 <head> 中注入的公共样式 */
:root {
  --bg:     #08080d;
  --card:   #0f0f18;
  --surf:   #141424;
  --text:   #d0d0d0;
  --muted:  rgba(255,255,255,.35);
  --accent: #10b981;
  --warn:   #f59e0b;
  --red:    #ef4444;
  --violet: #8b5cf6;
  --blue:   #3b82f6;
  --cyan:   #06b6d4;
}

/* toolbar */
#toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: var(--card);
  border-bottom: 1px solid rgba(255,255,255,.06);
  font-size: 13px; color: var(--text);
}
#toolbar button {
  background: var(--surf); color: var(--text); border: none;
  padding: 6px 14px; border-radius: 6px; cursor: pointer;
  font-size: 12px; transition: background .15s;
}
#toolbar button.active { background: var(--accent); color: #000; }
#toolbar button:hover { background: rgba(255,255,255,.08); }

/* legend */
.legend {
  position: absolute; right: 12px; top: 50px;
  background: rgba(15,15,24,.92); border-radius: 8px;
  padding: 8px 12px; font-size: 11px; color: var(--muted);
}
```

### 7.3 Canvas 2D 辅助库 `lib/canvas-utils.js`

```js
// roundRect: 圆角矩形（所有 2D 图表的基底）
// drawGrid: 网格线 + Y 轴标注（水平柱状图/散点图）
// colorScale: 数值→颜色插值

function drawGrid(ctx, margin, w, h, maxVal, yTicks = 6) {
  const step = maxVal / yTicks;
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i++) {
    const y = margin.top + (h - margin.top - margin.bottom) * (1 - i / yTicks);
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(i * step), margin.left - 6, y + 4);
  }
}

function colorScale(value, min, max) {
  const t = (value - min) / (max - min);
  // 蓝(0) → 绿(.33) → 黄(.66) → 红(1)
  const r = Math.min(255, Math.floor(t < .5 ? t * 510 : 255));
  const g = Math.min(255, Math.floor(t < .5 ? 255 : (1 - t) * 510));
  const b = Math.min(255, Math.floor((1 - t) * 255));
  return `rgb(${r},${g},${b})`;
}
```

### 7.4 Three.js 脚手架的标准化接口

```js
// 每个 3D 页面统一调用
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

function init3DScene(canvasId, opts = {}) {
  const canvas = document.getElementById(canvasId);
  const { cameraPos = [0, 100, 300], bg = 0x08080d, dpr = Math.min(window.devicePixelRatio, 2) } = opts;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(bg);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 1, 2000);
  camera.position.set(...cameraPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);

  // Resize observer
  new ResizeObserver(() => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }).observe(canvas);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, controls, start: animate };
}
```

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
