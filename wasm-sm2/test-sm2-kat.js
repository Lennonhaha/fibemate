// SM2 KAT 验签：用 WASM sm3Hash + sm2VerifyCore 验证 100 条 KAT 签名
// 流程：ZA = SM3(ENTL||ID||a||b||xG||yG||xA||yA)，e = SM3(ZA||M)，verify(px,py,e,r,s)

const P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFFn;
const N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const A = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFCn;
const B = 0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93n;
const GX = 0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7n;
const GY = 0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0n;
const MASK32 = 0xFFFFFFFFn;
const ID = "1234567812345678"; // gmssl 默认 userId

function hex2bytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
  return b;
}
function bi2bytes(x) { // 32 字节大端
  const b = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xFFn); x >>= 8n; }
  return b;
}
function bi2limbs(x) { const l = []; for (let i = 0; i < 8; i++) { l.push(Number(x & MASK32)); x >>= 32n; } return l; }
function hex2bi(hex) { return BigInt('0x' + hex); }

// 组装 ZA 的原始字节（不含 M）
function buildZA(pubX, pubY) {
  const idBytes = new TextEncoder().encode(ID);
  const entl = idBytes.length * 8; // 128
  const parts = [];
  parts.push(new Uint8Array([entl >> 8, entl & 0xFF])); // ENTL
  parts.push(idBytes);
  parts.push(bi2bytes(A));
  parts.push(bi2bytes(B));
  parts.push(bi2bytes(GX));
  parts.push(bi2bytes(GY));
  parts.push(bi2bytes(pubX));
  parts.push(bi2bytes(pubY));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

async function main() {
  const sm3 = await import('./build/sm3.js');
  const sm2 = await import('./build/sm2.js');
  const c = await import('./build/curve.js');
  const mk = c.mk;

  const kat = require('../packages/sm2-ref/test/kat/sm2-KAT.json');
  let pass = 0, fail = 0;

  for (const v of kat) {
    const pub = v.publicKey; // 04 || X(64) || Y(64)
    const px = hex2bi(pub.slice(2, 66));
    const py = hex2bi(pub.slice(66, 130));

    // 计算 ZA
    const zaBytes = buildZA(px, py);
    const za = sm3.sm3Hash(zaBytes, zaBytes.length); // 32 字节

    // e = SM3(ZA || M)
    const mBytes = hex2bytes(v.message);
    const zaM = new Uint8Array(32 + mBytes.length);
    zaM.set(za, 0);
    zaM.set(mBytes, 32);
    const eBytes = sm3.sm3Hash(zaM, zaM.length);
    // e 转 BigInt（大端 32 字节）
    let e = 0n;
    for (let i = 0; i < 32; i++) e = (e << 8n) | BigInt(eBytes[i]);
    e %= N;

    // 解析 r, s（signature 128 hex = r(64) + s(64)）
    const sig = v.signature;
    const r = hex2bi(sig.slice(0, 64));
    const s = hex2bi(sig.slice(64, 128));

    // 验签
    const res = sm2.sm2VerifyCore(
      mk(...bi2limbs(px)), mk(...bi2limbs(py)),
      mk(...bi2limbs(e)), mk(...bi2limbs(r)), mk(...bi2limbs(s))
    );

    if (res === 1) pass++;
    else { fail++; if (fail <= 5) console.log('FAIL #' + v.count + ' r=0x' + r.toString(16).slice(0, 16)); }
  }

  console.log('SM2 KAT 验签:', pass, 'pass /', fail, 'fail /', kat.length, 'total');
}
main().catch(err => console.error(err));
