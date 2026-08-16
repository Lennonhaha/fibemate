const fs = require('fs');
const path = require('path');
const wd = '/tmp/fibemate-exp/www/crypto/lgv2';

(async () => {
  const mod = await import(path.join(wd, 'lookingglass_v2.js'));
  mod.initSync(fs.readFileSync(path.join(wd, 'lookingglass_v2_bg.wasm')));
  const seed = 777n;
  const N = 256;

  const base = new Uint8Array(N);
  for (let i = 0; i < N; i++) base[i] = i & 0xff;
  const cbase = mod.lgv2_confuse(base, seed);

  // single-byte perturbation: change byte j, observe which output bytes change
  const perturbedOutputs = {};
  for (let j = 0; j < N; j++) {
    const inp = base.slice();
    inp[j] = (inp[j] + 1) & 0xff;
    const cout = mod.lgv2_confuse(inp, seed);
    const changed = [];
    for (let i = 0; i < N; i++) if (cout[i] !== cbase[i]) changed.push(i);
    if (!perturbedOutputs[changed.length]) perturbedOutputs[changed.length] = 0;
    perturbedOutputs[changed.length]++;
  }
  console.log('distribution of #output bytes changed per single-byte input flip:');
  const keys = Object.keys(perturbedOutputs).map(Number).sort((a,b)=>a-b);
  for (const k of keys) console.log(`  ${k} bytes changed: ${perturbedOutputs[k]} input positions`);

  // check if any input byte affects exactly 1 output byte (per-byte independent)
  const oneToMany = keys.filter(k => k === 1).length;
  console.log('inputs affecting exactly 1 output byte:', perturbedOutputs[1] || 0, '/', N);

  // also test mod-256 linearity of a single byte as function of that byte (S-box vs linear)
  const j = 5;
  const vals = [];
  for (let v = 0; v < 256; v++) {
    const inp = base.slice();
    inp[j] = v;
    const cout = mod.lgv2_confuse(inp, seed);
    vals.push(cout);
  }
  // check if byte j mapping is a permutation (bijective) on some output byte
  const outPos = {}; // output byte index -> set of values
  for (let v = 0; v < 256; v++) {
    for (let i = 0; i < N; i++) {
      if (vals[v][i] !== cbase[i]) { // changed bytes depend on j
        if (!outPos[i]) outPos[i] = new Set();
        outPos[i].add(vals[v][i]);
      }
    }
  }
  let bijective = [];
  for (const i in outPos) if (outPos[i].size === 256) bijective.push(Number(i));
  console.log(`varying input byte ${j}: output bytes that become bijective permutations: ${bijective.slice(0,10)} (count=${bijective.length})`);
})();
