/**
 * FIBEMATE 可视化设计系统 — Canvas 2D 辅助库
 * 零外部依赖，纯 Canvas 2D，可被所有 2D 可视化页面复用
 * 设计文档: docs/product-designs/03-viz-design-system.md
 */
(function (global) {
  'use strict';

  // 圆角矩形路径
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 网格线 + Y 轴标注
  function drawGrid(ctx, margin, w, h, maxVal, yTicks) {
    yTicks = yTicks || 6;
    const step = maxVal / yTicks;
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= yTicks; i++) {
      const y = margin.top + (h - margin.top - margin.bottom) * (1 - i / yTicks);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(w - margin.right, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(i * step * 100) / 100), margin.left - 6, y);
    }
  }

  // 数值 → 颜色插值（蓝→绿→黄→红）
  function colorScale(value, min, max) {
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const r = Math.min(255, Math.floor(t < 0.5 ? t * 510 : 255));
    const g = Math.min(255, Math.floor(t < 0.5 ? 255 : (1 - t) * 510));
    const b = Math.min(255, Math.floor((1 - t) * 255));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // 安全等级 → 标准颜色
  const LEVEL_COLORS = {
    experimental: '#f59e0b', // 实验性（VWZ/LG）
    nist1: '#10b981',        // NIST 安全等级 1
    nist3: '#10b981',        // NIST 安全等级 3
    nist5: '#06b6d4',        // NIST 安全等级 5
    classic: '#3b82f6',      // 经典算法（ECDSA/RSA）
  };

  // 高 DPI canvas 适配
  function setupCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  global.FIBEMATE = global.FIBEMATE || {};
  global.FIBEMATE.canvas = {
    roundRect: roundRect,
    drawGrid: drawGrid,
    colorScale: colorScale,
    LEVEL_COLORS: LEVEL_COLORS,
    setupCanvas: setupCanvas,
  };
})(typeof window !== 'undefined' ? window : globalThis);
