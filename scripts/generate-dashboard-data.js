/**
 * generate-dashboard-data.js
 * Generates www/docs/pqc-dashboard-data.json from @fibemate/algorithm-registry
 * Run: node scripts/generate-dashboard-data.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

const registry = require('../packages/algorithm-registry/index.js');

const PERF = {
  'ML-KEM':       { keygenUs:103,   encapsUs:120,   decapsUs:140,   opsPerSec:null,   note:'Native (C addon)' },
  'ML-DSA':       { keygenUs:null,  signUs:2400,    verifyUs:700,   opsPerSec:null,   note:'fml-dsa (JS), ML-DSA-44' },
  'SLH-DSA':      { keygenUs:489400,signUs:4199500, verifyUs:4200,  opsPerSec:null,   note:'JS (Noble, WASM bridge)' },
  'SM2':          { keygenUs:null,  signUs:2800,    verifyUs:1400,  opsPerSec:null,   note:'纯 JS / C addon, wNAF+Comb G' },
  'SM3':          { keygenUs:null,  opsPerSec:21272, verifyUs:null,  opsPerSec3B:21272, opsPerSec1140B:4506, note:'纯 JS, 3B/1140B' },
  'SM4':          { keygenUs:null,  opsPerSec:4879,  verifyUs:null,  opsPerSecEnc:'4,879 ops/s (10B)', opsPerSecDec:'8,030 ops/s', note:'纯 JS GCM' },
  'P-256/ECDH':   { keygenUs:null,  encapsUs:null,  decapsUs:null,  opsPerSec:null,   note:'Native (Node.js crypto)' },
  'SHA-256':      { keygenUs:null,  opsPerSec:null,  verifyUs:null,  opsPerSec:null,   note:'Native (Node.js crypto)' },
  'AES':          { keygenUs:null,  opsPerSec:null,  verifyUs:null,  opsPerSec:null,   note:'Native (Node.js crypto, AES-256-GCM)' },
  'NTT':          { keygenUs:null,  opsPerSec:null,  verifyUs:null,  opsPerSec:null,   note:'FPGA @50MHz, ~503 cycles' },
};

const SIZES = {
  'ML-KEM':       { pk:1184, sk:2400, ct:1088, ss:32 },
  'SLH-DSA':      { pk:32,   sk:64,   sig:7856 },
  'SM2':          { pk:64,   sk:32,   sig:70 },
  'SM3':          { sig:32 },
  'SM4':          { sk:16,   sig:16 },
  'P-256/ECDH':   { pk:65,   sk:32 },
  'AES':          { sk:32,   sig:16 },
};

const VERIFY = {
  'ML-KEM':       { kat:'10,000/10,000', tvla:'33/36 (3 known: compress pre-alloc)', hasKAT:true, hasTVLA:true, hasTSR:true },
  'ML-DSA':       { kat:'270/270 (nonce 随机)', tvla:'N/A', hasKAT:true, hasTVLA:false, hasTSR:true },
  'SLH-DSA':      { kat:'148/148', tvla:'N/A (归因 WASM/JIT)', hasKAT:true, hasTVLA:false, hasTSR:true },
  'SM2':          { kat:'100/100', tvla:'15/18 (3 documented: jsbn/BigInt)', hasKAT:true, hasTVLA:true, hasTSR:true },
  'SM3':          { kat:'30/30', tvla:'N/A (哈希无秘密输入)', hasKAT:true, hasTVLA:false, hasTSR:false },
  'SM4':          { kat:'30/30', tvla:'N/A', hasKAT:true, hasTVLA:false, hasTSR:false },
  'P-256/ECDH':   { kat:'Verified', tvla:'N/A', hasKAT:true, hasTVLA:false, hasTSR:false },
  'SHA-256':      { kat:'NIST vectors', tvla:'N/A', hasKAT:true, hasTVLA:false, hasTSR:false },
  'AES':          { kat:'NIST vectors', tvla:'N/A', hasKAT:true, hasTVLA:false, hasTSR:false },
  'NTT':          { kat:'Internal', tvla:'Hardware fault detection', hasKAT:true, hasTVLA:true, hasTSR:false },
};

const COVERAGE = {
  'ML-KEM':       { covScore:100, riskScore:5,  riskLevel:'low' },
  'ML-DSA':       { covScore:70,  riskScore:8,  riskLevel:'low' },
  'SLH-DSA':      { covScore:65,  riskScore:30, riskLevel:'med' },
  'SM2':          { covScore:90,  riskScore:5,  riskLevel:'low' },
  'SM3':          { covScore:65,  riskScore:25, riskLevel:'med' },
  'SM4':          { covScore:65,  riskScore:25, riskLevel:'med' },
  'P-256/ECDH':   { covScore:50,  riskScore:40, riskLevel:'high' },
  'SHA-256':      { covScore:50,  riskScore:30, riskLevel:'med' },
  'AES':          { covScore:50,  riskScore:20, riskLevel:'low' },
  'NTT':          { covScore:70,  riskScore:5,  riskLevel:'low' },
};

const STYLE = {
  'ML-KEM':       { icon:'🔑', color:'#00d4ff' },
  'ML-DSA':       { icon:'✍️', color:'#8b5cf6' },
  'SLH-DSA':      { icon:'🔏', color:'#ec4899' },
  'SM2':          { icon:'🇨🇳', color:'#ff6b6b' },
  'SM3':          { icon:'🇨🇳', color:'#ff8787' },
  'SM4':          { icon:'🇨🇳', color:'#f03e3e' },
  'P-256/ECDH':   { icon:'🔐', color:'#f59e0b' },
  'SHA-256':      { icon:'#️⃣', color:'#10b981' },
  'AES':          { icon:'🔒', color:'#22c55e' },
  'NTT':          { icon:'⚡', color:'#a78bfa' },
  'Double-Ratchet':{ icon:'🔄', color:'#eab308' },
  'TLA+':         { icon:'📐', color:'#94a3b8' },
};

const TYPE_NAMES = {
  'pqc-kem': 'KEM', 'pqc-sig': 'SIG',
  'classic-ecc': 'ECC', 'classic-hash': 'Hash',
  'classic-sym': 'AEAD', 'protocol': 'Protocol',
  'primitive': 'Primitive', 'verification': 'TLA+',
};

const skippedCategories = ['protocol', 'verification'];

const dashboardAlgos = [];

registry.getAlgorithmIds().forEach(id => {
  const algo = registry.getAlgorithm(id);
  if (skippedCategories.includes(algo.category)) return;

  const style = STYLE[id] || { icon:'🔬', color:'#94a3b8' };
  const perf = PERF[id] || {};
  const size = SIZES[id] || {};
  const verify = VERIFY[id] || { kat:'N/A', tvla:'N/A', hasKAT:false, hasTVLA:false, hasTSR:false };
  const cov = COVERAGE[id] || { covScore:50, riskScore:25, riskLevel:'med' };

  let secLevel;
  if (algo.securityLevel.nistLevel) {
    secLevel = `NIST ${algo.securityLevel.nistLevel} (≈AES-${algo.securityLevel.classical})`;
  } else if (algo.securityLevel.quantum !== null && algo.securityLevel.quantum > 0) {
    secLevel = `~${algo.securityLevel.classical}-bit classic / ${algo.securityLevel.quantum}-bit quantum`;
  } else {
    secLevel = `~${algo.securityLevel.classical}-bit classic`;
  }

  const entry = {
    id: id.toLowerCase().replace(/[\/\-]/g, ''),
    name: algo.name,
    cn: algo.name,
    type: TYPE_NAMES[algo.category] || algo.category,
    family: algo.family,
    standard: algo.standards.primary,
    standards: algo.standards,
    cbom: algo.cbom,
    status: algo.status,
    implementation: algo.implementation,
    evidence: algo.evidence,
    icon: style.icon,
    color: style.color,
    secLevel: secLevel,
    nistLevel: algo.securityLevel.nistLevel,
    pk: size.pk || null,
    sk: size.sk || null,
    ct: size.ct || null,
    sig: size.sig || null,
    ss: size.ss || null,
    keygenUs: perf.keygenUs || null,
    encapsUs: perf.encapsUs || null,
    decapsUs: perf.decapsUs || null,
    signUs: perf.signUs || null,
    verifyUs: perf.verifyUs || null,
    opsPerSec: perf.opsPerSec || null,
    opsPerSec3B: perf.opsPerSec3B || null,
    opsPerSec1140B: perf.opsPerSec1140B || null,
    opsPerSecEnc: perf.opsPerSecEnc || null,
    opsPerSecDec: perf.opsPerSecDec || null,
    perfNote: perf.note || '',
    kat: verify.kat || 'N/A',
    tvla: verify.tvla || 'N/A',
    hasKAT: verify.hasKAT || false,
    hasTVLA: verify.hasTVLA || false,
    hasTSR: verify.hasTSR || false,
    covScore: cov.covScore,
    riskScore: cov.riskScore,
    riskLevel: cov.riskLevel,
  };

  dashboardAlgos.push(entry);
});

const stats = registry.getStatistics();
const dashboardStats = {
  ...stats,
  dashboardAlgoCount: dashboardAlgos.length,
  avgCoverage: Math.round(dashboardAlgos.reduce((s, a) => s + a.covScore, 0) / dashboardAlgos.length),
  lowRisk: dashboardAlgos.filter(a => a.riskLevel === 'low').length,
  medRisk: dashboardAlgos.filter(a => a.riskLevel === 'med').length,
  highRisk: dashboardAlgos.filter(a => a.riskLevel === 'high').length,
};

const output = {
  generated: new Date().toISOString(),
  version: 'v3.3.0',
  source: '@fibemate/algorithm-registry v1.0.0',
  statistics: dashboardStats,
  algorithms: dashboardAlgos,
};

const outPath = path.join(__dirname, '..', 'www', 'docs', 'pqc-dashboard-data.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`✅ Generated ${outPath}`);
console.log(`   ${dashboardAlgos.length} algorithms, ${Object.keys(output.statistics).length} stats`);
console.log(`   Algorithms: ${dashboardAlgos.map(a => a.cn).join(', ')}`);
