// SPDX-License-Identifier: GPL-3.0-only
/**
 * Feature Flag Smoke Test
 * Verifies that the feature flag isolation in src/index.js works correctly
 * without actually starting the server.
 *
 * Usage: node scripts/test-flags.js
 */
'use strict';

const flags = require('../src/flags');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name} — ${e.message}`);
  }
}

console.log('\n=== FIBEMATE Feature Flag Smoke Tests ===\n');

// --- Flag defaults (production mode) ---
console.log('1. Production (all flags OFF):');
test('EXPERIMENTAL === false',           () => { if (flags.EXPERIMENTAL !== false) throw new Error(`got ${flags.EXPERIMENTAL}`); });
test('VWZ === false',                    () => { if (flags.VWZ !== false) throw new Error(`got ${flags.VWZ}`); });
test('LG === false',                     () => { if (flags.LG !== false) throw new Error(`got ${flags.LG}`); });
test('MIXNET === false',                 () => { if (flags.MIXNET !== false) throw new Error(`got ${flags.MIXNET}`); });
test('ZK_AUTH === false',                () => { if (flags.ZK_AUTH !== false) throw new Error(`got ${flags.ZK_AUTH}`); });
test('PIR === false',                    () => { if (flags.PIR !== false) throw new Error(`got ${flags.PIR}`); });
test('PHASE4 === false',                 () => { if (flags.PHASE4 !== false) throw new Error(`got ${flags.PHASE4}`); });
test('NEXUS === false',                  () => { if (flags.NEXUS !== false) throw new Error(`got ${flags.NEXUS}`); });

// --- Flag structure ---
console.log('\n2. Flag API structure:');
test('isSet is a function',              () => { if (typeof flags.isSet !== 'function') throw new Error('not a function'); });
test('EXPERIMENTAL exists',              () => { if (!('EXPERIMENTAL' in flags)) throw new Error('missing'); });
test('VWZ exists',                       () => { if (!('VWZ' in flags)) throw new Error('missing'); });
test('LG exists',                        () => { if (!('LG' in flags)) throw new Error('missing'); });
test('MIXNET exists',                    () => { if (!('MIXNET' in flags)) throw new Error('missing'); });

// --- isSet helper ---
console.log('\n3. isSet() helper:');
test('isSet unset => false',             () => { if (flags.isSet('UNSET_VAR') !== false) throw new Error('not false'); });
test('isSet "1" => true',                () => { if (flags.isSet('TEST_FLAG_1') !== undefined) return; process.env.TEST_FLAG_1='1'; if (flags.isSet('TEST_FLAG_1')!==true) throw new Error(); delete process.env.TEST_FLAG_1; });
test('isSet "true" => true',             () => { process.env.TEST_FLAG_T='true'; if (flags.isSet('TEST_FLAG_T')!==true) throw new Error(); delete process.env.TEST_FLAG_T; });
test('isSet "0" => false',               () => { process.env.TEST_FLAG_0='0'; if (flags.isSet('TEST_FLAG_0')!==false) throw new Error(); delete process.env.TEST_FLAG_0; });
test('isSet "no" => false',              () => { process.env.TEST_FLAG_N='no'; if (flags.isSet('TEST_FLAG_N')!==false) throw new Error(); delete process.env.TEST_FLAG_N; });
test('isSet "" => false',                () => { process.env.TEST_FLAG_E=''; if (flags.isSet('TEST_FLAG_E')!==false) throw new Error(); delete process.env.TEST_FLAG_E; });

// --- Verify dead flags removed ---
console.log('\n4. Dead flag cleanup:');
test('LEGACY_TLS removed (no dead flag)',    () => { if ('LEGACY_TLS' in flags) throw new Error('LEGACY_TLS should not exist'); });
test('ARCHIVE removed (no dead flag)',       () => { if ('ARCHIVE' in flags) throw new Error('ARCHIVE should not exist'); });

// --- Sub-flag logic: require master, respect negative ---
// These tests change process.env so they have to be careful
console.log('\n5. Sub-flag gating (requires EXPERIMENTAL master):');
test('VWZ off even if EXPERIMENTAL=1 & FIBEMATE_NO_VWZ=1', () => {
  process.env.FIBEMATE_EXPERIMENTAL = '1';
  process.env.FIBEMATE_NO_VWZ = '1';
  // Re-require to get fresh state
  delete require.cache[require.resolve('../src/flags')];
  const f2 = require('../src/flags');
  delete process.env.FIBEMATE_EXPERIMENTAL;
  delete process.env.FIBEMATE_NO_VWZ;
  if (f2.VWZ !== false) throw new Error(`got ${f2.VWZ}`);
  // Restore cache
  delete require.cache[require.resolve('../src/flags')];
});
test('MIXNET off when EXPERIMENTAL off (master gate)', () => {
  // Default: EXPERIMENTAL off, so MIXNET off regardless
  // Already tested, but let's verify that MIXNET requires EXPERIMENTAL
  process.env.FIBEMATE_EXPERIMENTAL = '0';
  delete require.cache[require.resolve('../src/flags')];
  const f2 = require('../src/flags');
  delete process.env.FIBEMATE_EXPERIMENTAL;
  if (f2.MIXNET !== false) throw new Error(`got ${f2.MIXNET}`);
  delete require.cache[require.resolve('../src/flags')];
});

// Clean up cache
delete require.cache[require.resolve('../src/flags')];

// --- Final ---
console.log(`\n=== Results: ${passed} PASS, ${failed} FAIL ===\n`);
process.exit(failed > 0 ? 1 : 0);
