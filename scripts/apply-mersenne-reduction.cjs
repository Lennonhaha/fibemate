// apply-mersenne-reduction.cjs — apply fast SM2 modular reduction to bigint-ec
const fs = require('fs');
const path = '/opt/fibemate-repo/www/crypto/sm2-bigint-ec.js';
let src = fs.readFileSync(path, 'utf8');

// ─── 1. Add Mersenne fast reduction helper ───
const mersenneHelper = `
// Fast Mersenne reduction for SM2_P = 2^256 - 2^224 - 2^96 + 2^64 - 1
// Identity: 2^256 ≡ 2^224 + 2^96 - 2^64 + 1 (mod p)
const _SM2_M256 = (1n << 256n) - 1n;
function _fastModP(x) {
  let t = x;
  for (let i = 0; i < 5; i++) {
    const s1 = t >> 256n;
    t = (t & _SM2_M256) + s1 + (s1 << 224n) + (s1 << 96n) - (s1 << 64n);
  }
  while (t >= SM2_P) t -= SM2_P;
  while (t < 0n) t += SM2_P;
  return t;
}
`;

const marker = "const ZERO = 0n, ONE = 1n, TWO = 2n, THREE = 3n, FOUR = 4n, EIGHT = 8n;\n\n// ============ Field Operations (mod SM2_P) ============";
const replacement = "const ZERO = 0n, ONE = 1n, TWO = 2n, THREE = 3n, FOUR = 4n, EIGHT = 8n;" + mersenneHelper + "\n// ============ Field Operations (mod SM2_P) ============";

if (!src.includes(marker)) {
  console.log('ERROR: marker not found');
  process.exit(1);
}
src = src.replace(marker, replacement);

// ─── 2. Replace F.mul ───
const mulOld = "    mul(a, b) {\n        return (a * b) % SM2_P;\n    },";
const mulNew = "    mul(a, b) {\n        return _fastModP(a * b);\n    },";
if (!src.includes(mulOld)) { console.log('ERROR: mul pattern not found'); process.exit(1); }
src = src.replace(mulOld, mulNew);

// ─── 3. Replace F.sqr ───
const sqrOld = "    sqr(a) {\n        return (a * a) % SM2_P;\n    },";
const sqrNew = "    sqr(a) {\n        return _fastModP(a * a);\n    },";
if (!src.includes(sqrOld)) { console.log('ERROR: sqr pattern not found'); process.exit(1); }
src = src.replace(sqrOld, sqrNew);

fs.writeFileSync(path, src, 'utf8');

// Validate
src = fs.readFileSync(path, 'utf8');
const checks = {
  '_fastModP defined': src.includes('function _fastModP(x)'),
  '_SM2_M256': src.includes('_SM2_M256'),
  'mul -> _fastModP': src.includes('_fastModP(a * b)'),
  'sqr -> _fastModP': src.includes('_fastModP(a * a)'),
  'inv intact': src.includes('r / nr'),
  'add intact': src.includes('s >= SM2_P ? s - SM2_P : s'),
  'wNAF intact': src.includes('wNAF'),
  'verify intact': src.includes('function verify('),
};
console.log('Lines: ' + src.split('\n').length);
let allOk = true;
for (const [k, v] of Object.entries(checks)) {
  console.log('  ' + (v ? 'OK' : 'XX') + ' ' + k);
  if (!v) allOk = false;
}
process.exit(allOk ? 0 : 1);
