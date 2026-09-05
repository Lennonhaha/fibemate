// SPDX-License-Identifier: GPL-3.0-only
// packages/key-lifecycle/test-key-lifecycle.js
'use strict';

const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { KeyLifecycleManager } = require('./index.js');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; } else { console.error('  FAIL:', msg); failed++; } }
function randomKey(len=32) { return crypto.randomBytes(len); }
const tmpDir = path.join(os.tmpdir(), 'fibemate-kl-test-' + Date.now());

// 1. Bootstrap
console.log('=== 1. Bootstrap ===');
{ const m=new KeyLifecycleManager(); const k=randomKey(); m.bootstrap(k, 'ML-KEM-768');
  assert(m.current().version===1, 'bootstrap v=1'); assert(m.listActive().length===1, '1 active key'); }

// 2. Rotation
console.log('=== 2. Rotation ===');
{ const m=new KeyLifecycleManager(); m.bootstrap(randomKey());
  const r=m.rotate(randomKey(), 'scheduled'); assert(r.oldVersion.version===1, 'old v1'); assert(r.newVersion.version===2, 'new v2');
  assert(m.current().version===2, 'current v2'); assert(m.listActive().length===2, '2 active'); assert(!m.isRevoked(1), 'v1 grace not revoked'); }

// 3. Emergency
console.log('=== 3. Emergency ===');
{ const m=new KeyLifecycleManager(); m.bootstrap(randomKey()); m.emergencyRotate(randomKey());
  assert(m.isRevoked(1), 'v1 revoked'); assert(m.getRevocationList().length===1, '1 revoked'); }

// 4. Grace period
console.log('=== 4. Grace ===');
{ const m=new KeyLifecycleManager({gracePeriodMs:500}); m.bootstrap(randomKey()); m.rotate(randomKey());
  assert(m.decryptUsed(1), 'v1 decrypt ok'); assert(m.decryptUsed(2), 'v2 decrypt ok'); assert(m.get(1)!==null, 'v1 gettable'); }

// 5. Revocation
console.log('=== 5. Revocation ===');
{ const m=new KeyLifecycleManager(); m.bootstrap(randomKey()); m.rotate(randomKey()); m.revokeKey(1,'manual');
  assert(m.isRevoked(1), 'v1 revoked'); assert(m.decryptUsed(1)===false, 'v1 decrypt rejected'); assert(m.decryptUsed(2), 'v2 still ok'); }

// 6. Encrypt counter
console.log('=== 6. Encrypt Counter ===');
{ const m=new KeyLifecycleManager({maxMessagesPerKey:5}); m.bootstrap(randomKey());
  for(let i=0;i<5;i++){ const r=m.encryptUsed(); assert(r.rotationNeeded===(i===4), 'encrypt#'+(i+1)+' need='+(i===4)); } }

// 7. Pruning
console.log('=== 7. Pruning ===');
{ const m=new KeyLifecycleManager({maxActiveKeys:2,maxMessagesPerKey:99999,gracePeriodMs:100}); m.bootstrap(randomKey()); m.rotate(randomKey()); m.rotate(randomKey());
  assert(m.listActive().length<=2, 'pruned to <=2'); }

// 8. Export/Import
console.log('=== 8. Export/Import ===');
{ const m=new KeyLifecycleManager(); const k1=randomKey(); const k2=randomKey(); m.bootstrap(k1); m.rotate(k2);
  const s=m.exportState(); assert(s.currentVersion===2, 'exported v2');
  const km={1:k1, 2:k2}; const r=KeyLifecycleManager.importState(s,(v,fp)=>km[v]); assert(r.current().version===2, 'restored v2'); }

// 9. Persistence
console.log('=== 9. Persistence ===');
{ const pp=path.join(tmpDir,'kl.json'); const m=new KeyLifecycleManager({persistencePath:pp}); m.bootstrap(randomKey()); m.rotate(randomKey()); m.persistNow();
  assert(fs.existsSync(pp), 'file saved'); const d=JSON.parse(fs.readFileSync(pp,'utf8')); assert(d.currentVersion===2, 'persisted v2'); }

// 10. Audit
console.log('=== 10. Audit ===');
{ const m=new KeyLifecycleManager({maxMessagesPerKey:99999}); m.bootstrap(randomKey()); m.rotate(randomKey());
  const r=m.auditReport(); assert(r.currentVersion===2, 'audit v2'); assert(r.activeKeyCount===2, 'audit active'); }

// Summary
console.log('\n=== RESULTS ===');
console.log('  Passed:', passed, ' Failed:', failed, ' Total:', passed+failed);
try { fs.rmSync(tmpDir,{recursive:true,force:true}); } catch(_){}
process.exit(failed>0?1:0);
