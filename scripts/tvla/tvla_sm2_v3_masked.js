// SPDX-License-Identifier: GPL-3.0-only
// SM2 TVLA v3 — BigInt-only, masked (v1.2)
// Quick validation: N=2000 then N=5000
"use strict";
const crypto = require("crypto");
const sm3 = require("sm-crypto").sm3;
const bigintEc = require("/opt/fibemate-full/sm2-bigint-ec");

const N = process.argv[2] ? parseInt(process.argv[2]) : 2000;
const WARMUP = 500, THRESH = 4.5, POOL = 100;

function hrtUs(t) { return t[0]*1e6 + t[1]/1e3; }
function mean(a) { let s=0; for(let v of a)s+=v; return s/a.length; }
function varN(a,m) { let s=0; for(let v of a){let d=v-m;s+=d*d;} return s/(a.length-1); }
function welch(m1,v1,n1,m2,v2,n2) { let d=Math.sqrt(v1/n1+v2/n2); return d===0?0:Math.abs(m1-m2)/d; }

function runTVLA(name, fixed, random) {
  process.stdout.write("  " + name + "... ");
  const ta=new Float64Array(N), tb=new Float64Array(N);
  for(let w=0; w<WARMUP; w++){fixed(); random();}
  for(let i=0; i<N; i++){
    let s=process.hrtime(); fixed(); ta[i]=hrtUs(process.hrtime(s));
    s=process.hrtime(); random(); tb[i]=hrtUs(process.hrtime(s));
  }
  let m1=mean(ta), m2=mean(tb), v1=varN(ta,m1), v2=varN(tb,m2);
  let t=welch(m1,v1,N,m2,v2,N);
  let ok=t<=THRESH;
  process.stdout.write("|t|="+t.toFixed(2)+" "+(ok?"PASS":"FAIL")+"\n");
  return {name,t,ok,fixedMean:m1,randomMean:m2};
}

console.log("Pre-generating pools (size="+POOL+")... ");
const msg="FIBEMATE SM2 post-quantum hybrid verification test message";
const msgHash=sm3(msg);

const B={keys:[], pubHexes:[], sigs:[], enc:[]};
for(let i=0; i<POOL; i++) {
  B.keys.push(bigintEc.generateKeyPair());
  B.pubHexes.push(bigintEc.publicKeyToHex(B.keys[i].publicKey));
}
const hashes=[];
for(let i=0; i<POOL; i++) {
  const m=crypto.randomBytes(32).toString("hex");
  hashes.push(BigInt('0x' + sm3(m)));
  B.sigs.push(bigintEc.sign(B.keys[i].privateKey, hashes[i]));
  B.enc.push(bigintEc.encrypt(B.pubHexes[i], "test message v3 "+i));
}
console.log("done.");

const fB=bigintEc.generateKeyPair();
const fBH=bigintEc.publicKeyToHex(fB.publicKey);
const sigBF=bigintEc.sign(fB.privateKey, BigInt('0x'+msgHash));
const encBF=bigintEc.encrypt(fBH, msg);

let idx=0;
function n(){return (idx++)%POOL;}

const tests = [
  ["[BigInt] genKey",  ()=>bigintEc.generateKeyPair(), ()=>bigintEc.generateKeyPair()],
  ["[BigInt] sign",   ()=>bigintEc.sign(fB.privateKey, BigInt('0x'+msgHash)),
                       ()=>{let i=n(); return bigintEc.sign(B.keys[i].privateKey, hashes[i]);}],
  ["[BigInt] verify", ()=>bigintEc.verify(fBH, BigInt('0x'+msgHash), sigBF.r, sigBF.s),
                       ()=>{let i=n(); return bigintEc.verify(B.pubHexes[i], hashes[i], B.sigs[i].r, B.sigs[i].s);}],
  ["[BigInt] encrypt",()=>bigintEc.encrypt(fBH, msg),
                       ()=>{let i=n(); return bigintEc.encrypt(B.pubHexes[i], "test v3 idx="+i);}],
  ["[BigInt] decrypt",()=>bigintEc.decrypt(fB.privateKey, encBF.c1, encBF.c2),
                       ()=>{let i=n(); return bigintEc.decrypt(B.keys[i].privateKey, B.enc[i].c1, B.enc[i].c2);}],
  ["SHA-256",         ()=>crypto.createHash("sha256").update(msg).digest(),
                       ()=>crypto.createHash("sha256").update(crypto.randomBytes(32)).digest()],
  ["randomBytes(32)", ()=>crypto.randomBytes(32), ()=>crypto.randomBytes(32)],
];

console.log("\n" + "=".repeat(60));
console.log("  SM2 TVLA v3 — BigInt masked v1.2  N="+N+"  |t|≤"+THRESH);
console.log("=".repeat(60) + "\n");

let start=Date.now(), results=[];
for(let t of tests) results.push(runTVLA(t[0],t[1],t[2]));

let elapsed=((Date.now()-start)/1000).toFixed(1);
let passed=results.filter(r=>r.ok).length, total=results.length;

console.log("\nResults: "+passed+"/"+total+" passed  ("+elapsed+"s)");
for(let r of results){
  console.log("  "+(r.ok?"PASS":"FAIL")+"  "+r.name.padEnd(22)+" |t|="+r.t.toFixed(2).padStart(6)+"  fix="+r.fixedMean.toFixed(0).padStart(8)+"us  rnd="+r.randomMean.toFixed(0).padStart(8)+"us");
}
