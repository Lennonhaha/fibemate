// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Feature Flags — Central Feature Gate Module
 *
 * Controls which code paths are enabled at runtime.
 * All flags default to OFF in production.
 *
 * Usage:
 *   const flags = require('./flags');
 *   if (flags.EXPERIMENTAL) { ... load experimental module ... }
 *
 * Environment variables:
 *   FIBEMATE_EXPERIMENTAL=1    Enable ALL experimental code (VWZ, LGv2, Mixnet, ZK, etc.)
 *
 * Production (default, all flags OFF):
 *   node src/index.js
 *   # or explicitly:
 *   FIBEMATE_EXPERIMENTAL=0 node src/index.js
 *
 * Full experimental build:
 *   FIBEMATE_EXPERIMENTAL=1 node src/index.js
 */
'use strict';

// ---- Parse ----
const isSet = (name) => {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') return false;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};

const EXPERIMENTAL  = isSet('FIBEMATE_EXPERIMENTAL');

// ---- Sub-flags (all require EXPERIMENTAL master) ----
// These can be independently toggled when EXPERIMENTAL=1
const VWZ       = EXPERIMENTAL && !isSet('FIBEMATE_NO_VWZ');
const LG        = EXPERIMENTAL && !isSet('FIBEMATE_NO_LG');
const MIXNET    = EXPERIMENTAL && !isSet('FIBEMATE_NO_MIXNET');
const ZK_AUTH   = EXPERIMENTAL && !isSet('FIBEMATE_NO_ZK');
const PIR       = EXPERIMENTAL && !isSet('FIBEMATE_NO_PIR');
const PHASE4    = EXPERIMENTAL && !isSet('FIBEMATE_NO_PHASE4');
const NEXUS     = EXPERIMENTAL && !isSet('FIBEMATE_NO_NEXUS');

// ---- Startup summary ----
const mode = EXPERIMENTAL ? 'FULL (experimental ON)' : 'PRODUCTION (experimental OFF)';
console.log(`[Flags] Mode: ${mode}`);
if (EXPERIMENTAL) {
  const active = [];
  if (VWZ)    active.push('VWZ');
  if (LG)     active.push('LookingGlass');
  if (MIXNET) active.push('Mixnet');
  if (ZK_AUTH) active.push('ZK-Auth');
  if (PIR)    active.push('PIR-Search');
  if (PHASE4) active.push('Phase4');
  if (NEXUS)  active.push('Nexus');
  console.log(`[Flags] Experimental subsystems: ${active.length > 0 ? active.join(', ') : '(none)'}`);
}


module.exports = {
  // Master switch
  EXPERIMENTAL,

  // Subsystem switches (all gated by EXPERIMENTAL)
  VWZ,
  LG,
  MIXNET,
  ZK_AUTH,
  PIR,
  PHASE4,
  NEXUS,

  // Helpers
  isSet,
};
