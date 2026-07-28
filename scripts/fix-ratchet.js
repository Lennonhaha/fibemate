// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
const fs = require('fs');

// Fix double-ratchet-pq.js
let s = fs.readFileSync('double-ratchet-pq.js', 'utf8');

s = s.replace(
  "mlkem = require('./addon/build/Release/mlkem.node');",
  "try { mlkem = require('./packages/pqc-kem/src/ml-kem-768.js'); } catch(__) { mlkem = null; }"
);

s = s.replace(
  "const DoubleRatchet = require('./double-ratchet');",
  "let DoubleRatchet = null; try { DoubleRatchet = require('./double-ratchet'); } catch(__) { DoubleRatchet = null; }"
);

fs.writeFileSync('double-ratchet-pq.js', s, 'utf8');
console.log('fixed double-ratchet-pq.js');
