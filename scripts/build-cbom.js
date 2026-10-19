// SPDX-License-Identifier: GPL-3.0-only
/**
 * build-cbom.js — generate a CycloneDX 1.6 CBOM from tools/crypto-audit-scan.json
 *
 * Differences from the previous version:
 *  - no hard-coded Windows paths; everything resolves from __dirname
 *  - output validates against the official CycloneDX 1.6 schema
 *    (see tools/validate-cbom.cjs; schema fixtures ship with fibemate-tools)
 *  - custom data lives in `properties` (namespaced `fibemate:`), never in
 *    schema-owned objects, which reject unknown members
 *  - deterministic serialNumber (content hash) so re-runs are diffable, and a
 *    timestamp honouring SOURCE_DATE_EPOCH for reproducible builds
 *
 * Usage:
 *   node scripts/build-cbom.js                     # write tools/cbom-cyclonedx.json
 *   node scripts/build-cbom.js --check             # exit 1 if the on-disk CBOM is stale
 *   node scripts/build-cbom.js --scan X --out Y    # override paths
 *
 * TODO(refactor): the HTML viewer (www/docs/cbom-viewer.html) is FROZEN.
 * The tracked file is a hand-maintained page with a 3D force-directed graph and
 * it still reads the legacy `cryptoProperties.quantumSecurity` field, so it is
 * NOT in sync with the 1.6-schema-compliant CBOM produced here. Regenerating it
 * from this script would silently replace ~175 KB of maintained UI with a
 * minimal table and drop the graph. Do not re-enable automatic viewer output
 * until the viewer is refactored to read the new properties layout; the
 * `--viewer` / `--with-viewer` flags below are kept only for that future work
 * and must not be used in CI or release automation.
 *
 * As an extra guard, this script refuses to write to the tracked viewer path at
 * all: `--viewer` only accepts an explicit alternative target.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SCAN = path.join(REPO_ROOT, 'tools', 'crypto-audit-scan.json');
const DEFAULT_OUT = path.join(REPO_ROOT, 'tools', 'cbom-cyclonedx.json');
const DEFAULT_VIEWER = path.join(REPO_ROOT, 'www', 'docs', 'cbom-viewer.html');

/**
 * Single source of truth for every algorithm this repository may report.
 *
 * `primitive` must be one of the CycloneDX 1.6 enum values (all lower-case):
 *   drbg, mac, block-cipher, stream-cipher, signature, hash, pke, xof,
 *   kdf, key-agree, kem, ae, combiner, other, unknown
 *
 * `risk` is FIBEMATE's own post-quantum assessment. It is NOT a NIST category,
 * so it is emitted as `fibemate:quantumSecurity:level` rather than as
 * `nistQuantumSecurityLevel` (a 0..6 integer that would require knowing the
 * exact parameter set — the scan only records family names). The field is
 * omitted and explicitly annotated as `notEvaluated` in `properties`.
 *
 * `implementationPlatform` and `executionEnvironment` are omitted as well: the
 * scan is file-level, so it cannot prove which platform the code runs on or
 * whether it runs in a TEE. Language hints go to
 * `fibemate:implementationLanguages` instead, derived from file extensions.
 * `certificationLevel` is `["none"]` — the project holds no FIPS 140 or Common
 * Criteria certificate, and KAT/self-test status is not a certification level.
 */
const ALGORITHMS = {
  'ML-KEM': { primitive: 'kem', risk: 'quantum-safe', note: 'FIPS 203 (ML-KEM)' },
  'ML-DSA/fml-dsa': { primitive: 'signature', risk: 'quantum-safe', note: 'FIPS 204 (ML-DSA)' },
  'SLH-DSA': { primitive: 'signature', risk: 'quantum-safe', note: 'FIPS 205 (SLH-DSA)' },
  'SM2': { primitive: 'signature', risk: 'quantum-vulnerable', note: 'elliptic-curve signature' },
  'P-256/ECDH': { primitive: 'key-agree', risk: 'quantum-vulnerable', note: 'elliptic-curve key agreement' },
  'AES': { primitive: 'block-cipher', risk: 'quantum-safe', note: 'symmetric cipher' },
  'SM4': { primitive: 'block-cipher', risk: 'quantum-safe', note: 'symmetric cipher' },
  'SHA-256': { primitive: 'hash', risk: 'quantum-safe', note: 'Grover halves preimage resistance to ~128 bit' },
  'SM3': { primitive: 'hash', risk: 'quantum-safe', note: 'Grover halves preimage resistance to ~128 bit' },
};

/**
 * Present in the scan but deliberately NOT emitted as CBOM components: none of
 * them is a cryptographic asset. They are recorded in the root `properties`
 * so the exclusion is auditable instead of silent.
 */
const EXCLUDED = {
  'TLA+': 'formal specification language, not a cryptographic asset',
  'NTT': 'number-theoretic transform (mathematical building block), not a cryptographic primitive',
  'Double-Ratchet': 'protocol construction composed of several primitives, not a single cryptographic asset',
};

function parseArgs(argv) {
  const opts = { scan: DEFAULT_SCAN, out: DEFAULT_OUT, viewer: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan') opts.scan = path.resolve(argv[++i]);
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--viewer') opts.viewer = path.resolve(argv[++i]);
    else if (a === '--with-viewer') {
      console.error('--with-viewer is disabled: the tracked viewer is frozen (see TODO in the header).');
      console.error('Use --viewer <path> to write a scratch copy instead.');
      process.exit(2);
    }
    else if (a === '--no-viewer') opts.viewer = null;
    else if (a === '--check') opts.check = true;
    else if (a === '-h' || a === '--help') {
      console.log('usage: node scripts/build-cbom.js [--scan F] [--out F] [--viewer F] [--check]');
      process.exit(0);
    } else {
      console.error('unknown argument: ' + a);
      process.exit(2);
    }
  }
  return opts;
}

const EXT_TO_LANGUAGE = {
  '.js': 'javascript', '.cjs': 'javascript', '.mjs': 'javascript', '.ts': 'typescript',
  '.c': 'c', '.h': 'c', '.cc': 'c++', '.cpp': 'c++', '.hpp': 'c++',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin',
  '.sh': 'shell', '.sql': 'sql', '.tla': 'tla+', '.v': 'verilog', '.sv': 'systemverilog',
};

function languagesOf(occurrences) {
  const seen = new Set();
  for (const o of occurrences) {
    const ext = path.extname(o.location || '').toLowerCase();
    if (EXT_TO_LANGUAGE[ext]) seen.add(EXT_TO_LANGUAGE[ext]);
  }
  return [...seen].sort();
}

/** Stable UUIDv5-style identifier derived from content, so re-runs are diffable. */
function deterministicSerial(payload) {
  const h = crypto.createHash('sha256').update(payload).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return 'urn:uuid:' + [
    h.slice(0, 8), h.slice(8, 12), '5' + h.slice(13, 16),
    variant + h.slice(18, 20), h.slice(20, 32),
  ].join('-');
}

function isoNow() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

function readJson(file, what) {
  if (!fs.existsSync(file)) {
    console.error('missing ' + what + ': ' + file);
    process.exit(3);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('invalid JSON in ' + what + ' (' + file + '): ' + e.message);
    process.exit(3);
  }
}

function build(scan, version, scanPath) {
  const occurrencesByAlgo = new Map();
  for (const entry of scan) {
    for (const raw of String(entry.algo || '').split('|')) {
      const name = raw.trim();
      if (!name) continue;
      if (!occurrencesByAlgo.has(name)) occurrencesByAlgo.set(name, []);
      occurrencesByAlgo.get(name).push({ location: entry.file });
    }
  }

  const names = [...occurrencesByAlgo.keys()].sort();
  const excludedFound = [];
  const unknownFound = [];
  const components = [];

  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(EXCLUDED, name)) {
      excludedFound.push(name);
      continue;
    }
    const meta = ALGORITHMS[name];
    if (!meta) {
      unknownFound.push(name);
    }
    // `line` is intentionally omitted: the scan is file-level, so any line
    // number would be fabricated. The schema only requires `location`.
    const occurrences = occurrencesByAlgo.get(name);
    const languages = languagesOf(occurrences);
    const props = [
      { name: 'fibemate:quantumSecurity:level', value: meta ? meta.risk : 'unknown' },
      { name: 'fibemate:assetClass', value: 'cryptographic-primitive' },
      // The scan records family names only (no parameter sets), so no NIST
      // category can be asserted. CycloneDX 1.6 has `nistQuantumSecurityLevel`
      // (integer 0..6); leaving it out and saying so explicitly is honest.
      { name: 'fibemate:nistQuantumSecurityLevel', value: 'notEvaluated' },
    ];
    if (languages.length) props.push({ name: 'fibemate:implementationLanguages', value: languages.join(',') });
    if (meta && meta.note) props.push({ name: 'fibemate:note', value: meta.note });
    if (!meta) props.push({ name: 'fibemate:note', value: 'not classified; primitive recorded as "unknown"' });

    components.push({
      type: 'cryptographic-asset',
      'bom-ref': 'crypto:' + name,
      name,
      description: meta ? meta.note : 'unclassified algorithm reported by the source scan',
      cryptoProperties: {
        assetType: 'algorithm',
        algorithmProperties: {
          primitive: meta ? meta.primitive : 'unknown',
          // "none" is the only truthful enum value: the project holds no
          // FIPS 140 / Common Criteria certificate for these implementations.
          // KAT/self-test status is NOT a certification level, so it is not
          // asserted here (the old script invented it from a file count).
          certificationLevel: ['none'],
        },
      },
      evidence: { occurrences },
      properties: props,
    });
  }

  if (unknownFound.length) {
    console.warn('warning: unclassified algorithms (primitive=unknown): ' + unknownFound.join(', '));
    console.warn('         add them to ALGORITHMS in scripts/build-cbom.js');
  }

  const safe = components.filter((c) => c.properties[0].value === 'quantum-safe').map((c) => c.name);
  const vulnerable = components.filter((c) => c.properties[0].value === 'quantum-vulnerable').map((c) => c.name);

  const rootProperties = [
    { name: 'fibemate:generator', value: 'scripts/build-cbom.js' },
    { name: 'fibemate:scanSource', value: path.relative(REPO_ROOT, scanPath || DEFAULT_SCAN).split(path.sep).join('/') },
    { name: 'fibemate:scanEntries', value: String(scan.length) },
    { name: 'fibemate:quantumSafe', value: safe.join(',') || '(none)' },
    { name: 'fibemate:quantumVulnerable', value: vulnerable.join(',') || '(none)' },
  ];
  for (const name of excludedFound) {
    rootProperties.push({ name: 'fibemate:excludedAsset:' + name, value: EXCLUDED[name] });
  }

  const cbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      timestamp: isoNow(),
      tools: [{ vendor: 'FIBEMATE', name: 'build-cbom.js', version }],
      component: {
        type: 'application',
        name: 'FIBEMATE',
        version,
        'bom-ref': 'root',
        description:
          'PQC full-stack engineering verification platform. ' +
          'Non-asset entries in the source scan (formal specification language, ' +
          'mathematical transforms, protocol constructions) are listed under ' +
          'properties as fibemate:excludedAsset:* instead of being emitted as components.',
      },
    },
    components,
    dependencies: [{ ref: 'root', dependsOn: components.map((c) => c['bom-ref']) }],
    properties: rootProperties,
  };

  cbom.serialNumber = deterministicSerial(JSON.stringify({ components, properties: rootProperties, version }));
  return { cbom, components, safe, vulnerable, excludedFound, unknownFound };
}

function renderViewer(cbom, scanEntries) {
  const rows = cbom.components.map((c) => ({
    name: c.name,
    primitive: c.cryptoProperties.algorithmProperties.primitive,
    risk: c.properties.find((p) => p.name === 'fibemate:quantumSecurity:level').value,
    files: c.evidence.occurrences.length,
  }));
  const DATA = {
    rows,
    totalFiles: scanEntries,
    totalAlgos: rows.length,
    cbom,
  };
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>CBOM · CycloneDX 1.6 · FIBEMATE</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;line-height:1.6}
.container{max-width:1200px;margin:0 auto;padding:20px}
h1{color:#00d4ff;font-size:1.8rem;margin-bottom:4px}
h2{color:#00d4ff;font-size:1.2rem;margin:24px 0 12px;border-bottom:1px solid #1a1a3a;padding-bottom:6px}
.subtitle{color:#888;font-size:0.9rem;margin-bottom:20px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:20px 0}
.card{background:#0d0d28;border:1px solid #1a1a3a;border-radius:8px;padding:16px}
.card .label{color:#888;font-size:0.78rem;text-transform:uppercase}
.card .value{font-size:2rem;font-weight:700;color:#00d4ff}
.card.green .value{color:#10b981}
.card.red .value{color:#ef4444}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:0.85rem}
th,td{border:1px solid #1a1a3a;padding:8px 12px;text-align:left}
th{background:#0d0d28;color:#00d4ff}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600}
.badge-safe{background:rgba(16,185,129,0.15);color:#10b981}
.badge-vul{background:rgba(239,68,68,0.15);color:#ef4444}
.badge-unknown{background:rgba(245,158,11,0.15);color:#f59e0b}
.btn{display:inline-block;padding:10px 24px;border-radius:6px;border:none;cursor:pointer;font-size:0.9rem;font-weight:600;background:#00d4ff;color:#0a0a1a}
.json-view{background:#060612;border:1px solid #1a1a3a;border-radius:8px;padding:16px;max-height:500px;overflow:auto;font-family:monospace;font-size:0.78rem;white-space:pre-wrap;display:none}
.json-view.open{display:block}
</style>
</head>
<body>
<div class="container">
<h1>CBOM · 加密材料清单</h1>
<p class="subtitle">CycloneDX 1.6 Cryptographic Bill of Materials · FIBEMATE v${cbom.metadata.component.version}</p>
<div class="cards">
<div class="card"><div class="label">算法组件</div><div class="value" id="total-algos">-</div></div>
<div class="card"><div class="label">扫描文件</div><div class="value" id="total-files">-</div></div>
<div class="card green"><div class="label">量子安全</div><div class="value" id="q-safe">-</div></div>
<div class="card red"><div class="label">量子脆弱</div><div class="value" id="q-vul">-</div></div>
</div>
<div style="margin:16px 0">
<button class="btn" onclick="downloadCBOM()">下载 CBOM (JSON)</button>
<button class="btn" style="background:transparent;border:1px solid #00d4ff;color:#00d4ff;margin-left:8px" onclick="toggleJSON()">查看原始 JSON</button>
</div>
<div class="json-view" id="json-view"></div>
<h2>算法组件清单</h2>
<table>
<thead><tr><th>算法</th><th>primitive</th><th>量子风险评估</th><th>引用文件数</th></tr></thead>
<tbody id="tbody"></tbody>
</table>
</div>
<script>
var DATA=${JSON.stringify(DATA)};
function badge(risk){
  if(risk==="quantum-safe")return '<span class="badge badge-safe">量子安全</span>';
  if(risk==="quantum-vulnerable")return '<span class="badge badge-vul">量子脆弱</span>';
  return '<span class="badge badge-unknown">未分类</span>';
}
document.getElementById("tbody").innerHTML=DATA.rows.map(function(r){
  return '<tr><td><strong>'+r.name+'</strong></td><td>'+r.primitive+'</td><td>'+badge(r.risk)+'</td><td>'+r.files+'</td></tr>';
}).join("");
document.getElementById("total-algos").textContent=DATA.totalAlgos;
document.getElementById("total-files").textContent=DATA.totalFiles;
document.getElementById("q-safe").textContent=DATA.rows.filter(function(r){return r.risk==="quantum-safe"}).length;
document.getElementById("q-vul").textContent=DATA.rows.filter(function(r){return r.risk==="quantum-vulnerable"}).length;
function downloadCBOM(){
  var b=new Blob([JSON.stringify(DATA.cbom,null,2)],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(b);
  a.download="cbom-cyclonedx-fibemate-v"+DATA.cbom.metadata.component.version+".json";
  a.click();URL.revokeObjectURL(a.href);
}
function toggleJSON(){
  var e=document.getElementById("json-view");
  if(!e.textContent)e.textContent=JSON.stringify(DATA.cbom,null,2);
  e.classList.toggle("open");
}
</script>
</body>
</html>
`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pkg = readJson(path.join(REPO_ROOT, 'package.json'), 'package.json');
  const scan = readJson(opts.scan, 'scan file');
  if (!Array.isArray(scan)) {
    console.error('scan file must be a JSON array: ' + opts.scan);
    process.exit(3);
  }

  const { cbom, components, safe, vulnerable, excludedFound } = build(scan, pkg.version, opts.scan);
  const json = JSON.stringify(cbom, null, 2) + '\n';

  if (opts.check) {
    const current = fs.existsSync(opts.out) ? fs.readFileSync(opts.out, 'utf8') : '';
    // Compare semantics only: timestamp is expected to move.
    const strip = (s) => {
      try {
        const o = JSON.parse(s);
        delete o.metadata.timestamp;
        return JSON.stringify(o);
      } catch { return null; }
    };
    if (strip(current) === strip(json)) {
      console.log('CBOM up to date: ' + path.relative(REPO_ROOT, opts.out));
      process.exit(0);
    }
    console.error('CBOM is stale: ' + path.relative(REPO_ROOT, opts.out) + ' (run node scripts/build-cbom.js)');
    process.exit(1);
  }

  fs.writeFileSync(opts.out, json, 'utf8');
  console.log('scan entries:   ' + scan.length);
  console.log('components:     ' + components.length);
  console.log('quantum-safe:   ' + (safe.join(', ') || '(none)'));
  console.log('quantum-vuln:   ' + (vulnerable.join(', ') || '(none)'));
  console.log('excluded:       ' + (excludedFound.join(', ') || '(none)'));
  console.log('written:        ' + path.relative(REPO_ROOT, opts.out) + ' (' + Buffer.byteLength(json) + ' bytes)');

  if (opts.viewer) {
    if (path.resolve(opts.viewer) === path.resolve(DEFAULT_VIEWER)) {
      console.error('refusing to overwrite the frozen viewer: ' + path.relative(REPO_ROOT, DEFAULT_VIEWER));
      console.error('see TODO(refactor) in scripts/build-cbom.js');
      process.exit(2);
    }
    const html = renderViewer(cbom, scan.length);
    fs.writeFileSync(opts.viewer, html, 'utf8');
    console.log('viewer:         ' + path.relative(REPO_ROOT, opts.viewer) + ' (' + Buffer.byteLength(html) + ' bytes)');
  }
}

if (require.main === module) main();

module.exports = { build, ALGORITHMS, EXCLUDED };
