const fs = require('fs');
const path = require('path');
const wd = '/tmp/fibemate-exp/www/crypto/lgv2';

(async () => {
  const mod = await import(path.join(wd, 'lookingglass_v2.js'));
  mod.initSync(fs.readFileSync(path.join(wd, 'lookingglass_v2_bg.wasm')));
  const seed = 555n;

  // 1. variable-length behavior: is transform block-based (256) or full-vector?
  for (const len of [16, 64, 128, 200, 256, 512]) {
    const inp = new Uint8Array(len);
    for (let i = 0; i < len; i++) inp[i] = i & 0xff;
    try {
      const out = mod.lgv2_confuse(inp, seed);
      const round = mod.lgv2_deconfuse(out, seed);
      let ok = round.length === len;
      for (let i = 0; i < len && ok; i++) if (round[i] !== inp[i]) ok = false;
      console.log(`len=${len}: roundtrip=${ok}, out len=${out.length}`);
    } catch (e) {
      console.log(`len=${len}: ERROR ${e.message?.slice(0,60)}`);
    }
  }

  // 2. query budget: how many oracle calls to fully recover (1 base + N for permutation + 256N for sbox)
  const N = 256;
  console.log(`\nrecovery oracle budget for len=${N}: 1 (base) + ${N} (perm map) + 256*${N} (sbox) = ${1 + N + 256*N} queries`);
  console.log('total bytes of I/O: ~', ((1 + N + 256*N) * N).toLocaleString());
})();
