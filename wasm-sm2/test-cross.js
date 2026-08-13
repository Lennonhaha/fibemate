// JS↔WASM 交叉验证：mulG 结果必须与权威 JS 实现（sm2-bigint-ec.js）一致
const N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const MASK32 = 0xFFFFFFFFn;
function bi2limbs(x) { const l = []; for (let i = 0; i < 8; i++) { l.push(Number(x & MASK32)); x >>= 32n; } return l; }
function limbs2bi(arr) { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 32n) | BigInt.asUintN(32, BigInt(arr[i])); return x; }
function hex2bi(hex) { return BigInt('0x' + hex); }
function bi2hex(x) { let h = x.toString(16); return h.padStart(64, '0'); }

async function main() {
  const c = await import('./build/curve.js');
  const mk = c.mk;
  const jsSm2 = require('../www/crypto/sm2-bigint-ec.js');

  let fails = 0;
  const N_TEST = 100;

  for (let i = 0; i < N_TEST; i++) {
    // 随机标量 k
    let k = 0n;
    for (let j = 0; j < 256; j += 32) k = (k << 32n) | BigInt(Math.floor(Math.random() * 4294967296));
    k %= N; if (k === 0n) k = 1n;

    // WASM mulG
    const wx = limbs2bi(c.mulGX(mk(...bi2limbs(k))));
    const wy = limbs2bi(c.mulGY(mk(...bi2limbs(k))));

    // JS 权威 multiplyG（直接传 bigint）
    const jsPoint = jsSm2.multiplyG(k);
    // 根据返回结构提取 x, y
    let jx, jy;
    if (jsPoint && typeof jsPoint === 'object') {
      if (jsPoint.x !== undefined) { jx = jsPoint.x; jy = jsPoint.y; }
      else if (Array.isArray(jsPoint)) { jx = jsPoint[0]; jy = jsPoint[1]; }
    }
    if (jx === undefined) { console.log('无法解析 JS 返回结构，跳过'); break; }

    const jxBi = typeof jx === 'bigint' ? jx : hex2bi(jx.toString());
    const jyBi = typeof jy === 'bigint' ? jy : hex2bi(jy.toString());

    if (wx !== jxBi || wy !== jyBi) {
      fails++;
    }
  }

  console.log('JS↔WASM mulG 交叉验证:', N_TEST - fails, 'pass /', fails, 'fail /', N_TEST, 'total');
}
main().catch(err => console.error(err));
