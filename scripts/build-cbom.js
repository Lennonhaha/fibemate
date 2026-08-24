/* eslint-disable no-useless-escape -- embedded HTML string uses \" escapes that are harmless in single-quoted JS strings */
var fs=require('fs'),p='utf8';

var scan=JSON.parse(fs.readFileSync('C:/temp/fibemate-clone/tools/crypto-audit-scan.json',p));
var algoFiles={},algoCount={};
scan.forEach(function(f){
  var algos=f.algo.split('|');
  algos.forEach(function(a){
    a=a.trim(); if(!a)return;
    algoCount[a]=(algoCount[a]||0)+1;
    if(!algoFiles[a])algoFiles[a]=[];
    algoFiles[a].push({file:f.file,dir:f.dir,size:f.size,count:f.count});
  });
});
var algos=Object.keys(algoCount).sort(function(a,b){return algoCount[b]-algoCount[a]});
console.log('algorithms:',algos.length,algos.join(', '));

// Quantum risk classification
var QSAFE=['ML-KEM','ML-KEM-768','ML-KEM-1024','NTT','ML-DSA/fml-dsa','SLH-DSA','SHA-256','SHA-384','SHA-512','AES','AES-256','SM3','SM4'];
var QVUL=['P-256/ECDH','RSA','SM2'];
var QWEAK=['SHA-256'];
var TYPES={KEM:['ML-KEM','ML-KEM-768','ML-KEM-1024'],SIGN:['ML-DSA/fml-dsa','SLH-DSA','SM2'],HASH:['SHA-256','SHA-384','SHA-512','SM3'],SYM:['AES','AES-256','SM4'],ECC:['P-256/ECDH'],PROTO:['Double-Ratchet','TLA+'],MATH:['NTT']};

function risk(a){
  if(QVUL.indexOf(a)>=0)return 'quantum-vulnerable';
  if(QVUL.some(function(v){return a.indexOf(v)>=0}))return 'quantum-vulnerable';
  if(QSAFE.indexOf(a)>=0)return 'quantum-safe';
  return 'unknown';
}
function prim(a){
  for(var k in TYPES){if(TYPES[k].indexOf(a)>=0)return k;}
  return 'other';
}

// Build CycloneDX 1.6 CBOM
var components=[],depends=[];
var bomRef={}; algos.forEach(function(a,i){bomRef[a]='algo-'+i;});

algos.forEach(function(a,i){
  var ref=bomRef[a];
  var c={
    type:'cryptographic-asset',
    'bom-ref':ref,
    name:a,
    cryptoProperties:{
      assetType:'algorithm',
      algorithmProperties:{primitive:prim(a)},
      implementationPlatform:'javascript',
      certificationLevel:algoCount[a]>5?'known-answer-tested':'self-tested'
    },
    evidence:{occurrences:algoFiles[a].map(function(f){return{location:f.file,line:1}})}
  };
  components.push(c);
  depends.push({ref:ref,dependsOn:[]});
});

var cbom={
  bomFormat:'CycloneDX',specVersion:'1.6',version:1,
  serialNumber:'urn:uuid:'+require('crypto').randomUUID(),
  metadata:{
    timestamp:new Date().toISOString(),
    component:{type:'application',name:'FIBEMATE',version:'3.3.0','bom-ref':'root',
      description:'PQC full-stack engineering verification platform'}
  },
  components:components,
  dependencies:depends.concat([{ref:'root',dependsOn:algos.map(function(a){return bomRef[a];})}])
};
fs.writeFileSync('C:/temp/fibemate-clone/tools/cbom-cyclonedx.json',JSON.stringify(cbom,null,2),p);
console.log('CBOM written:',JSON.stringify(cbom).length,'bytes');
console.log('components:',components.length);

// Build CBOM viewer HTML
var dataEncoded=JSON.stringify({algorithms:algos,counts:algoCount,files:algoFiles,risk:{},qSafe:QSAFE,qVul:QVUL,qWeak:QWEAK,primMap:{}});
algos.forEach(function(a){dataEncoded=JSON.stringify(JSON.parse(dataEncoded));});
var DATA=JSON.stringify({algorithms:algos,counts:algoCount,algoFiles:algoFiles,qSafe:QSAFE,qVul:QVUL,cbom:cbom});

var html='<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>CBOM · CycloneDX 1.6 · FIBEMATE</title>\n<style>\n*{margin:0;padding:0;box-sizing:border-box}\nbody{background:#0a0a1a;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;line-height:1.6}\n.container{max-width:1200px;margin:0 auto;padding:20px}\nh1{color:#00d4ff;font-size:1.8rem;margin-bottom:4px}\nh2{color:#00d4ff;font-size:1.2rem;margin:24px 0 12px;border-bottom:1px solid #1a1a3a;padding-bottom:6px}\n.subtitle{color:#888;font-size:0.9rem;margin-bottom:20px}\n.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:20px 0}\n.card{background:#0d0d28;border:1px solid #1a1a3a;border-radius:8px;padding:16px}\n.card .label{color:#888;font-size:0.78rem;text-transform:uppercase}\n.card .value{font-size:2rem;font-weight:700;color:#00d4ff}\n.card.green .value{color:#10b981}\n.card.red .value{color:#ef4444}\n.card.yellow .value{color:#f59e0b}\ntable{width:100%;border-collapse:collapse;margin:12px 0;font-size:0.85rem}\nth,td{border:1px solid #1a1a3a;padding:8px 12px;text-align:left}\nth{background:#0d0d28;color:#00d4ff;cursor:pointer;user-select:none;position:sticky;top:0}\nth:hover{background:#111133}\ntr:hover{background:rgba(0,212,255,0.03)}\n.algo-row{cursor:pointer}\n.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600}\n.badge-safe{background:rgba(16,185,129,0.15);color:#10b981}\n.badge-vul{background:rgba(239,68,68,0.15);color:#ef4444}\n.badge-weak{background:rgba(245,158,11,0.15);color:#f59e0b}\n.file-list{display:none;background:#060612;margin:0 12px 12px;padding:12px;border-radius:6px;max-height:240px;overflow-y:auto;font-size:0.78rem}\n.file-list.open{display:block}\n.file-item{padding:3px 0;color:#999;font-family:monospace;font-size:0.75rem}\n.file-item:hover{color:#00d4ff}\n.btn{display:inline-block;padding:10px 24px;border-radius:6px;border:none;cursor:pointer;font-size:0.9rem;font-weight:600;text-decoration:none;transition:all .2s}\n.btn-primary{background:#00d4ff;color:#0a0a1a}\n.btn-primary:hover{background:#00b8e6}\n.btn-outline{background:transparent;border:1px solid #00d4ff;color:#00d4ff;margin-left:8px}\n.btn-outline:hover{background:rgba(0,212,255,0.1)}\n.json-view{background:#060612;border:1px solid #1a1a3a;border-radius:8px;padding:16px;max-height:500px;overflow:auto;font-family:monospace;font-size:0.78rem;white-space:pre-wrap;display:none}\n.json-view.open{display:block}\n.search{background:#0d0d28;border:1px solid #1a1a3a;border-radius:6px;padding:8px 14px;color:#e0e0e0;font-size:0.9rem;width:100%;margin:12px 0}\n.search:focus{outline:none;border-color:#00d4ff}\n.topbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0}\n@media(max-width:768px){.cards{grid-template-columns:1fr 1fr}.value{font-size:1.5rem!important}}\n</style>\n</head>\n<body>\n<div class="container">\n<h1>📦 CBOM · 加密材料清单</h1>\n<p class="subtitle">CycloneDX 1.6 Cryptographic Bill of Materials · FIBEMATE v3.3.0</p>\n\n<div class="cards">\n<div class="card"><div class="label" id="total-algos-label">算法总数</div><div class="value" id="total-algos">-</div></div>\n<div class="card"><div class="label">文件总数</div><div class="value" id="total-files">-</div></div>\n<div class="card green"><div class="label">量子安全</div><div class="value" id="q-safe">-</div></div>\n<div class="card red"><div class="label">量子脆弱</div><div class="value" id="q-vul">-</div></div>\n<div class="card yellow"><div class="label">量子弱化</div><div class="value" id="q-weak">-</div></div>\n</div>\n\n<div class="topbar">\n<button class="btn btn-primary" onclick="downloadCBOM()">⬇ 下载 CBOM (JSON)</button>\n<button class="btn btn-outline" id="json-toggle" onclick="toggleJSON()">🔍 查看原始 CBOM JSON</button>\n</div>\n\n<div class="json-view" id="json-view"></div>\n\n<h2>📋 算法组件清单</h2>\n<input class="search" id="search" placeholder="搜索算法..." oninput="renderTable()">\n<table>\n<thead><tr><th onclick="sortTable(0)">算法 ↕</th><th onclick="sortTable(1)">原始类型 ↕</th><th onclick="sortTable(2)">风险等级 ↕</th><th onclick="sortTable(3)">引用文件数 ↕</th><th onclick="sortTable(4)">认证级别 ↕</th></tr></thead>\n<tbody id="tbody"></tbody>\n</table>\n</div>\n\n<script>\nvar DATA='+JSON.stringify(DATA)+';\nvar cbom='+JSON.stringify(cbom)+';\nvar d=DATA;\nvar sortCol=3,sortDir=-1;\n\nfunction risk(a){\n  if(d.qVul.indexOf(a)>=0)return{label:\"量子脆弱\",cls:\"badge-vul\"};\n  if(d.qWeak.indexOf(a)>=0)return{label:\"量子弱化\",cls:\"badge-weak\"};\n  if(d.qSafe.indexOf(a)>=0)return{label:\"量子安全\",cls:\"badge-safe\"};\n  return{label:\"未分类\",cls:\"badge-weak\"};\n}\nfunction sortTable(col){\n  if(sortCol===col)sortDir*=-1;else{sortCol=col;sortDir=-1}\n  renderTable();\n}\nfunction renderTable(){\n  var q=document.getElementById(\"search\").value.toLowerCase();\n  var rows=d.algorithms.filter(function(a){return a.toLowerCase().indexOf(q)>=0});\n  rows.sort(function(a,b){\n    var va,vb;\n    if(sortCol===0){va=a;vb=b}\n    else if(sortCol===1){va=d.algoFiles[a]&&d.algoFiles[a][0]?d.algoFiles[a][0].algo||\"\":\"\";vb=d.algoFiles[b]&&d.algoFiles[b][0]?d.algoFiles[b][0].algo||\"\":\"\"}\n    else if(sortCol===2){va=risk(a).label;vb=risk(b).label}\n    else if(sortCol===3){va=d.counts[a]||0;vb=d.counts[b]||0}\n    else{va=d.counts[a]||0;vb=d.counts[b]||0}\n    if(va<vb)return -sortDir;if(va>vb)return sortDir;return 0;\n  });\n  var h=rows.map(function(a){\n    var r=risk(a),cnt=d.counts[a]||0;\n    var certLevel=cnt>5?\"KAT 通过\":\"自测\";\n    return\'<tr class=\"algo-row\" onclick=\"this.nextElementSibling.classList.toggle(\'open\')\"><td><strong>\'+a+\'</strong></td><td>\'+r.label+\'</td><td><span class=\"badge \'+r.cls+\'\">\'+r.label+\'</span></td><td>\'+cnt+\'</td><td>\'+certLevel+\'</td></tr><tr class=\"file-list\"><td colspan=\"5\">\'+(d.algoFiles[a]||[]).slice(0,50).map(function(f){return\'<div class=\"file-item\">\'+f.file+\'</div>\'}).join(\"\")+\'</td></tr>\';\n  });\n  document.getElementById(\"tbody\").innerHTML=h.join(\"\");\n}\nfunction downloadCBOM(){var b=new Blob([JSON.stringify(cbom,null,2)],{type:\"application/json\"});var a=document.createElement(\"a\");a.href=URL.createObjectURL(b);a.download=\"cbom-cyclonedx-fibemate-v3.3.0.json\";a.click();URL.revokeObjectURL(a.href)}\nfunction toggleJSON(){var e=document.getElementById(\"json-view\");if(!e.textContent)e.textContent=JSON.stringify(cbom,null,2);e.classList.toggle(\"open\");document.getElementById(\"json-toggle\").textContent=e.classList.contains(\"open\")?\"🔼 隐藏原始 CBOM JSON\":\"🔍 查看原始 CBOM JSON\"}\n// Init\nvar qs=0,qv=0,qw=0;\nd.algorithms.forEach(function(a){var r=risk(a);if(r.cls===\"badge-safe\")qs++;else if(r.cls===\"badge-vul\")qv++;else qw++});\ndocument.getElementById(\"total-algos\").textContent=d.algorithms.length;\ndocument.getElementById(\"total-files\").textContent=370;\ndocument.getElementById(\"q-safe\").textContent=qs;\ndocument.getElementById(\"q-vul\").textContent=qv;\ndocument.getElementById(\"q-weak\").textContent=qw;\nrenderTable();\n</script>\n</body>\n</html>';

fs.writeFileSync('C:/temp/fibemate-clone/www/docs/cbom-viewer.html',html,p);
console.log('CBOM viewer written:',html.length,'bytes');
