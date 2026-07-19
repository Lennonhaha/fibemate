'use strict';
const sm2=require('../sm2-bigint-ec');
const crypto=require('crypto');

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  PASS: '+n);}catch(e){f++;console.log('  FAIL: '+n+' - '+e.message);}}

console.log('\n=== P0-03a Node.js SM2 fix tests ===\n');
const kp=sm2.generateKeyPair();
const pk=sm2.publicKeyToHex(kp.publicKey);
const msg='P0-03a fix test';
const hash=BigInt('0x'+crypto.createHash('sha256').update(msg).digest('hex'));

console.log('1. Basic:');
t('keygen valid',()=>{if(pk.length!==130)throw new Error('length '+pk.length);});
const sig=sm2.sign(kp.privateKey,hash);
t('sign ok',()=>{if(!sig.r||!sig.s)throw new Error('missing r/s');});
t('verify ok',()=>{if(!sm2.verify(pk,hash,sig.r,sig.s))throw new Error('verify false');});
t('wrong sig rejected',()=>{const f='00'.repeat(32);if(sm2.verify(pk,hash,f,sig.s))throw new Error('accepted fake');});

console.log('\n2. k-masking:');
const sigs=[];for(let i=0;i<10;i++)sigs.push(sm2.sign(kp.privateKey,hash));
const uc=new Set(sigs.map(s=>s.r+s.s)).size;
t(uc+'/10 unique sigs',()=>{if(uc<5)throw new Error('only '+uc); const allOk=sigs.every(s=>sm2.verify(pk,hash,s.r,s.s)); if(!allOk)throw new Error('masked sig verify fail');});

console.log('\n3. Encrypt:');
const ct=sm2.encrypt(pk,msg);
t('encrypt ok',()=>{if(!ct.c1||!ct.c2)throw new Error('missing c1/c2');});
t('decrypt ok',()=>{if(sm2.decrypt(kp.privateKey,ct.c1,ct.c2)!==msg)throw new Error('mismatch');});
const cts=[];for(let i=0;i<10;i++)cts.push(sm2.encrypt(pk,msg));
const uc1=new Set(cts.map(c=>c.c1)).size;
t(uc1+'/10 unique C1 (k-mask)',()=>{if(uc1<8)throw new Error('only '+uc1);});

console.log('\n4. Stress 100:');
let ok=true;for(let i=0;i<100;i++){const h=BigInt('0x'+crypto.createHash('sha256').update('s'+i).digest('hex'));const s=sm2.sign(kp.privateKey,h);if(!sm2.verify(pk,h,s.r,s.s)){ok=false;break;}}
t('100 rounds',()=>{if(!ok)throw new Error('fail');});

console.log('\n5. extEuclidInv removed:');
t('no extEuclidInv in sm2-bigint-ec.js',()=>{
  const fs=require('fs');
  const c=fs.readFileSync('sm2-bigint-ec.js','utf8');
  if(c.includes('function extEuclidInv'))throw new Error('STILL EXISTS');
});

console.log('\n=== Results: '+p+' PASS, '+f+' FAIL ===\n');
process.exit(f>0?1:0);
