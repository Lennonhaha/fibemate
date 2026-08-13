// curve 层验证：mulGX(1) 应 = Gx，mulGX(2) 应 = 2G.x
import { mulGX, mulGY, mk } from './build/curve.js';

const P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFFn;
const A = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFCn;
const B = 0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93n;
const Gx = 0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7n;
const Gy = 0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0n;

const M32 = 0xFFFFFFFFn;
function arrToBig(a) { let r=0n; for(let i=7;i>=0;i--) r=(r<<32n)|BigInt(a[i]); return r; }
function bigToArr(b) { const a=new Array(8); for(let i=0;i<8;i++){a[i]=BigInt(b&M32);b>>=32n;} return a; }
function kArr(n) { return bigToArr(n); }

// 点加法（affine，BigInt oracle）
function pointAdd(x1,y1,x2,y2) {
  if (x1 === null) return [x2,y2];
  if (x2 === null) return [x1,y1];
  if (x1 === x2 && y1 === y2) return pointDouble(x1,y1);
  const lam = ((y2-y1) * modInv((x2-x1+P)%P, P)) % P;
  let x3 = (lam*lam - x1 - x2) % P; x3 = (x3+P)%P;
  let y3 = (lam*(x1-x3) - y1) % P; y3 = (y3+P)%P;
  return [x3,y3];
}
function pointDouble(x1,y1) {
  const lam = ((3n*x1*x1 + A) * modInv(2n*y1, P)) % P;
  let x3 = (lam*lam - 2n*x1) % P; x3=(x3+P)%P;
  let y3 = (lam*(x1-x3) - y1) % P; y3=(y3+P)%P;
  return [x3,y3];
}
function modInv(a, m) {
  // 扩展欧几里得
  let [t, newt] = [0n, 1n];
  let [r, newr] = [m, a];
  while (newr !== 0n) {
    const q = r / newr;
    [t, newt] = [newt, t - q*newt];
    [r, newr] = [newr, r - q*newr];
  }
  if (t < 0n) t += m;
  return t;
}
function scalarMul(k, px, py) {
  let r = null;
  let p = [px, py];
  while (k > 0n) {
    if (k & 1n) r = r === null ? p : pointAdd(r[0], r[1], p[0], p[1]);
    p = pointDouble(p[0], p[1]);
    k >>= 1n;
  }
  return r;
}

// 测试 mulGX(1..10)
let pass=0, fail=0;
for (let k = 1n; k <= 10n; k++) {
  const [ox, oy] = scalarMul(k, Gx, Gy);
  const wx = arrToBig(mulGX(kArr(k)));
  const wy = arrToBig(mulGY(kArr(k)));
  if (wx === ox && wy === oy) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL k=${k}:`);
    console.log(`  x: wasm=${wx.toString(16).padStart(64,'0')}`);
    console.log(`     ref =${ox.toString(16).padStart(64,'0')}`);
    console.log(`  y: wasm=${wy.toString(16).padStart(64,'0')}`);
    console.log(`     ref =${oy.toString(16).padStart(64,'0')}`);
  }
}
console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail>0?1:0);
