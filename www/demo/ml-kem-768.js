// ML-KEM-768 (FIPS 203) — Browser-compatible standalone
// Auto-generated from packages/pqc-kem/src/ml-kem-768.js
(function() {

// Browser Buffer polyfill (Node.js built-in in original source)
if (typeof Buffer === 'undefined') {
  window.Buffer = {
    from(data, enc) {
      if (Array.isArray(data) || data instanceof Uint8Array) return new Uint8Array(data);
      if (typeof data === 'string' && enc === 'hex') {
        const bytes = new Uint8Array(data.length / 2);
        for (let i = 0; i < data.length; i += 2) bytes[i / 2] = parseInt(data.slice(i, i + 2), 16);
        return bytes;
      }
      if (data instanceof Uint8Array || data instanceof ArrayBuffer) return new Uint8Array(data);
      return new Uint8Array(data);
    },
    concat(arrs) {
      let total = 0;
      for (const a of arrs) total += a.length;
      const out = new Uint8Array(total);
      let off = 0;
      for (const a of arrs) { out.set(a, off); off += a.length; }
      return out;
    },
    compare(a, b) {
      if (a.length !== b.length) return a.length - b.length;
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; }
      return 0;
    },
    alloc(n) { return new Uint8Array(n); }
  };
}

// Browser Int16Array polyfill (just in case)
if (typeof Int16Array === 'undefined') { window.Int16Array = Int16Array; }
/**
 * ML-KEM-768 (FIPS 203) — Pure JavaScript NTT-Domain Implementation
 *
 * NTT encode: DIT butterfly (dit=false→isDit=true), ZETAS[1..127]
 * NTT decode: invertButterflies (dit=true→isDit=false), ZETAS[255..129], ×3303
 * polyMulNTT: BaseCaseMultiply with ZETAS[64+⌊i/2⌋]
 *
 * Cross-validated with @noble/post-quantum ml-kem.
 */

const N = 256, Q = 3329, NTT_INV = 3303, K = 3;
const PK_BYTES = 1184, SK_BYTES = 2400, CT_BYTES = 1088, SS_BYTES = 32;

// ============================================================================
// ZETAS[256] — period-128, ZETAS[i]=17^{BR₇(i)} mod 3329
// ============================================================================
const ZETAS = new Int16Array([
      1,1729,2580,3289,2642,630,1897,848,1062,1919,193,797,2786,3260,569,1746,
    296,2447,1339,1476,3046,56,2240,1333,1426,2094,535,2882,2393,2879,1974,821,
    289,331,3253,1756,1197,2304,2277,2055,650,1977,2513,632,2865,33,1320,1915,
   2319,1435,807,452,1438,2868,1534,2402,2647,2617,1481,648,2474,3110,1227,910,
     17,2761,583,2649,1637,723,2288,1100,1409,2662,3281,233,756,2156,3015,3050,
   1703,1651,2789,1789,1847,952,1461,2687,939,2308,2437,2388,733,2337,268,641,
   1584,2298,2037,3220,375,2549,2090,1645,1063,319,2773,757,2099,561,2466,2594,
   2804,1092,403,1026,1143,2150,2775,886,1722,1212,1874,1029,2110,2935,885,2154,
    // repeat
      1,1729,2580,3289,2642,630,1897,848,1062,1919,193,797,2786,3260,569,1746,
    296,2447,1339,1476,3046,56,2240,1333,1426,2094,535,2882,2393,2879,1974,821,
    289,331,3253,1756,1197,2304,2277,2055,650,1977,2513,632,2865,33,1320,1915,
   2319,1435,807,452,1438,2868,1534,2402,2647,2617,1481,648,2474,3110,1227,910,
     17,2761,583,2649,1637,723,2288,1100,1409,2662,3281,233,756,2156,3015,3050,
   1703,1651,2789,1789,1847,952,1461,2687,939,2308,2437,2388,733,2337,268,641,
   1584,2298,2037,3220,375,2549,2090,1645,1063,319,2773,757,2099,561,2466,2594,
   2804,1092,403,1026,1143,2150,2775,886,1722,1212,1874,1029,2110,2935,885,2154,
]);

// ============================================================================
// Modular arithmetic (safe for negative inputs)
// ============================================================================
function modAdd(a, b) { const r = ((a|0)+(b|0)) % Q; return r >= 0 ? r : r+Q; }
function modSub(a, b) { const r = ((a|0)-(b|0)) % Q; return r >= 0 ? r : r+Q; }
function modMul(a, b) { const na = ((a|0)%Q+Q)%Q, nb = ((b|0)%Q+Q)%Q; return Number((BigInt(na)*BigInt(nb))%BigInt(Q)); }
function modNeg(a) { const na = ((a|0)%Q+Q)%Q; return na ? Q-na : 0; }

// ============================================================================
// NTT / iNTT — 1:1 with @noble/curves FFTCore (genCrystals Kyber mode)
//
// encode: dit=false, invertButterflies=true, skipStages=1
//   → isDit = false!==true = TRUE → DIT butterfly
//   → rootPos = true?(false?N-grp:grp) → grp → ZETAS[1..127]
//   → butterfly: t=ω·b, f[i₀]=a+t, f[i₁]=a-t
//   → stages 8,7,6,5,4,3,2
//
// decode: dit=true, invertButterflies=true, skipStages=1
//   → isDit = true!==true = FALSE → invertButterflies path
//   → rootPos = true?(true?N-grp:grp) → N-grp → ZETAS[255..129]
//   → butterfly: f[i₀]=b+a, f[i₁]=ω·(b-a)
//   → stages 2,3,4,5,6,7,8 → then ×NTT_INV
// ============================================================================
function ntt(f) {
    let step = 1;
    for (let s = 8; s > 1; s--) {
        const m = 1<<s, m2 = m>>1;
        for (let k = 0; k < N; k += m) {
            const omega = ZETAS[step++];
            for (let j = 0; j < m2; j++) {
                const i0 = k+j, i1 = k+j+m2;
                const a = f[i0], b = f[i1];
                f[i0] = modAdd(a, modMul(b, omega));
                f[i1] = modSub(a, modMul(b, omega));
            }
        }
    }
    return f;
}

function intt(f) {
    let step = 1;
    for (let s = 2; s <= 8; s++) {
        const m = 1<<s, m2 = m>>1;
        for (let k = 0; k < N; k += m) {
            const omega = ZETAS[256 - step++];
            for (let j = 0; j < m2; j++) {
                const i0 = k+j, i1 = k+j+m2;
                const a = f[i0], b = f[i1];
                f[i0] = modAdd(b, a);
                f[i1] = modMul(modSub(b, a), omega);
            }
        }
    }
    for (let i = 0; i < N; i++) f[i] = modMul(f[i], NTT_INV);
    return f;
}

// ============================================================================
// SHA-3 / SHAKE — pure JS Keccak with noble/crypto fallbacks
// ============================================================================
const KeccakRhoOffsets = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const KeccakPiOffsets = [10,7,11,17,0,3,5,4,15,12,2,13,9,6,1,14,8,16,19,18,23,22,20,24,21];
const KeccakRC = [0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n];

function ROL64(a,n){if(!n)return a;n=Number(n);const lo=Number(a&0xFFFFFFFFn),hi=Number((a>>32n)&0xFFFFFFFFn);let nl,nh;if(n<32){nl=((lo<<n)|(hi>>>(32-n)))>>>0;nh=((hi<<n)|(lo>>>(32-n)))>>>0}else{const m=n-32;nl=((hi<<m)|(lo>>>(32-m)))>>>0;nh=((lo<<m)|(hi>>>(32-m)))>>>0}return(BigInt(nl)|(BigInt(nh)<<32n))&0xFFFFFFFFFFFFFFFFn}
function KeccakF1600(st){const C=new BigInt64Array(5),B=new BigInt64Array(25);for(let r=0;r<24;r++){for(let x=0;x<5;x++)C[x]=st[x]^st[x+5]^st[x+10]^st[x+15]^st[x+20];for(let x=0;x<5;x++){const D=C[(x+4)%5]^ROL64(C[(x+1)%5],1);for(let y=0;y<5;y++)st[x+5*y]^=D}for(let i=0;i<25;i++)B[KeccakPiOffsets[i]]=ROL64(st[i],KeccakRhoOffsets[i]);for(let x=0;x<5;x++)for(let y=0;y<5;y++)st[x+5*y]=B[x+5*y]^((~B[(x+1)%5+5*y])&B[(x+2)%5+5*y]);st[0]^=KeccakRC[r]}}
function load64(b,i){let r=0n;for(let j=0;j<8;j++)r|=BigInt(b[i+j])<<BigInt(8*j);return r}
function store64(v){const b=new Uint8Array(8);let v2=v;for(let j=0;j<8;j++){b[j]=Number(v2&0xffn);v2>>=8n}return b}
function keccak(data,rate,outLen,suffix){const st=new BigInt64Array(25);const bs=rate>>3;const pl=Math.ceil((data.length+2)/bs)*bs;const p=new Uint8Array(pl);p.set(data);p[data.length]=suffix;p[pl-1]|=0x80;for(let o=0;o<pl;o+=bs){for(let j=0;j<bs;j+=8)st[j>>3]^=load64(p,o+j);KeccakF1600(st)}const out=new Uint8Array(outLen);let o=0;while(o<outLen){const t=Math.min(bs,outLen-o);for(let j=0;j<t;j+=8){const bytes=store64(st[j>>3]);for(let k=0;k<8&&o+k<outLen;k++)out[o+k]=bytes[k]}o+=t;if(o<outLen)KeccakF1600(st)}return out}
function sha3_256(d){try{return require("crypto").createHash("sha3-256").update(new Uint8Array(d)).digest()}catch(e){}try{return require("@noble/hashes/sha3").sha3_256(d)}catch(e){}return keccak(d,1088,32,0x06)}
function sha3_512(d){try{return require("crypto").createHash("sha3-512").update(new Uint8Array(d)).digest()}catch(e){}try{return require("@noble/hashes/sha3").sha3_512(d)}catch(e){}return keccak(d,576,64,0x06)}
function shake128(d,len){try{return require("crypto").createHash("shake128",{outputLength:len}).update(new Uint8Array(d)).digest()}catch(e){}try{return require("@noble/hashes/sha3").shake128(d,len)}catch(e){}return keccak(d,1344,len,0x1f)}
function shake256(d,len){try{return require("crypto").createHash("shake256",{outputLength:len}).update(new Uint8Array(d)).digest()}catch(e){}try{return require("@noble/hashes/sha3").shake256(d,len)}catch(e){}return keccak(d,1088,len,0x1f)}

// ============================================================================
// byteEncode/Decode, compress/decompress, CBD2, sampleNTT, poly ops
// ============================================================================
function byteEncode(f,d){const out=new Uint8Array(N*d>>>3);for(let i=0;i<N;i++){let t=((f[i]%Q)+Q)%Q;for(let j=0;j<d;j++){const bi=i*d+j;out[bi>>>3]|=((t>>>j)&1)<<(bi&7)}}return out}
function byteDecode(data,d){const f=new Int16Array(N);for(let i=0;i<N;i++){let t=0;for(let j=0;j<d;j++){const bi=i*d+j;t|=((data[bi>>>3]>>>(bi&7))&1)<<j}if(d===12&&t>=Q)t-=Q;f[i]=t}return f}
function compress(f,d){const g=new Int16Array(N);const rnd=3329>>1;for(let i=0;i<N;i++){const x=((f[i]%Q)+Q)%Q;g[i]=Number(((BigInt(x)*BigInt(1<<d)+BigInt(rnd))/BigInt(Q))&BigInt((1<<d)-1))}return g}
function decompress(g,d){const f=new Int16Array(N);for(let i=0;i<N;i++)f[i]=Number(((BigInt(g[i])*BigInt(Q)+BigInt(1<<(d-1)))>>BigInt(d)));return f}
function cbd2(buf){const r=new Int16Array(N);for(let i=0;i<128;i++){const b=buf[i];r[2*i]=(b&1)+((b>>1)&1)-((b>>2)&1)-((b>>3)&1);r[2*i+1]=((b>>4)&1)+((b>>5)&1)-((b>>6)&1)-((b>>7)&1)}return r}
function sampleNTT(seed){const stream=shake128(seed,840);const a=new Int16Array(N);let j=0,off=0;while(j<N&&off+3<=stream.length){const d1=stream[off]|((stream[off+1]&0x0F)<<8),d2=(stream[off+1]>>4)|(stream[off+2]<<4);off+=3;if(d1<Q)a[j++]=d1;if(j<N&&d2<Q)a[j++]=d2}while(j<N)a[j++]=0;return a}
function polyMulNTT(a,b){const r=new Int16Array(N);for(let i=0;i<128;i++){let z=ZETAS[64+(i>>1)];if(i&1)z=modNeg(z);const a0=a[2*i],a1=a[2*i+1],b0=b[2*i],b1=b[2*i+1];r[2*i]=modAdd(modMul(modMul(a1,b1),z),modMul(a0,b0));r[2*i+1]=modAdd(modMul(a0,b1),modMul(a1,b0))}return r}
function polyAddNTT(a,b){const r=new Int16Array(N);for(let i=0;i<N;i++)r[i]=modAdd(a[i],b[i]);return r}
function vecDotNTT(a,b,k){let acc=new Int16Array(N);for(let i=0;i<k;i++)acc=polyAddNTT(acc,polyMulNTT(a[i],b[i]));return acc}
function matVecMulNTT(A,v,k){const r=[];for(let i=0;i<k;i++){let row=new Int16Array(N);for(let l=0;l<k;l++)row=polyAddNTT(row,polyMulNTT(A[i][l],v[l]));r[i]=row}return r}
function polyFromMsg(msg){const m=new Int16Array(N);for(let i=0;i<N;i++)m[i]=((msg[i>>>3]>>>(i&7))&1)*1665;return m}
function polyToMsg(f){const m=new Uint8Array(32);for(let i=0;i<N;i++){const x=((f[i]%Q)+Q)%Q;if(x>832&&x<2497)m[i>>>3]|=1<<(i&7)}return m}

// ============================================================================
// KeyGen — FIPS 203 §7.1 (NTT domain)
// ============================================================================
function generateKeypair(){
    const d=crypto.getRandomValues(new Uint8Array(32));
    const z=crypto.getRandomValues(new Uint8Array(32));
    const H=sha3_512(new Uint8Array([...d,3])); // d||k where k=3
    const rho=H.slice(0,32), sigma=H.slice(32,64);

    // A[i][j] = ntt(sampleNTT(ρ||i||j)) — FIPS Alg 11 step 3
    const A=[];
    for(let i=0;i<K;i++){
        A[i]=[];
        for(let j=0;j<K;j++){
            const seed=new Uint8Array(34);
            seed.set(rho);seed[32]=j;seed[33]=i;
            A[i][j]=sampleNTT(seed); // already in NTT domain
        }
    }

    // s[i] = ntt(CBD2(PRF(σ,i))) — step 4 (NTT domain)
    // e[i] = ntt(CBD2(PRF(σ,i+k))) — step 5 (NTT domain)
    const s=[],e=[];
    for(let i=0;i<K;i++){
        s[i]=ntt(cbd2(shake256(new Uint8Array([...sigma,i]),128)));
        e[i]=ntt(cbd2(shake256(new Uint8Array([...sigma,i+K]),128)));
    }

    // t_hat[i] = A[i]*s_hat + e_hat — NTT domain, encoded directly into pk
    const As=matVecMulNTT(A,s,K);
    const t=As.map((row,i)=>polyAddNTT(row,e[i]));

    // pk = byteEncode₁₂(t_hat) || ρ
    const pk=new Uint8Array(PK_BYTES);
    let off=0;
    for(let i=0;i<K;i++){pk.set(byteEncode(t[i],12),off);off+=384;}
    pk.set(rho,off);

    // sk = byteEncode₁₂(s_hat) || pk || H(pk) || z  (s in NTT domain)
    const sk=new Uint8Array(SK_BYTES);
    off=0;
    for(let i=0;i<K;i++){sk.set(byteEncode(s[i],12),off);off+=384;}
    sk.set(pk,off);off+=PK_BYTES;
    sk.set(sha3_256(pk),off);off+=32;
    sk.set(z,off);

    return {publicKey:pk,secretKey:sk};
}

// ============================================================================
// Encaps — FIPS 203 §7.2 (NTT domain)
// ============================================================================
function encapsulate(publicKey){
    const m=crypto.getRandomValues(new Uint8Array(32));
    const rho=publicKey.slice(K*384,K*384+32);
    const hpk=sha3_256(publicKey);

    // G(m||H(pk)) → SHA3-512 → (K_bar, r)
    const G=sha3_512(Buffer.concat([Buffer.from(m),Buffer.from(hpk)]));
    const K_bar=G.slice(0,32), r=G.slice(32,64);

    // Â^T[i][j] = sampleNTT(ρ||i||j) — FIPS 203 §7.2 step 2 (already NTT domain)
    const AT=[];
    for(let i=0;i<K;i++){
        AT[i]=[];
        for(let j=0;j<K;j++){
            const seed=new Uint8Array(34);
            seed.set(rho);seed[32]=i;seed[33]=j;
            AT[i][j]=sampleNTT(seed);
        }
    }

    // r_vec[i] = ntt(CBD2(PRF(r,i))), e1[i] = ntt(CBD2(PRF(r,i+K)))
    const rr=[],e1=[];
    for(let i=0;i<K;i++){
        rr[i]=ntt(cbd2(shake256(new Uint8Array([...r,i]),128)));
        e1[i]=ntt(cbd2(shake256(new Uint8Array([...r,i+K]),128)));
    }
    const e2=cbd2(shake256(new Uint8Array([...r,2*K]),128));

    // u = iNTT(A^T * r_ntt) + iNTT(e1_ntt)
    const uprimeNTT=matVecMulNTT(AT,rr,K);
    const u=[];
    for(let i=0;i<K;i++){
        const ut=intt(new Int16Array(uprimeNTT[i]));
        const e1t=intt(new Int16Array(e1[i]));
        const ui=new Int16Array(N);
        for(let j=0;j<N;j++)ui[j]=modAdd(ut[j],e1t[j]);
        u[i]=ui;
    }

    // t_hat = byteDecode₁₂ from pk (NTT domain, FIPS 203 stores t_hat)
    const t_hat=[];
    let off=0;
    for(let i=0;i<K;i++){t_hat[i]=byteDecode(publicKey.slice(off,off+384),12);off+=384;}

    // v = iNTT(t_hat^T * r_ntt) + e2 + Decompress₁(m)
    const vprime=intt(vecDotNTT(t_hat,rr,K));
    const mu=polyFromMsg(m);
    const v=new Int16Array(N);
    for(let i=0;i<N;i++)v[i]=modAdd(modAdd(vprime[i],e2[i]),mu[i]);

    // ct = byteEncode₁₀(compress₁₀(u)) || byteEncode₄(compress₄(v))
    const ct=new Uint8Array(CT_BYTES);
    off=0;
    for(let i=0;i<K;i++){ct.set(byteEncode(compress(u[i],10),10),off);off+=320;}
    ct.set(byteEncode(compress(v,4),4),off);

    // ss = SHA3-256(K_bar || H(ct)) — FIPS 203 §7.2 step 14
    const ss=sha3_256(Buffer.concat([Buffer.from(K_bar),Buffer.from(sha3_256(ct))]));
    return {ciphertext:ct,sharedSecret:K_bar};  // return raw K_bar for noble compat, hashed K_bar in ss for self-use
}

// ============================================================================
// Decaps — FIPS 203 §7.3 (NTT domain)
// ============================================================================
function decapsulate(secretKey,ciphertext){
    // sk = byteEncode₁₂(s_hat) || pk || H(pk) || z (s_hat in NTT domain)
    const s=[];  // NTT domain
    let off=0;
    for(let i=0;i<K;i++){s[i]=byteDecode(secretKey.slice(off,off+384),12);off+=384;}
    const pk=secretKey.slice(off,off+PK_BYTES);off+=PK_BYTES;
    const h=secretKey.slice(off,off+32);off+=32;
    const z=secretKey.slice(off,off+32);

    // ct = … || compress₁₀(u) || compress₄(v)
    const u=[];
    off=0;
    for(let i=0;i<K;i++){u[i]=decompress(byteDecode(ciphertext.slice(off,off+320),10),10);off+=320;}
    const v=decompress(byteDecode(ciphertext.slice(off,off+128),4),4);

    // u → NTT, s_hat · NTT(u) → iNTT = s·u (s already NTT)
    const uNTT=u.map(ui=>ntt(new Int16Array(ui)));
    const su=intt(vecDotNTT(s,uNTT,K));

    // v - s·u → m'
    const mp=new Int16Array(N);
    for(let i=0;i<N;i++)mp[i]=modSub(v[i],su[i]);
    const mPrime=polyToMsg(mp);

    // G(m'||H(pk)) → (K_bar', r')
    const hpk=sha3_256(pk);
    const G2=sha3_512(Buffer.concat([Buffer.from(mPrime),Buffer.from(hpk)]));
    const K_bar_prime=G2.slice(0,32), r2seed=G2.slice(32,64);
    const rho=new Uint8Array(pk.slice(K*384,K*384+32));

    // Re-encrypt: A^T[i][j] = sampleNTT(ρ||i||j) — already NTT domain
    const AT=[];
    for(let i=0;i<K;i++){
        AT[i]=[];
        for(let j=0;j<K;j++){
            const seed=new Uint8Array(34);
            seed.set(rho);seed[32]=i;seed[33]=j;
            AT[i][j]=sampleNTT(seed);
        }
    }

    const r2=[],e1_2=[];
    for(let i=0;i<K;i++){
        r2[i]=ntt(cbd2(shake256(new Uint8Array([...r2seed,i]),128)));
        e1_2[i]=ntt(cbd2(shake256(new Uint8Array([...r2seed,i+K]),128)));
    }
    const e2_2=cbd2(shake256(new Uint8Array([...r2seed,2*K]),128));

    const uprime2NTT=matVecMulNTT(AT,r2,K);
    const u2=[];
    for(let i=0;i<K;i++){
        const ut=intt(new Int16Array(uprime2NTT[i]));
        const e1t=intt(new Int16Array(e1_2[i]));
        const ui=new Int16Array(N);
        for(let j=0;j<N;j++)ui[j]=modAdd(ut[j],e1t[j]);
        u2[i]=ui;
    }

    const t_hat2=[];
    let toff=0;
    for(let i=0;i<K;i++){t_hat2[i]=byteDecode(pk.slice(toff,toff+384),12);toff+=384;}
    const v2prime=intt(vecDotNTT(t_hat2,r2,K));
    const mu2=polyFromMsg(mPrime);
    const v2=new Int16Array(N);
    for(let i=0;i<N;i++)v2[i]=modAdd(modAdd(v2prime[i],e2_2[i]),mu2[i]);

    const ct2=new Uint8Array(CT_BYTES);
    off=0;
    for(let i=0;i<K;i++){ct2.set(byteEncode(compress(u2[i],10),10),off);off+=320;}
    ct2.set(byteEncode(compress(v2,4),4),off);

    // Constant-time fail check
    let fail=0;
    for(let i=0;i<CT_BYTES;i++)fail|=ciphertext[i]^ct2[i];
    const mask=((fail|-fail)>>>31)&0xff, ctMask=0-mask;

    const h_real=K_bar_prime;  // noble returns raw K_bar
    const h_impl=shake256(new Uint8Array([...z,...sha3_256(ciphertext)]),32);
    const ss=new Uint8Array(SS_BYTES);
    for(let i=0;i<SS_BYTES;i++)ss[i]=(h_real[i]&~ctMask)|(h_impl[i]&ctMask);
    return ss;
}

// ============================================================================
// Module export
// ============================================================================
const MLKEM768 = {
    generateKeypair,encapsulate,decapsulate,
    PUBLIC_KEY_BYTES:PK_BYTES,SECRET_KEY_BYTES:SK_BYTES,
    CIPHERTEXT_BYTES:CT_BYTES,SHARED_SECRET_BYTES:SS_BYTES,
    ntt,intt,polyMulNTT,polyAddNTT,vecDotNTT,matVecMulNTT,
    compress,decompress,byteEncode,byteDecode,
    modAdd,modSub,modMul,sampleNTT,cbd2,
    polyFromMsg,polyToMsg,
    sha3_256,sha3_512,shake128,shake256,
    ZETAS,
};



window.MLKEM768 = MLKEM768;
})();
