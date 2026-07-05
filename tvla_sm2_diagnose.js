// SM2 TVLA leak diagnosis — micro-benchmark of individual operations
// Identifies which sub-operations of verify/decrypt leak

const sm2 = require("/opt/fibemate-full/sm2-bigint-ec");
const sm = require("sm-crypto").sm2;
const crypto = require("crypto");

const N = 1000, WARMUP = 100, THRESH = 4.5, POOL = 50;

function hrt_us(t) { return Number(t) / 1000; }
function sample(fn, warmup, n) {
    for (let i = 0; i < warmup; i++) fn();
    const ts = [];
    for (let i = 0; i < n; i++) {
        const s = process.hrtime.bigint();
        fn();
        ts.push(hrt_us(process.hrtime.bigint() - s));
    }
    return ts;
}
function ttest(a, b) {
    const na = a.length, nb = b.length;
    const ma = a.reduce((s,v)=>s+v,0)/na;
    const mb = b.reduce((s,v)=>s+v,0)/nb;
    const va = a.reduce((s,v)=>s+(v-ma)**2,0)/(na-1);
    const vb = b.reduce((s,v)=>s+(v-mb)**2,0)/(nb-1);
    const se = Math.sqrt(va/na + vb/nb);
    const t = Math.abs(ma - mb) / se;
    const cv_a = Math.sqrt(va)/ma*100, cv_b = Math.sqrt(vb)/mb*100;
    return { t: +t.toFixed(2), ma: +ma.toFixed(1), mb: +mb.toFixed(1), cv_a: +cv_a.toFixed(1), cv_b: +cv_b.toFixed(1), ok: t <= THRESH };
}

console.log("Pre-generating pools (size=" + POOL + ")...");
const pools = [];
for (let i = 0; i < POOL; i++) {
    const kp = sm2.generateKeyPair();
    const pubHex = sm2.publicKeyToHex(kp.publicKey);
    const msg = crypto.randomBytes(32).toString('hex');
    const msgHash = BigInt('0x' + crypto.createHash('sha256').update(Buffer.from(msg,'hex')).digest('hex'));
    const sig = sm2.sign(kp.privateKey, msgHash);
    const pt = "hello world " + i;
    const enc = sm2.encrypt(pubHex, pt);
    pools.push({ kp, pubHex, msg, msgHash, sig, pt, enc });
}
console.log("done.\n");
const FI = pools[0];

// ===== BigInt verify diagnostics =====
console.log("=== BigInt verify diagnostics ===");
// Full verify
{
    const f = () => sm2.verify(FI.pubHex, FI.msgHash, FI.sig.r, FI.sig.s);
    const r = () => { const p = pools[Math.floor(Math.random()*POOL)]; return sm2.verify(p.pubHex, p.msgHash, p.sig.r, p.sig.s); };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  verify(full)       |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// pointMul(s,G) only — scalar varies
{
    const G = sm2.G;
    const s = BigInt('0x' + FI.sig.s);
    const f = () => sm2._toA(sm2._toJ(sm2.pointMultiply(s, G)));
    const r = () => { const p = pools[Math.floor(Math.random()*POOL)]; const ss = BigInt('0x'+p.sig.s); sm2._toA(sm2._toJ(sm2.pointMultiply(ss, G))); };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  verify[pointMul_sG] |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// pointMul(t,PA) only — both scalar and point vary
{
    const rv = BigInt('0x' + FI.sig.r);
    const sv = BigInt('0x' + FI.sig.s);
    const PA = sm2.makePoint(BigInt('0x'+FI.pubHex.slice(2,66)), BigInt('0x'+FI.pubHex.slice(66,130)));
    const t = (sm2.field.addN(FI.msgHash, rv) + sv) % sm2.SM2_N;
    const f = () => { sm2._toA(sm2._toJ(sm2.pointMultiply(t, PA))); };
    const r = () => { 
        const p = pools[Math.floor(Math.random()*POOL)];
        const rv2=BigInt('0x'+p.sig.r), sv2=BigInt('0x'+p.sig.s);
        const PA2=sm2.makePoint(BigInt('0x'+p.pubHex.slice(2,66)), BigInt('0x'+p.pubHex.slice(66,130)));
        const t2=(sm2.field.addN(p.msgHash, rv2) + sv2) % sm2.SM2_N;
        sm2._toA(sm2._toJ(sm2.pointMultiply(t2, PA2)));
    };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  verify[pointMul_tPA] |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// jDbl microbench — fixed vs varying point
{
    const rv=BigInt('0x'+FI.sig.r), sv=BigInt('0x'+FI.sig.s);
    const PA=sm2.makePoint(BigInt('0x'+FI.pubHex.slice(2,66)), BigInt('0x'+FI.pubHex.slice(66,130)));
    const t=(sm2.field.addN(FI.msgHash, rv) + sv) % sm2.SM2_N;
    const Pj = sm2._toJ(sm2.pointMultiply(t, PA));
    const f = () => { let p = Pj; for(let i=0;i<10;i++) p = sm2._jDbl(p); };
    const r = () => {
        const p= pools[Math.floor(Math.random()*POOL)];
        const PA2=sm2.makePoint(BigInt('0x'+p.pubHex.slice(2,66)),BigInt('0x'+p.pubHex.slice(66,130)));
        const t2=(sm2.field.addN(p.msgHash, BigInt('0x'+p.sig.r))+BigInt('0x'+p.sig.s))%sm2.SM2_N;
        let q = sm2._toJ(sm2.pointMultiply(t2, PA2));
        for(let i=0;i<10;i++) q = sm2._jDbl(q);
    };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  verify[jDbl x10]    |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// jAddMixed microbench — fixed vs varying
{
    const rv=BigInt('0x'+FI.sig.r), sv=BigInt('0x'+FI.sig.s), G=sm2.G;
    const sG_J=sm2._toJ(sm2.pointMultiply(sv, G));
    const PA=sm2.makePoint(BigInt('0x'+FI.pubHex.slice(2,66)),BigInt('0x'+FI.pubHex.slice(66,130)));
    const t=(sm2.field.addN(FI.msgHash, rv)+sv)%sm2.SM2_N;
    const tPA_J=sm2._toJ(sm2.pointMultiply(t, PA));
    const f=()=>sm2._jAddMixed(tPA_J, PA);
    const r=()=>{
        const p=pools[Math.floor(Math.random()*POOL)];
        const PA2=sm2.makePoint(BigInt('0x'+p.pubHex.slice(2,66)),BigInt('0x'+p.pubHex.slice(66,130)));
        const t2=(sm2.field.addN(p.msgHash,BigInt('0x'+p.sig.r))+BigInt('0x'+p.sig.s))%sm2.SM2_N;
        const tPA_J2=sm2._toJ(sm2.pointMultiply(t2,PA2));
        sm2._jAddMixed(tPA_J2, PA2);
    };
    const fixed=sample(f, WARMUP, N);
    const random=sample(r, WARMUP, N);
    const res=ttest(fixed, random);
    console.log("  verify[jAddMixed]   |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// Parsing+validation only
{
    const f=()=>{
        const rv=BigInt('0x'+FI.sig.r), sv=BigInt('0x'+FI.sig.s);
        if(rv<=0n||rv>=sm2.SM2_N||sv<=0n||sv>=sm2.SM2_N)return false;
        if((rv+sv)%sm2.SM2_N===0n)return false;
        const h=FI.pubHex;
        if(!h.startsWith('04')||h.length!==130)return false;
        sm2.makePoint(BigInt('0x'+h.slice(2,66)),BigInt('0x'+h.slice(66,130)));
    };
    const r=()=>{ 
        const p=pools[Math.floor(Math.random()*POOL)];
        const rv=BigInt('0x'+p.sig.r), sv=BigInt('0x'+p.sig.s);
        if(rv<=0n||rv>=sm2.SM2_N||sv<=0n||sv>=sm2.SM2_N)return;
        if((rv+sv)%sm2.SM2_N===0n)return;
        const h=p.pubHex;
        if(!h.startsWith('04')||h.length!==130)return;
        sm2.makePoint(BigInt('0x'+h.slice(2,66)),BigInt('0x'+h.slice(66,130)));
    };
    const fixed=sample(f, WARMUP, N);
    const random=sample(r, WARMUP, N);
    const res=ttest(fixed, random);
    console.log("  verify[parse+check] |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}

// ===== BigInt decrypt diagnostics =====
console.log("\n=== BigInt decrypt diagnostics ===");
// Full decrypt
{
    const f = () => sm2.decrypt(FI.kp.privateKey, FI.enc.c1, FI.enc.c2);
    const r = () => { const p = pools[Math.floor(Math.random()*POOL)]; return sm2.decrypt(p.kp.privateKey, p.enc.c1, p.enc.c2); };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  decrypt(full)       |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// pointMul(d,C1) — same d, different C1
{
    const d = FI.kp.privateKey;
    const C1 = sm2.makePoint(BigInt('0x'+FI.enc.c1.slice(2,66)), BigInt('0x'+FI.enc.c1.slice(66,130)));
    const f = () => sm2._toA(sm2._toJ(sm2.pointMultiply(d, C1)));
    const r = () => { 
        const p = pools[Math.floor(Math.random()*POOL)];
        const C1r = sm2.makePoint(BigInt('0x'+p.enc.c1.slice(2,66)), BigInt('0x'+p.enc.c1.slice(66,130)));
        sm2._toA(sm2._toJ(sm2.pointMultiply(d, C1r)));
    };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  decrypt[pm_dC1_sameD]|t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// pointMul where both scalar and point vary (different keypair)
{
    const C1 = sm2.makePoint(BigInt('0x'+FI.enc.c1.slice(2,66)), BigInt('0x'+FI.enc.c1.slice(66,130)));
    const d = FI.kp.privateKey;
    const f = () => sm2._toA(sm2._toJ(sm2.pointMultiply(d, C1)));
    const r = () => {
        const p = pools[Math.floor(Math.random()*POOL)];
        const C1r = sm2.makePoint(BigInt('0x'+p.enc.c1.slice(2,66)), BigInt('0x'+p.enc.c1.slice(66,130)));
        sm2._toA(sm2._toJ(sm2.pointMultiply(p.kp.privateKey, C1r)));
    };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  decrypt[pm_dC1_bothV]|t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
// XOR only
{
    const dC1_x = sm2.field.mul(FI.kp.privateKey, BigInt('0x' + FI.enc.c1.slice(2,66)));
    const keyHex = sm2.bigIntToHex(dC1_x);
    const key = Buffer.from(keyHex, 'hex');
    const ct = Buffer.from(FI.enc.c2, 'hex');
    const f = () => { const pt = Buffer.alloc(ct.length); for (let i = 0; i < ct.length; i++) pt[i] = ct[i] ^ key[i % key.length]; };
    const r = () => {
        const p = pools[Math.floor(Math.random()*POOL)];
        const ct2 = Buffer.from(p.enc.c2, 'hex');
        const pt = Buffer.alloc(ct2.length);
        for (let i = 0; i < ct2.length; i++) pt[i] = ct2[i] ^ key[i % key.length];
    };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  decrypt[XOR only]    |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}

// ===== jsbn diagnostics =====
console.log("\n=== jsbn (sm-crypto) diagnostics ===");
{
    const f = () => sm.doVerifySignature(FI.sig.r + FI.sig.s.slice(2), FI.msg, FI.pubHex);
    const r = () => { const p = pools[Math.floor(Math.random()*POOL)]; sm.doVerifySignature(p.sig.r + p.sig.s.slice(2), p.msg, p.pubHex); };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  jsbn verify(full)   |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}
{
    const encHex = FI.enc.c1 + FI.enc.c2;
    const priv = sm2.bigIntToHex(FI.kp.privateKey);
    const f = () => sm.doDecrypt(encHex, priv, 1);
    const r = () => { const p = pools[Math.floor(Math.random()*POOL)]; sm.doDecrypt(p.enc.c1 + p.enc.c2, sm2.bigIntToHex(p.kp.privateKey), 1); };
    const fixed = sample(f, WARMUP, N);
    const random = sample(r, WARMUP, N);
    const res = ttest(fixed, random);
    console.log("  jsbn decrypt(full)  |t|=" + res.t + "  fix=" + res.ma + "us  rnd=" + res.mb + "us  cv=" + res.cv_a + "%/" + res.cv_b + "%  " + (res.ok?"PASS":"FAIL"));
}

console.log("\nDiagnosis complete.");
