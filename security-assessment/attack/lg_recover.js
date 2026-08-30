const fs = require('fs');
const path = require('path');
const wd = '/tmp/fibemate-exp/www/crypto/lgv2';

(async () => {
  const mod = await import(path.join(wd, 'lookingglass_v2.js'));
  mod.initSync(fs.readFileSync(path.join(wd, 'lookingglass_v2_bg.wasm')));

  const results = {};
  for (const seed of [777n, 0n, 123456789n, 2n ** 40n + 999n]) {
    const N = 256;
    const base = new Uint8Array(N);
    for (let i = 0; i < N; i++) base[i] = 0;
    const cbase = mod.lgv2_confuse(base, seed);

    // Phase 1: recover position permutation sigma and per-byte S-boxes
    // step1: map input byte j -> output byte(s) it affects (relative to base output)
    const affected = new Map();
    for (let j = 0; j < N; j++) {
      const inp = base.slice(); inp[j] = 1;
      const cout = mod.lgv2_confuse(inp, seed);
      const changed = [];
      for (let i = 0; i < N; i++) if (cout[i] !== cbase[i]) changed.push(i);
      affected.set(j, changed);
    }
    // verify exactly one output per input, and permutation
    const sigOut = new Map();
    let ok = true;
    for (const [j, ch] of affected) {
      if (ch.length !== 1) { ok = false; console.log('seed', seed, 'input', j, 'affects', ch.length, 'outputs'); break; }
      const o = ch[0];
      if (sigOut.has(o)) { ok = false; console.log('collision: two inputs map to output', o); break; }
      sigOut.set(o, j);
    }
    if (!ok) { results[seed.toString()] = { mode: 'coupled', detail: 'not simple per-byte permutation' }; continue; }

    // Phase 2: for each input byte j -> output o=sigOut^{-1}(j), scan S-box by setting x[j]=v
    const sbox = {}; // j -> array[256] of output value at position o
    const outPos = {}; // j -> o
    for (const [j, o] of affected) {
      outPos[j] = o;
      const tbl = new Array(256);
      for (let v = 0; v < 256; v++) {
        const inp = base.slice(); inp[j] = v;
        const cout = mod.lgv2_confuse(inp, seed);
        tbl[v] = cout[o];
      }
      // verify bijective
      const uniq = new Set(tbl);
      if (uniq.size !== 256) { ok = false; console.log('sbox j', j, 'not bijective:', uniq.size); break; }
      sbox[j] = tbl;
    }
    if (!ok) { results[seed.toString()] = { mode: 'sbox-not-bijective' }; continue; }

    // Phase 3: verify recovered model predicts confuse() for random inputs
    // model: y[o] = sbox[j][x[j]] where o = outPos[j] (permutation, input byte j -> output byte o)
    // Build inverse: j = input index that lands at output o.
    const invPos = {}; // o -> j
    for (const [j, o] of Object.entries(outPos)) invPos[o] = j;

    let modelMatch = 0, total = 0;
    for (let trial = 0; trial < 50; trial++) {
      const rand = new Uint8Array(N);
      for (let i = 0; i < N; i++) rand[i] = (Math.random() * 256) | 0;
      const cout = mod.lgv2_confuse(rand, seed);
      const predict = new Uint8Array(N);
      for (let o = 0; o < N; o++) {
        const j = invPos[o];
        predict[o] = sbox[j][rand[j]];
      }
      total += N;
      for (let i = 0; i < N; i++) if (predict[i] === cout[i]) modelMatch++;
    }
    const acc = modelMatch / total;
    results[seed.toString()] = { mode: 'per-byte-SBOX', accuracy: acc, outputPerm: outPos };
    console.log(`seed=${seed}: recovered per-byte S-box model accuracy on random inputs = ${(acc*100).toFixed(2)}%`);

    // Phase 4: full deobfuscator (inverse), verify roundtrip
    // inverse sbox: inv_sbox[j][val] = v s.t. sbox[j][v]==val
    const invSbox = {};
    for (const [j, tbl] of Object.entries(sbox)) {
      const it = new Array(256);
      for (let v = 0; v < 256; v++) it[tbl[v]] = v;
      invSbox[j] = it;
    }
    // deobfuscate(confused): for output o, j=invPos[o], x[j] = invSbox[j][y[o]]
    let deok = 0, detotal = 0;
    for (let trial = 0; trial < 50; trial++) {
      const rand = new Uint8Array(N);
      for (let i = 0; i < N; i++) rand[i] = (Math.random() * 256) | 0;
      const cout = mod.lgv2_confuse(rand, seed);
      const recovered = new Uint8Array(N);
      for (let o = 0; o < N; o++) {
        const j = invPos[o];
        recovered[j] = invSbox[j][cout[o]];
      }
      detotal += N;
      for (let i = 0; i < N; i++) if (recovered[i] === rand[i]) deok++;
    }
    const deacc = deok / detotal;
    console.log(`seed=${seed}: inverse-model deobfuscation accuracy = ${(deacc*100).toFixed(2)}%`);
    results[seed.toString()].deobfAcc = deacc;
  }
  fs.writeFileSync('/tmp/lg_recovery.json', JSON.stringify(results, (k,v)=>typeof v==='bigint'?v.toString():v));
  console.log('\n=== SUMMARY ===');
  for (const [s, r] of Object.entries(results)) {
    console.log(`seed=${s}: ${r.mode}, accuracy=${(r.accuracy*100).toFixed(2)}%, deobf=${(r.deobfAcc*100).toFixed(2)}%`);
  }
})();
