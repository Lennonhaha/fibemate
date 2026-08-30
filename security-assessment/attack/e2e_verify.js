const fs = require('fs');
const path = require('path');

const wd = '/tmp/fibemate-exp/www/crypto/vwz';
(async () => {
  const mod = await import(path.join(wd, 'vwz_signature.js'));
  mod.initSync(fs.readFileSync(path.join(wd, 'vwz_signature_bg.wasm')));

  for (const k of [2, 4, 8]) {
    const forge = JSON.parse(fs.readFileSync(`/tmp/forge_k${k}.json`, 'utf8'));
    const kp = mod.keygen_seeded(k, 42n);
    const pk = kp.public_key();
    const msg = new TextEncoder().encode('third-party attack test msg k=' + k);

    // Build a VwzSignature object from forged w2/w3 via deserialize
    const buf = [];
    buf.push(forge.k);
    for (const v of forge.w2) { buf.push(v & 0xff, (v >> 8) & 0xff); }
    for (const v of forge.w3) { buf.push(v & 0xff, (v >> 8) & 0xff); }
    const sig = mod.deserialize_signature(new Uint8Array(buf));

    const ok = mod.verify(pk, msg, sig);
    console.log(`k=${k}: forged signature passes official wasm verify() = ${ok}`);

    // sanity: genuine signature still passes
    const realSig = mod.sign(kp.secret_key(), msg);
    console.log(`k=${k}: genuine sign/verify = ${mod.verify(pk, msg, realSig)}`);
  }
})();
