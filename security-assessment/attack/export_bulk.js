const fs = require('fs');
const path = require('path');

const wd = '/tmp/fibemate-exp/www/crypto/vwz';
(async () => {
  const mod = await import(path.join(wd, 'vwz_signature.js'));
  mod.initSync(fs.readFileSync(path.join(wd, 'vwz_signature_bg.wasm')));

  const out = {};
  const Ks = [2, 4, 8, 16];
  const MSGS = [
    'random message alpha 928374',
    'another message beta 112233',
    'x'.repeat(77),
  ];
  for (const k of Ks) {
    for (let seed = 1; seed <= 3; seed++) {
      const kp = mod.keygen_seeded(k, BigInt(seed * 999));
      const pk = kp.public_key();
      const pkBytes = Array.from(mod.serialize_public_key(pk));
      for (const m of MSGS) {
        const msg = new TextEncoder().encode(`k${k}s${seed}:` + m);
        // recompute target = f_pk(genuine sig)
        const realSig = mod.sign(kp.secret_key(), msg);
        const so = Array.from(mod.serialize_signature(realSig));
        const k_ = so[0];
        let o = 1;
        const w2 = [], w3 = [];
        for (let i = 0; i < k_ + 1; i++) { w2.push(so[o] | (so[o+1]<<8)); o += 2; }
        for (let i = 0; i < k_ + 1; i++) { w3.push(so[o] | (so[o+1]<<8)); o += 2; }
        const data = [];
        let p = 1;
        for (let i1 = 0; i1 < 2*k_+1; i1++) {
          const row=[];
          for (let i2 = 0; i2 < k_+1; i2++) {
            const col=[];
            for (let i3 = 0; i3 < k_+1; i3++) { col.push(pkBytes[p] | (pkBytes[p+1]<<8)); p+=2; }
            row.push(col);
          }
          data.push(row);
        }
        const t = [];
        for (let i1 = 0; i1 < 2*k_+1; i1++) {
          let s = 0;
          for (let i2 = 0; i2 < k_+1; i2++) {
            if (!w2[i2]) continue;
            for (let i3 = 0; i3 < k_+1; i3++) {
              s = (s + w2[i2]*w3[i3]%3329*data[i1][i2][i3]%3329)%3329;
            }
          }
          t.push(s);
        }
        out[`${k}_${seed}_${m.slice(0,5)}`] = { k: k_, pk: data, target: t, msg: Array.from(msg) };
      }
    }
  }
  fs.writeFileSync('/tmp/vwz_bulk.json', JSON.stringify(out));
  console.log('bulk written, entries:', Object.keys(out).length);
})();
