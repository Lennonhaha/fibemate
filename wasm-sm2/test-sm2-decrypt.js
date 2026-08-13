// SM2 KAT 解密验证：WASM pointMul + sm3Hash 组合
// 流程：S = dB·C1 = (x2,y2)，t = KDF(x2||y2, klen)，M = C2⊕t，验证 C3 = SM3(x2||M||y2)

const P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFFn;
const N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const MASK32 = 0xFFFFFFFFn;

function hex2bytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
  return b;
}
function bi2bytes(x) {
  const b = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xFFn); x >>= 8n; }
  return b;
}
function bi2limbs(x) { const l = []; for (let i = 0; i < 8; i++) { l.push(Number(x & MASK32)); x >>= 32n; } return l; }
function hex2bi(hex) { return BigInt('0x' + hex); }
function bytes2bi(b) { let x = 0n; for (let i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i]); return x; }
function bytes2hex(b) { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''); }

async function main() {
  const sm3 = await import('./build/sm3.js');
  const c = await import('./build/curve.js');
  const mk = c.mk;

  const kat = require('../packages/sm2-ref/test/kat/sm2-KAT.json');
  let pass = 0, fail = 0;

  for (const v of kat) {
    const dB = hex2bi(v.privateKey);
    const ct = v.ciphertext; // C1(128) || C3(64) || C2(rest)
    const C1x = hex2bi(ct.slice(0, 64));
    const C1y = hex2bi(ct.slice(64, 128));
    const C3 = ct.slice(128, 192);
    const C2hex = ct.slice(192);
    const C2 = hex2bytes(C2hex);
    const klen = C2.length;

    // S = dB · C1
    const x2 = c.pointMulX(mk(...bi2limbs(dB)), mk(...bi2limbs(C1x)), mk(...bi2limbs(C1y)));
    const y2 = c.pointMulY(mk(...bi2limbs(dB)), mk(...bi2limbs(C1x)), mk(...bi2limbs(C1y)));
    // limbs → BigInt → bytes
    const x2bytes = bi2bytes(BigInt.asUintN(256, Array.from(x2).reduce((acc, w, i) => acc | (BigInt(w) << BigInt(32 * i)), 0n)));
    const y2bytes = bi2bytes(BigInt.asUintN(256, Array.from(y2).reduce((acc, w, i) => acc | (BigInt(w) << BigInt(32 * i)), 0n)));

    // KDF(x2||y2, klen)
    const z = new Uint8Array(64);
    z.set(x2bytes, 0); z.set(y2bytes, 32);
    const t = new Uint8Array(klen);
    let ct_counter = 1;
    let off = 0;
    while (off < klen) {
      const ctr = new Uint8Array([(ct_counter >> 24) & 0xFF, (ct_counter >> 16) & 0xFF, (ct_counter >> 8) & 0xFF, ct_counter & 0xFF]);
      const input = new Uint8Array(68);
      input.set(z, 0); input.set(ctr, 64);
      const h = sm3.sm3Hash(input, 68);
      const n = Math.min(32, klen - off);
      t.set(h.slice(0, n), off);
      off += n; ct_counter++;
    }

    // M = C2 ⊕ t
    const M = new Uint8Array(klen);
    for (let i = 0; i < klen; i++) M[i] = C2[i] ^ t[i];

    // 验证 C3 = SM3(x2 || M || y2)
    const c3input = new Uint8Array(32 + klen + 32);
    c3input.set(x2bytes, 0); c3input.set(M, 32); c3input.set(y2bytes, 32 + klen);
    const c3calc = bytes2hex(sm3.sm3Hash(c3input, c3input.length));

    if (c3calc.toLowerCase() === C3.toLowerCase()) pass++;
    else { fail++; if (fail <= 5) console.log('FAIL #' + v.count); }
  }

  console.log('SM2 KAT 解密:', pass, 'pass /', fail, 'fail /', kat.length, 'total');
}
main().catch(err => console.error(err));
