// build-demo.js — Generate browser-compatible ml-kem-768.js for /demo
// SPDX-License-Identifier: GPL-3.0-only
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'packages/pqc-kem/src/ml-kem-768.js'),
    'utf8'
);

// Browser Buffer polyfill
const polyfill = `
// Browser Buffer polyfill (Node.js built-in in original source)
if (typeof Buffer === 'undefined') {
  window.Buffer = {
    from(data, enc) {
      if (Array.isArray(data) || data instanceof Uint8Array) return new Uint8Array(data);
      if (typeof data === 'string' && enc === 'hex') {
        const bytes = new Uint8Array(data.length / 2);
        for (let i = 0; i < data.length; i += 2) bytes[i / 2] = parseInt(data.slice(i, i + 2), 16);
        return bytes;
      }
      if (data instanceof Uint8Array || data instanceof ArrayBuffer) return new Uint8Array(data);
      return new Uint8Array(data);
    },
    concat(arrs) {
      let total = 0;
      for (const a of arrs) total += a.length;
      const out = new Uint8Array(total);
      let off = 0;
      for (const a of arrs) { out.set(a, off); off += a.length; }
      return out;
    },
    compare(a, b) {
      if (a.length !== b.length) return a.length - b.length;
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; }
      return 0;
    },
    alloc(n) { return new Uint8Array(n); }
  };
}

// Browser Int16Array polyfill (just in case)
if (typeof Int16Array === 'undefined') { window.Int16Array = Int16Array; }
`;

let browserSrc = ''
    + '// ML-KEM-768 (FIPS 203) — Browser-compatible standalone\n'
    + '// Auto-generated from packages/pqc-kem/src/ml-kem-768.js\n'
    + '(function() {\n'
    + polyfill
    + src
        .replace('if(typeof module!==\'undefined\'&&module.exports)module.exports=MLKEM768;', '')
    + '\nwindow.MLKEM768 = MLKEM768;\n'
    + '})();\n';

const outDir = path.join(__dirname, '..', 'www', 'demo');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'ml-kem-768.js'), browserSrc);
console.log(`✅ www/demo/ml-kem-768.js (${browserSrc.length} bytes)`);
