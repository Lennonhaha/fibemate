const fs = require('fs');
const path = require('path');
const wd = '/tmp/fibemate-exp/www/crypto/lgv2';

(async () => {
  const mod = await import(path.join(wd, 'lookingglass_v2.js'));
  mod.initSync(fs.readFileSync(path.join(wd, 'lookingglass_v2_bg.wasm')));
  console.log('version:', mod.lgv2_version());

  const seed = 12345n;
  const N = 256;

  // 1. tail passthrough test: all-zero input, check which bytes are non-zero in output
  const zero = new Uint8Array(N);
  const zout = mod.lgv2_confuse(zero, seed);
  let active = [];
  for (let i = 0; i < N; i++) if (zout[i] !== 0) active.push(i);
  console.log('non-zero output positions on zero input:', active.length, active.slice(0, 60));

  // 2. Affine test: is confuse(x) = A x + b (mod 256)?
  //    Check confuse(x) - confuse(0) vs confuse(y) - confuse(0)
  //    Linearity: confuse(x+y) == confuse(x)+confuse(y)-confuse(0) (mod 256)
  const x = new Uint8Array(N); for (let i=0;i<N;i++) x[i]=(i*7+3)&0xff;
  const y = new Uint8Array(N); for (let i=0;i<N;i++) y[i]=(i*13+1)&0xff;
  const cx = mod.lgv2_confuse(x, seed);
  const cy = mod.lgv2_confuse(y, seed);
  const xpy = new Uint8Array(N); for (let i=0;i<N;i++) xpy[i]=(x[i]+y[i])&0xff;
  const cxy = mod.lgv2_confuse(xpy, seed);
  let linMatch = 0, linFail = [];
  for (let i=0;i<N;i++) {
    const expect = (cx[i] + cy[i] - zout[i] + 256) & 0xff;
    if (cxy[i] === expect) linMatch++;
    else if (linFail.length<8) linFail.push([i, cxy[i], expect]);
  }
  console.log(`affine-linearity mod256: ${linMatch}/${N}`, linFail.slice(0,3));

  // 3. affine test mod 3329 (if underlying is mod 3329 but I/O bytes... check consistency)
  // 4. determinism
  const c2 = mod.lgv2_confuse(x, seed);
  let det=0; for(let i=0;i<N;i++) if(c2[i]===cx[i]) det++;
  console.log('determinism:', det, '/', N);

  // 5. seed-dependence
  const c3 = mod.lgv2_confuse(x, 99999n);
  let diff=0; for(let i=0;i<N;i++) if(c3[i]!==cx[i]) diff++;
  console.log('different seed diffs:', diff, '/', N);
})();
