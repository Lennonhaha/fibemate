const {generateKeypair, encapsulate, decapsulate} = require('./packages/pqc-kem/src/ml-kem-768.js');

const t = Date.now();
let fail = 0;
for (let i = 0; i < 500; i++) {
  const kp = generateKeypair();
  const enc = encapsulate(kp.publicKey);
  const ss = decapsulate(kp.secretKey, enc.ciphertext);
  let eq = 0;
  for (let j = 0; j < ss.length; j++) eq |= ss[j] ^ enc.sharedSecret[j];
  if (eq) fail++;
}
console.log(`KAT 500: ${500-fail}/500 ${fail ? 'FAIL' : 'OK'} (${Date.now()-t}ms)`);
