const core = require('../packages/pqc-kem/src/ml-kem-768');

const _polyMul = core.polyMul;
const _samplePoly = core.samplePoly;
const _modAdd = core.modAdd;
const _modMul = core.modMul;
const _compress = core.compress;
const _decompress = core.decompress;

let NTT_ct=0, iNTT_ct=0, polyMul_ct=0, samplePoly_ct=0, compress_ct=0, decompress_ct=0;
const origNTT=core.NTT, origINTT=core.iNTT;
core.NTT=(...a)=>{NTT_ct++;return origNTT(...a)};
core.iNTT=(...a)=>{iNTT_ct++;return origINTT(...a)};
core.polyMul=(...a)=>{polyMul_ct++;return _polyMul(...a)};
core.samplePoly=(...a)=>{samplePoly_ct++;return _samplePoly(...a)};
core.compress=(...a)=>{compress_ct++;return _compress(...a)};
core.decompress=(...a)=>{decompress_ct++;return _decompress(...a)};

const kp=core.generateKeypair();
const enc=core.encapsulate(kp.publicKey);

core.NTT=origNTT;core.iNTT=origINTT;
core.polyMul=_polyMul;core.samplePoly=_samplePoly;
core.compress=_compress;core.decompress=_decompress;

console.log('Per keygen+encaps cycle:');
console.log('  NTT calls:        %d', NTT_ct);
console.log('  iNTT calls:       %d', iNTT_ct);
console.log('  polyMul calls:    %d', polyMul_ct);
console.log('  samplePoly calls: %d', samplePoly_ct);
console.log('  compress calls:   %d', compress_ct);
console.log('  decompress calls: %d', decompress_ct);

// NTT inner timing
const testPoly=new Int16Array(256);
for(let i=0;i<256;i++)testPoly[i]=i%3329;

const warm=10, runs=10000;
for(let i=0;i<warm;i++){core.NTT(testPoly.slice());core.iNTT(testPoly.slice())}
const t1=performance.now();
for(let i=0;i<runs;i++)core.NTT(testPoly.slice());
const tNTT=(performance.now()-t1)/runs;
const t2=performance.now();
for(let i=0;i<runs;i++)core.iNTT(testPoly.slice());
const tiNTT=(performance.now()-t2)/runs;

// Pre-transform for polyMul
const p1=core.NTT(testPoly.slice()), p2=core.NTT(testPoly.slice());
for(let i=0;i<warm;i++)core.polyMul(p1,p2);
const t3=performance.now();
for(let i=0;i<runs;i++)core.polyMul(p1,p2);
const tPM=(performance.now()-t3)/runs;

console.log();
console.log('Micro (ms):');
console.log('  NTT 1x:          %.4f', tNTT);
console.log('  iNTT 1x:         %.4f', tiNTT);
console.log('  polyMul 1x:      %.4f (total x%d NTT+iNTT+polyMul=%.2f)', tPM, NTT_ct+iNTT_ct+polyMul_ct, (tNTT*NTT_ct+tiNTT*iNTT_ct+tPM*polyMul_ct));

