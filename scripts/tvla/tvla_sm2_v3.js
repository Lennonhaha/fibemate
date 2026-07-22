// SPDX-License-Identifier: GPL-3.0-only
/**
 * SM2 TVLA v2 — jsbn vs BigInt+wNAF+Jacobian
 * Welch's t-test, interleaved A/B, N=2000, |t| > 4.5 → FAIL
 * Pool size 100 → pregen fast, cycle through for input diversity
 */
"use strict";
const crypto = require("crypto");
const sm2jsbn = require("sm-crypto").sm2;
const sm3 = require("sm-crypto").sm3;
const bigintEc = require("/opt/fibemate-full/sm2-bigint-ec");

const N = 5000, WARMUP = 500, THRESH = 4.5, POOL = 100;

function hrtUs(t) { return t[0]*1e6 + t[1]/1e3; }
function mean(a) { let s=0; for(let v of a)s+=v; return s/a.length; }
function varN(a,m) { let s=0; for(let v of a){let d=v-m;s+=d*d;} return s/(a.length-1); }
function welch(m1,v1,n1,m2,v2,n2) { let d=Math.sqrt(v1/n1+v2/n2); return d===0?0:Math.abs(m1-m2)/d; }

function runTVLA(name, fixed, random) {
  process.stdout.write(`  ${name}... `);
  const ta=new Float64Array(N), tb=new Float64Array(N);
  for(let w=0; w<WARMUP; w++){fixed(); random();}
  for(let i=0; i<N; i++){let s=process.hrtime(); fixed(); ta[i]=hrtUs(process.hrtime(s));
    s=process.hrtime(); random(); tb[i]=hrtUs(process.hrtime(s));}
  let m1=mean(ta), m2=mean(tb), v1=varN(ta,m1), v2=varN(tb,m2);
  let t=welch(m1,v1,N,m2,v2,N), df=(v1/N+v2/N)**2/(((v1/N)**2)/(N-1)+((v2/N)**2)/(N-1));
  let ok=t<=THRESH; console.log(`|t|=${t.toFixed(2)} ${ok?"✅":"❌"}`);
  return {name,t,df,fixedMean:m1,randomMean:m2,fixedCV:Math.sqrt(v1)/m1*100,passed:ok};
}

// ═══════ Pre-generate small pools ═══════
console.log(`Pre-generating pools (size=${POOL})... `);
const msg="FIBEMATE SM2 post-quantum hybrid verification test message";
const msgHash=sm3(msg);

const J={keys:[], msgs:[], hashes:[], sigs:[], enc:[]};
const B={keys:[], pubHexes:[], sigs:[], enc:[]};

for(let i=0; i<POOL; i++) {
  J.keys.push(sm2jsbn.generateKeyPairHex());
  let m=crypto.randomBytes(32).toString("hex");
  J.msgs.push(m); J.hashes.push(sm3(m));
}
for(let i=0; i<POOL; i++) {
  J.sigs.push(sm2jsbn.doSignature(J.msgs[i], J.keys[i].privateKey, {hash:true}));
  J.enc.push(sm2jsbn.doEncrypt(J.msgs[i], J.keys[i].publicKey, 1));
}
for(let i=0; i<POOL; i++) {
  B.keys.push(bigintEc.generateKeyPair());
  B.pubHexes.push(bigintEc.publicKeyToHex(B.keys[i].publicKey));
}
for(let i=0; i<POOL; i++) {
  B.sigs.push(bigintEc.sign(B.keys[i].privateKey, J.hashes[i]));
  B.enc.push(bigintEc.encrypt(B.pubHexes[i], J.msgs[i]));
}
console.log("done.");

// Fixed material
const fJ=sm2jsbn.generateKeyPairHex();
const fB=bigintEc.generateKeyPair();
const fBH=bigintEc.publicKeyToHex(fB.publicKey);
const sigJF=sm2jsbn.doSignature(msg,fJ.privateKey,{hash:true});
const sigBF=bigintEc.sign(fB.privateKey,msgHash);
const encJF=sm2jsbn.doEncrypt(msg,fJ.publicKey,1);
const encBF=bigintEc.encrypt(fBH,msg);

let idx=0;
function n(){return (idx++)%POOL;}

const tests = [
  ["[jsbn] genKey",  ()=>sm2jsbn.generateKeyPairHex(), ()=>sm2jsbn.generateKeyPairHex()],
  ["[jsbn] sign",    ()=>sm2jsbn.doSignature(msg,fJ.privateKey,{hash:true}),
                      ()=>{let i=n(); return sm2jsbn.doSignature(J.msgs[i],J.keys[i].privateKey,{hash:true});}],
  ["[jsbn] verify",  ()=>sm2jsbn.doVerifySignature(msg,sigJF,fJ.publicKey,{hash:true}),
                      ()=>{let i=n(); return sm2jsbn.doVerifySignature(J.msgs[i],J.sigs[i],J.keys[i].publicKey,{hash:true});}],
  ["[jsbn] encrypt", ()=>sm2jsbn.doEncrypt(msg,fJ.publicKey,1),
                      ()=>{let i=n(); return sm2jsbn.doEncrypt(J.msgs[i],J.keys[i].publicKey,1);}],
  ["[jsbn] decrypt", ()=>sm2jsbn.doDecrypt(encJF,fJ.privateKey,1),
                      ()=>{let i=n(); return sm2jsbn.doDecrypt(J.enc[i],J.keys[i].privateKey,1);}],
  ["[BigInt] genKey", ()=>bigintEc.generateKeyPair(), ()=>bigintEc.generateKeyPair()],
  ["[BigInt] sign",   ()=>bigintEc.sign(fB.privateKey,msgHash),
                      ()=>{let i=n(); return bigintEc.sign(B.keys[i].privateKey,J.hashes[i]);}],
  ["[BigInt] verify", ()=>bigintEc.verify(fBH,msgHash,sigBF.r,sigBF.s),
                      ()=>{let i=n(); return bigintEc.verify(B.pubHexes[i],J.hashes[i],B.sigs[i].r,B.sigs[i].s);}],
  ["[BigInt] encrypt",()=>bigintEc.encrypt(fBH,msg),
                      ()=>{let i=n(); return bigintEc.encrypt(B.pubHexes[i],J.msgs[i]);}],
  ["[BigInt] decrypt",()=>bigintEc.decrypt(fB.privateKey,encBF.c1,encBF.c2),
                      ()=>{let i=n(); return bigintEc.decrypt(B.keys[i].privateKey,B.enc[i].c1,B.enc[i].c2);}],
  ["SHA-256",         ()=>crypto.createHash("sha256").update(msg).digest(),
                      ()=>crypto.createHash("sha256").update(crypto.randomBytes(32)).digest()],
  ["randomBytes(32)", ()=>crypto.randomBytes(32), ()=>crypto.randomBytes(32)],
];

// ═══════ Run ═══════
console.log(`\n╔══════════════════════════════════════════════════╗`);
console.log(`║  SM2 TVLA v2 — jsbn vs BigInt+wNAF+Jacobian    ║`);
console.log(`╠══════════════════════════════════════════════════╣`);
console.log(`║  N=${N}  warmup=${WARMUP}  threshold=|t|≤${THRESH}                    ║`);
console.log(`╚══════════════════════════════════════════════════╝\n`);

let start=Date.now(), results=[];
for(let t of tests) results.push(runTVLA(t[0],t[1],t[2]));

let elapsed=((Date.now()-start)/1000).toFixed(1);
let total=results.length, passed=results.filter(r=>r.passed).length, failed=total-passed;

let jsbnRes=results.filter(r=>r.name.startsWith("[jsbn]"));
let biRes=results.filter(r=>r.name.startsWith("[BigInt]"));
let primRes=results.filter(r=>!r.name.startsWith("["));

function printGrp(label,rs){
  console.log(`\n  ${label}:`);
  for(let r of rs) console.log(`    ${r.passed?"✅":"❌"} ${r.name.padEnd(24)} |t|=${r.t.toFixed(2).padStart(7)}  df=${String(Math.round(r.df)).padStart(6)}  cv=${r.fixedCV.toFixed(1).padStart(5)}%`);
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(` Results: ${passed}/${total} passed, ${failed} failed  (${elapsed}s)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
printGrp("jsbn (sm-crypto)",jsbnRes);
printGrp("BigInt + wNAF",biRes);
printGrp("Primitives",primRes);

let report={timestamp:new Date().toISOString(),nodeVersion:process.version,versions:{jsbn:"sm-crypto (jsbn 28-bit limb)",bigint:"Native BigInt + Jacobian + Precomp + wNAF"},iterations:N,threshold:THRESH,elapsedSec:parseFloat(elapsed),allPassed:failed===0,jsbnPassed:jsbnRes.every(r=>r.passed),bigintPassed:biRes.every(r=>r.passed),results};
require("fs").writeFileSync("/opt/fibemate-full/tvla-sm2-v3-report.json",JSON.stringify(report,null,2));
console.log(`\n📄 Report written`);
if(failed>0){console.log("\n⚠️  TVLA FAILED"); process.exit(1);}
else console.log("\n✅ All TVLA tests PASSED");
