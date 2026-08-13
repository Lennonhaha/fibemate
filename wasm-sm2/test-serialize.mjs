// 序列化/反序列化往返验证：32字节大端 hex ↔ BigInt ↔ limbs 往返一致
const MASK32 = 0xFFFFFFFFn;

function bi2bytes(x) { // 32 字节大端
  const b = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xFFn); x >>= 8n; }
  return b;
}
function bytes2bi(b) { let x = 0n; for (let i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i]); return x; }
function bi2hex(x) { return x.toString(16).padStart(64, '0'); }
function hex2bi(hex) { return BigInt('0x' + hex); }
function bi2limbs(x) { const l = []; for (let i = 0; i < 8; i++) { l.push(Number(x & MASK32)); x >>= 32n; } return l; }
function limbs2bi(arr) { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 32n) | BigInt(arr[i]); return x; }

let fails = 0;
const N_TEST = 1000;
for (let i = 0; i < N_TEST; i++) {
  let x = 0n;
  for (let j = 0; j < 256; j += 32) x = (x << 32n) | BigInt(Math.floor(Math.random() * 4294967296));

  // bi2bytes -> bytes2bi 往返
  if (bytes2bi(bi2bytes(x)) !== x) { fails++; if (fails <= 2) console.log('bytes 往返 FAIL:', x.toString(16)); }

  // bi2hex -> hex2bi 往返
  if (hex2bi(bi2hex(x)) !== x) { fails++; if (fails <= 2) console.log('hex 往返 FAIL:', x.toString(16)); }

  // bi2limbs -> limbs2bi 往返
  if (limbs2bi(bi2limbs(x)) !== x) { fails++; if (fails <= 2) console.log('limbs 往返 FAIL:', x.toString(16)); }
}

console.log(`序列化往返验证: ${N_TEST - fails} pass / ${fails} fail / ${N_TEST} total`);
process.exit(fails === 0 ? 0 : 1);
