const fs = require('fs');
const path = require('path');
const wd = '/tmp/fibemate-exp/www/crypto/lgv2';

(async () => {
  const mod = await import(path.join(wd, 'lookingglass_v2.js'));
  mod.initSync(fs.readFileSync(path.join(wd, 'lookingglass_v2_bg.wasm')));
  const seed = 555n;
  const N = 64;

  const base = new Uint8Array(N);
  const cbase = mod.lgv2_confuse(base, seed);

  const affected = new Map();
  for (let j = 0; j < N; j++) {
    const inp = base.slice(); inp[j] = 1;
    const cout = mod.lgv2_confuse(inp, seed);
    const changed = [];
    for (let i = 0; i < N; i++) if (cout[i] !== cbase[i]) changed.push(i);
    affected.set(j, changed);
  }
  let oneEach = true;
  for (const [j, ch] of affected) if (ch.length !== 1) oneEach = false;
  console.log(`len=${N}: each input byte affects exactly 1 output byte = ${oneEach}`);

  if (oneEach) {
    const outPos = {}; const sbox = {};
    for (const [j, [o]] of affected) {
      outPos[j] = o;
      const tbl = new Array(256);
      for (let v = 0; v < 256; v++) {
        const inp = base.slice(); inp[j] = v;
        tbl[v] = mod.lgv2_confuse(inp, seed)[o];
      }
      sbox[j] = tbl;
    }
    const invPos = {};
    for (const [j, o] of Object.entries(outPos)) invPos[o] = j;
    let ok = 0, total = 0;
    for (let t = 0; t < 50; t++) {
      const rand = new Uint8Array(N);
      for (let i = 0; i < N; i++) rand[i] = (Math.random()*256)|0;
      const cout = mod.lgv2_confuse(rand, seed);
      const rec = new Uint8Array(N);
      for (let o = 0; o < N; o++) rec[invPos[o]] = sbox[invPos[o]][cout[o]];
      // need inverse: rec[j] from y[o]. Wait: y[o]=sbox[j][x[j]]. so x[j] = invsbox[j][y[o]].
      total += N;
      for (let i = 0; i < N; i++) {
        const inv = new Array(256);
        for (let v = 0; v < 256; v++) inv[sbox[i][v]] = v;
        const o = outPos[i];
        if (inv[cout[o]] === rand[i]) ok++;
      }
    }
    console.log(`len=${N}: inverse deobfuscation accuracy = ${(ok/total*100).toFixed(2)}%`);
  }
})();
