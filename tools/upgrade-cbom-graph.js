#!/usr/bin/env node
// tools/upgrade-cbom-graph.js
// 自动升级 cbom-graph.html 的动画质量
// P0: autoRotate + 节点 lerp + 粒子流速 + 性能
// P1: 点击详情面板 + 节点风险比例映射
// P2: 边粗细映射引用强度

const fs = require('fs');
const path = require('path');
const REPO = require('child_process').execSync('git rev-parse --show-toplevel', {encoding:'utf8'}).trim();
const SRC = path.join(REPO, 'www', 'docs', 'cbom-graph.html');
let html = fs.readFileSync(SRC, 'utf8');

// ====== P0-1: autoRotate ======
html = html.replace(
  'controls.target.set(0, 0, 0);\n  controls.update();',
  'controls.target.set(0, 0, 0);\n  controls.autoRotate = true;\n  controls.autoRotateSpeed = 0.4;\n  controls.update();'
);

// ====== P0-2: 节点 lerp 平滑过渡 ======
// 在 animate 循环中, 把 position.copy 改为 lerp
html = html.replace(
  `      // Update mesh positions
      for (var i=0; i<nodeMeshes.length; i++) {
        if (!nodeMeshes[i].visible) continue;
        nodeMeshes[i].position.copy(graph.positions[i]);
      }`,
  `      // Smooth lerp to target
      var lerpFactor = 0.12;
      for (var i=0; i<nodeMeshes.length; i++) {
        if (!nodeMeshes[i].visible) continue;
        nodeMeshes[i].position.lerp(graph.positions[i], lerpFactor);
      }`
);

// ====== P0-3: 粒子流速 + 发光尾迹 ======
html = html.replace(
  `// Flow particle
      var pGeo = new THREE.SphereGeometry(0.06, 6, 4);
      var pMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(e.weight>1?'#66ccff':'#446688') });`,
  `// Flow particle with glow trail
      var pGeo = new THREE.SphereGeometry(0.07, 8, 6);
      var pMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(e.weight>1?'#88ddff':'#5588aa') });`
);

// Speed up particles (0.003 → 0.006)
html = html.replace(
  `p.userData.t = (p.userData.t + 0.003) % 1;`,
  `p.userData.t = (p.userData.t + 0.005) % 1;`
);

// ====== P0-4: 性能 — tube 重建从每 2 帧减到每 5 帧 ======
html = html.replace(
  `if (animate._frameCnt % 2 === 0) updateTubes();`,
  `if (animate._frameCnt % 5 === 0) updateTubes();`
);

// ====== P1-1: 节点风险比例映射 ======
// 在 createGraph 节点创建部分，加大小映射
html = html.replace(
  `// Nodes
    data.nodes.forEach(function(n, i) {
      var geo;
      if (n.risk === 'vulnerable') geo = ringGeo;
      else if (n.risk === 'warning') geo = starGeo;
      else geo = sphereGeo;

      var mat = new THREE.MeshStandardMaterial({`,
  `// Risk-scaled geometry
    var riskSizes = { safe: 0.28, warning: 0.35, vulnerable: 0.44 };

    // Nodes
    data.nodes.forEach(function(n, i) {
      var size = riskSizes[n.risk] || 0.30;
      var geo;
      if (n.risk === 'vulnerable') { geo = new THREE.TorusGeometry(size*1.15, 0.04, 8, 24); }
      else if (n.risk === 'warning') { geo = new THREE.IcosahedronGeometry(size*0.8, 0); }
      else { geo = new THREE.SphereGeometry(size, 24, 16); }

      var mat = new THREE.MeshStandardMaterial({`
);

// ====== P1-2: 点击节点弹出详情面板 ======
// 在 mousemove 监听器后面加 click 事件
html = html.replace(
  `window.addEventListener('resize', function() {`,
  `// Click to expand detail panel
  window.addEventListener('click', function(ev) {
    if (ev.target.tagName === 'BUTTON' || ev.target.closest('#detail-panel') || ev.target.closest('#ui')) return;
    mouse.x = (ev.clientX/W)*2-1;
    mouse.y = -(ev.clientY/H)*2+1;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(nodeMeshes);
    if (hits.length > 0) {
      showDetailPanel(hits[0].object.userData.data);
    } else {
      hideDetailPanel();
    }
  });

  window.addEventListener('resize', function() {`
);

// Add detail panel HTML (before tooltip)
html = html.replace(
  '<div id="tooltip"></div>',
  `<!-- Detail Panel -->
<div id="detail-panel" style="
  display:none; position:fixed; z-index:30; top:50%; left:50%; transform:translate(-50%,-50%);
  background:rgba(15,15,26,0.96); border:1px solid var(--border); border-radius:14px;
  padding:20px 24px; max-width:340px; min-width:280px;
  box-shadow:0 8px 40px rgba(0,0,0,0.7);
">
  <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:12px">
    <h3 id="dp-name" style="font-size:16px; font-weight:700; margin:0">—</h3>
    <button onclick="hideDetailPanel()" style="background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:18px; padding:0 4px; line-height:1">&times;</button>
  </div>
  <div style="display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:11px">
    <span style="color:var(--text-dim)">类别</span><strong id="dp-category">—</strong>
    <span style="color:var(--text-dim)">风险等级</span><strong id="dp-risk">—</strong>
    <span style="color:var(--text-dim)">标准</span><strong id="dp-standard">—</strong>
    <span style="color:var(--text-dim)">量子安全</span><strong id="dp-qsec">—</strong>
    <span style="color:var(--text-dim)">引用文件</span><strong id="dp-files">—</strong>
    <span style="color:var(--text-dim)">位置</span><strong id="dp-location">—</strong>
  </div>
  <div style="border-top:1px solid var(--border); margin:12px 0"></div>
  <div id="dp-deps" style="font-size:10px; color:var(--text-dim)">
    <strong style="color:var(--accent)">依赖关系:</strong>
    <div id="dp-dep-list" style="margin-top:4px">加载中…</div>
  </div>
  <div style="margin-top:14px; text-align:right">
    <a id="dp-link" href="#" style="font-size:10px; color:var(--accent); text-decoration:none">→ CBOM 详情 &rarr;</a>
  </div>
</div>

<div id="tooltip"></div>`
);

// Add JS functions for detail panel
html = html.replace(
  'window.resetCamera = function() {',
  `// Detail panel
  window.showDetailPanel = function(n) {
    var riskColor = n.risk === 'vulnerable' ? 'var(--red)' : n.risk === 'warning' ? 'var(--yellow)' : 'var(--green)';
    document.getElementById('dp-name').textContent = n.name;
    document.getElementById('dp-name').style.color = n.color;
    document.getElementById('dp-category').textContent = n.category;
    document.getElementById('dp-risk').innerHTML = '<span style="color:'+riskColor+'">'+n.risk+'</span>';
    document.getElementById('dp-standard').textContent = n.standard || '—';
    document.getElementById('dp-qsec').textContent = n.quantumSecurity ? n.quantumSecurity+' bits' : '—';
    document.getElementById('dp-files').textContent = n.fileCount;
    document.getElementById('dp-location').textContent = n.location || '—';

    // Find dependencies
    var deps = [];
    allEdges.filter(function(e) { return e.source === n.id; }).forEach(function(e) {
      var target = allNodes.find(function(nn) { return nn.id === e.target; });
      if (target) deps.push('<span style="color:'+target.color+'">'+target.name+'</span>');
    });
    var revDeps = [];
    allEdges.filter(function(e) { return e.target === n.id; }).forEach(function(e) {
      var source = allNodes.find(function(nn) { return nn.id === e.source; });
      if (source) revDeps.push('<span style="color:'+source.color+'">'+source.name+'</span>');
    });
    var lines = [];
    if (deps.length > 0) lines.push('依赖: '+deps.join(', '));
    if (revDeps.length > 0) lines.push('被引用: '+revDeps.join(', '));
    document.getElementById('dp-dep-list').innerHTML = lines.length>0 ? lines.join('<br>') : '(独立节点)';

    document.getElementById('dp-link').href = '/docs/cbom-viewer.html';
    document.getElementById('detail-panel').style.display = 'block';
    hideTooltip();
  };

  window.hideDetailPanel = function() {
    document.getElementById('detail-panel').style.display = 'none';
  };

  window.resetCamera = function() {`
);

// ====== P2: 边粗细映射权重 ======
html = html.replace(
  `var tubeGeo = new THREE.TubeGeometry(curve, 16, 0.03, 6, false);`,
  `var edgeThick = Math.min(0.08, 0.02 + (e.weight||0.5)*0.05);
      var tubeGeo = new THREE.TubeGeometry(curve, 16, edgeThick, 6, false);`
);

// ====== Write updated file ======
fs.writeFileSync(SRC, html, 'utf8');
console.log('✅ cbom-graph.html 动画升级完成');
console.log('   P0: autoRotate + 节点 lerp + 粒子加速 + 性能优化');
console.log('   P1: 点击详情面板 + 节点风险比例映射');
console.log('   P2: 边粗细映射权重');
console.log('   文件大小:', (Buffer.byteLength(html, 'utf8')/1024).toFixed(1), 'KB');
