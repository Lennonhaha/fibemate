// SM2 签名/验签端到端测试：WASM vs BigInt 参考
const P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFFn;
const N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const A = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFCn;
const GX = 0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7n;
const GY = 0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0n;
const MASK32 = 0xFFFFFFFFn;
function mod(a, m) { const r = a % m; return r < 0n ? r + m : r; }
function inv(a, m) { a = mod(a, m); let t = 0n, newt = 1n, r = m, newr = a; while (newr !== 0n) { const q = r / newr; const tn = t - q * newt; t = newt; newt = tn; const rn = r - q * newr; r = newr; newr = rn; } if (r > 1n) return 0n; if (t < 0n) t += m; return t; }
function bi2limbs(x) { const l = []; for (let i = 0; i < 8; i++) { l.push(Number(x & MASK32)); x >>= 32n; } return l; }
function limbs2bi(arr) { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 32n) | BigInt.asUintN(32, BigInt(arr[i])); return x; }
function pointAdd(P1, P2) {
  if (P1 === null) return P2;
  if (P2 === null) return P1;
  const x1 = P1[0], y1 = P1[1], x2 = P2[0], y2 = P2[1];
  if (x1 === x2 && (y1 + y2) % P === 0n) return null;
  let lam;
  if (x1 === x2 && y1 === y2) lam = mod((3n * x1 * x1 + A) * inv(2n * y1, P), P);
  else lam = mod((y2 - y1) * inv(x2 - x1, P), P);
  const x3 = mod(lam * lam - x1 - x2, P);
  const y3 = mod(lam * (x1 - x3) - y1, P);
  return [x3, y3];
}
function pointMul(k, Pnt) {
  let result = null, addend = Pnt;
  while (k > 0n) { if (k & 1n) result = pointAdd(result, addend); addend = pointAdd(addend, addend); k >>= 1n; }
  return result;
}

async function main() {
  const e = await import('./build/sm2.js');
  const c = await import('./build/curve.js');
  const mk = c.mk;

  let fails = 0;
  const N_TEST = 10;
  for (let i = 0; i < N_TEST; i++) {
    let dA = 0n, eHash = 0n, k = 0n;
    for (let j = 0; j < 256; j += 32) {
      dA = (dA << 32n) | BigInt(Math.floor(Math.random() * 4294967296));
      eHash = (eHash << 32n) | BigInt(Math.floor(Math.random() * 4294967296));
      k = (k << 32n) | BigInt(Math.floor(Math.random() * 4294967296));
    }
    dA %= N; if (dA === 0n) dA = 1n;
    eHash %= N;
    k %= N; if (k === 0n) k = 1n;

    const PA = pointMul(dA, [GX, GY]);

    const out = e.sm2SignCore(mk(...bi2limbs(dA)), mk(...bi2limbs(eHash)), mk(...bi2limbs(k)));
    const rW = limbs2bi(out.slice(0, 8));
    const sW = limbs2bi(out.slice(8, 16));

    const x1 = pointMul(k, [GX, GY])[0] % N;
    const rRef = (eHash + x1) % N;
    const sRef = (inv(dA + 1n, N) * mod(k - rRef * dA, N)) % N;

    if (rW !== rRef || sW !== sRef) {
      fails++;
      if (fails <= 3) {
        console.log('sign FAIL');
        console.log('  r: wasm=' + rW.toString(16));
        console.log('  r: ref =' + rRef.toString(16));
        console.log('  s: wasm=' + sW.toString(16));
        console.log('  s: ref =' + sRef.toString(16));
      }
    } else {
      const v = e.sm2VerifyCore(
        mk(...bi2limbs(PA[0])), mk(...bi2limbs(PA[1])),
        mk(...bi2limbs(eHash)), mk(...bi2limbs(rW)), mk(...bi2limbs(sW))
      );
      if (v !== 1) { fails++; console.log('verify FAIL on valid sig'); }
    }
  }
  console.log('SM2 签名/验签 失败', fails, '/', N_TEST);
}
main().catch(err => console.error(err));
