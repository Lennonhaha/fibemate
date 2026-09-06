// Extract k=2 real attack data from evidence JSONs into a JS data snippet
const fs = require('fs');
const keys = JSON.parse(fs.readFileSync('security-assessment/evidence/vwz_keys.json', 'utf8'));
const forge = JSON.parse(fs.readFileSync('security-assessment/evidence/forge_k2.json', 'utf8'));
const k2 = keys['2'];
const data = {
  k: 2,
  n: k2.pk.length,
  m: k2.pk[0].length,
  pk: k2.pk,
  target: k2.target,
  msg: k2.msg,
  validSig: k2.validSig,
  verifySelf: k2.verifySelf,
  w2: forge.w2,
  w3: forge.w3
};
// also compute forged eval to verify target match (transplant attack logic inline)
const Q = 3329;
function mul(a, b) { return (a * b) % Q; }
// verify: result[i1] = sum_{i2,i3} pk[i1][i2][i3]*w2[i2]*w3[i3]
const result = [];
for (let i1 = 0; i1 < data.n; i1++) {
  let s = 0;
  for (let i2 = 0; i2 < data.m; i2++)
    for (let i3 = 0; i3 < data.m; i3++)
      s = (s + data.pk[i1][i2][i3] * data.w2[i2] * data.w3[i3]) % Q;
  result.push(s);
}
data.forgedEval = result;
data.forgeMatch = JSON.stringify(result) === JSON.stringify(data.target);
console.log('k=2 target:', JSON.stringify(k2.target));
console.log('k=2 forgedEval:', JSON.stringify(result));
console.log('forgeMatch:', data.forgeMatch);
// rank-1 factor extraction demo data: u[i1], v[i1] per slice (from attack step 1)
const u = [], v = [];
function inv(a) { let r = 1, b = a, e = Q - 2; while (e) { if (e & 1) r = (r * b) % Q; b = (b * b) % Q; e >>= 1; } return r; }
for (let i1 = 0; i1 < data.n; i1++) {
  const psi = data.pk[i1];
  let l0 = -1;
  for (let l = 0; l < data.m; l++) { if (psi.some((row) => row[l] % Q !== 0)) { l0 = l; break; } }
  const uu = psi.map((row) => row[l0] % Q);
  const j0 = uu.findIndex((x) => x !== 0);
  const iv = inv(uu[j0]);
  const vv = psi[j0].map((x) => (x % Q) * iv % Q);
  u.push(uu); v.push(vv);
}
// reconstruct check: u[i1][j]*v[i1][l] == pk[i1][j][l]
let reconOk = true;
for (let i1 = 0; i1 < data.n; i1++)
  for (let j = 0; j < data.m; j++)
    for (let l = 0; l < data.m; l++)
      if ((u[i1][j] * v[i1][l]) % Q !== data.pk[i1][j][l]) { reconOk = false; }
data.uFactors = u;
data.vFactors = v;
data.rank1ReconOk = reconOk;
console.log('rank-1 reconstruction ok:', reconOk);
const out = {
  _comment: 'Real attack data extracted from security-assessment/evidence (2026-09-06). rank-1 VWZ k=2.',
  ...data
};
fs.writeFileSync('security-assessment/viz/_vwz-attack-data.js', 'window.VWZ_ATTACK_DATA = ' + JSON.stringify(out, null, 1) + ';\n', 'utf8');
console.log('written security-assessment/viz/_vwz-attack-data.js', fs.statSync('security-assessment/viz/_vwz-attack-data.js').size, 'bytes');
