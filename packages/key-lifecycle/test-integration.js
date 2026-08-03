// ============================================================
// Test: Key Lifecycle x Double Ratchet Integration
// ============================================================

'use strict';

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; } else { console.log('  FAIL:', msg); failed++; } }

const { KLSession, createKLSession } = require('./double-ratchet-integration');
const { KeyLifecycleManager } = require('./index');

// ============================================================
console.log('=== 1. KLSession Initialization ===');
{
  const sess = createKLSession({ maxMessagesPerKey: 5 });
  assert(sess instanceof KLSession, 'instanceof KLSession');
  assert(sess.kl instanceof KeyLifecycleManager, 'has KeyLifecycleManager');
  assert(typeof sess.encrypt === 'function', 'has encrypt');
  assert(typeof sess.decrypt === 'function', 'has decrypt');
  assert(typeof sess.emergencyRotate === 'function', 'has emergencyRotate');
  assert(typeof sess.revokeKey === 'function', 'has revokeKey');
  assert(typeof sess.getAuditReport === 'function', 'has getAuditReport');
}

console.log('=== 2. Custom config ===');
{
  const sess = createKLSession({ maxMessagesPerKey: 50, rotateIntervalMs: 1800000, gracePeriodMs: 60000 });
  assert(sess.kl.config.maxMessagesPerKey === 50, 'custom maxMessages');
  assert(sess.kl.config.rotateIntervalMs === 1800000, 'custom interval');
  assert(sess.kl.config.gracePeriodMs === 60000, 'custom grace');
}

console.log('=== 3. Emergency Rotate ===');
{
  const buf1 = Buffer.alloc(32, 0xAA);
  const buf2 = Buffer.alloc(32, 0xBB);
  const sess = createKLSession();
  sess.rootKey = buf1;
  sess.kl.bootstrap(buf1, 'test');
  const beforeV = sess.kl.current().version;
  const result = sess.emergencyRotate(buf2);
  assert(result.oldVersion && result.oldVersion.version === beforeV, 'oldVersion preserved');
  assert(result.newVersion.version === beforeV + 1, 'newVersion incremented');
  assert(sess.kl.current().version === beforeV + 1, 'KL version updated');
  assert(sess.kl.isRevoked(beforeV) === true, 'old version revoked after emergency');
}

console.log('=== 4. Manual Revocation ===');
{
  const sess = createKLSession();
  sess.kl.bootstrap(Buffer.alloc(32, 0x11), 'test');
  sess.kl.rotate(Buffer.alloc(32, 0x22), 'test_rotate');
  sess.kl.rotate(Buffer.alloc(32, 0x33), 'test_rotate2');
  assert(sess.kl.current().version === 3, 'at version 3');
  sess.revokeKey(2, 'compromised');
  assert(sess.kl.isRevoked(2) === true, 'version 2 revoked');
  assert(sess.kl.isRevoked(1) === false, 'version 1 still active');
  assert(sess.kl.isRevoked(3) === false, 'version 3 still active');
}

console.log('=== 5. Grace Period ===');
{
  const sess = createKLSession({ gracePeriodMs: 5000 });
  sess.kl.bootstrap(Buffer.alloc(32, 0xAA), 'test');
  sess.kl.rotate(Buffer.alloc(32, 0xBB), 'test');
  assert(sess.kl.isRevoked(1) === false, 'v1 not revoked during grace');
  const report = sess.kl.auditReport();
  assert(report.activeKeyCount >= 1, 'active keys tracked');
}

console.log('=== 6. Encrypt counter rotation-needed flag ===');
{
  const sess = createKLSession({ maxMessagesPerKey: 3 });
  sess.kl.bootstrap(Buffer.alloc(32, 0xAA), 'test');
  assert(sess.kl.current().version === 1, 'starts at v1');
  sess.kl.encryptUsed(); // msg 1
  sess.kl.encryptUsed(); // msg 2
  assert(sess.kl.current().version === 1, 'still v1 after 2 msgs');
  const result = sess.kl.encryptUsed(); // msg 3
  assert(result.rotationNeeded === true, 'rotationNeeded flag set');
}

console.log('=== 7. Audit Report structure ===');
{
  const sess = createKLSession();
  sess.kl.bootstrap(Buffer.alloc(32, 0xAA), 'test');
  const report = sess.getAuditReport();
  assert(typeof report === 'object', 'audit report object');
  assert(typeof report.currentVersion === 'number', 'has currentVersion');
  assert(typeof report.totalRotations === 'number', 'has totalRotations');
  assert(Array.isArray(report.activeKeys), 'has activeKeys array');
}

console.log('=== 8. Multiple rotation tracking ===');
{
  const sess = createKLSession({ maxMessagesPerKey: 100 });
  sess.kl.bootstrap(Buffer.alloc(32, 0x01), 'test');
  for (let i = 0; i < 10; i++) {
    sess.kl.rotate(Buffer.alloc(32, i + 2), 'rotate_' + (i + 1));
  }
  const report = sess.getAuditReport();
  assert(report.totalRotations >= 10, 'multiple rotations tracked');
  assert(report.currentVersion >= 11, 'version advanced to >=11');
}

console.log('=== 9. Serialization ===');
{
  const sess = createKLSession({ maxMessagesPerKey: 5 });
  sess.rootKey = Buffer.alloc(32, 0xDE);
  sess.kl.bootstrap(Buffer.alloc(32, 0xDE), 'test');
  sess.kl.rotate(Buffer.alloc(32, 0xED), 'test_rotate');
  const data = JSON.parse(sess.serialize());
  assert(data.klState !== undefined, 'KL state in serialized');
  assert(data.klState.currentVersion === 2, 'version is 2');
}

console.log('=== 10. Revocation list ===');
{
  const sess = createKLSession();
  sess.kl.bootstrap(Buffer.alloc(32, 0xAA), 'init');
  for (let i = 0; i < 4; i++) {
    sess.kl.rotate(Buffer.alloc(32, 0xAA + i + 1), 'r' + i);
  }
  sess.revokeKey(2, 'compromised');
  sess.revokeKey(3, 'suspicious');
  const revoked = sess.kl.getRevocationList();
  assert(revoked.length >= 2, 'revocation list populated');
  assert(sess.kl.isRevoked(2) === true, 'v2 revoked');
  assert(sess.kl.isRevoked(3) === true, 'v3 revoked');
  assert(sess.kl.isRevoked(5) === false, 'v5 not revoked');
}

console.log('\n=== RESULTS ===');
console.log('  Passed:', passed, ' Failed:', failed, ' Total:', passed + failed);
if (failed > 0) process.exit(1);
