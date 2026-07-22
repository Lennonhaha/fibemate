#!/usr/bin/env node
// fibemate_bridge.js — JSON stdin/stdout bridge for Python bindings
// SPDX-License-Identifier: GPL-3.0-only
//
// Reads JSON request from stdin, writes JSON response to stdout.
// Protocol: { "action": "...", "args": [...] } → { "result": ... } | { "error": "..." }

'use strict';

const { generateKeypair, encapsulate, decapsulate } = require('../../../packages/pqc-kem/src/ml-kem-768.js');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const req = JSON.parse(input);
    const result = handle(req.action, req.args || []);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n');
    process.exitCode = 1;
  }
});

function handle(action, args) {
  switch (action) {
    case 'keygen': {
      const kp = generateKeypair();
      return {
        publicKey:  Buffer.from(kp.publicKey).toString('hex'),
        secretKey:  Buffer.from(kp.secretKey).toString('hex'),
      };
    }

    case 'encaps': {
      const pk = Buffer.from(args[0], 'hex');
      const { ciphertext, sharedSecret } = encapsulate(pk);
      return {
        ciphertext:   Buffer.from(ciphertext).toString('hex'),
        sharedSecret: Buffer.from(sharedSecret).toString('hex'),
      };
    }

    case 'decaps': {
      const sk = Buffer.from(args[0], 'hex');
      const ct = Buffer.from(args[1], 'hex');
      const ss = decapsulate(sk, ct);
      return { sharedSecret: Buffer.from(ss).toString('hex') };
    }

    case 'selfTest': {
      const n = parseInt(args[0], 10) || 1000;
      let ok = 0;
      for (let i = 0; i < n; i++) {
        const kp = generateKeypair();
        const { ciphertext, sharedSecret: ss1 } = encapsulate(kp.publicKey);
        const ss2 = decapsulate(kp.secretKey, ciphertext);
        if (Buffer.compare(ss1, ss2) === 0) ok++;
      }
      return { pass: ok === n, ok, total: n };
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}
