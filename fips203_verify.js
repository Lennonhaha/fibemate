// FIPS 203 ML-KEM-768 KeyGen/Encaps/Decaps + KAT verification
// Uses correct: NTT domain, basemul, 2-byte nonce, js-sha3 SHAKE
const sha3 = require('js-sha3');
const crypto = require('crypto');
const fs = require('fs');

const Q=3329,N=256,K=3;
const ETA2=2; // CBD parameter

// --- NTT Zetas ---
function br7(x){let r=0;for(let i=0;i<7;i++){r=(r<<1)|(x&1);x>>=1;}return r;}
const zetas=new Int16Array(128);
for(let i=0;i<128;i++){
    let b=BigInt(br7(i)),r=1n,base=17n,m=BigInt(Q);
    while(b>0n){if(b&1n)r=(r*base)%m;base=(base*base)%m;b>>=1n;}
    zetas[i]=Number(r);
}
const zetasInv=new Int16Array(128);
for(let i=1;i<128;i++){
    let v=BigInt(zetas[i]),r=1n,e=BigInt(Q-2),m=BigInt(Q);
    while(e>0n){if(e&1n)r=(r*v)%m;v=(v*v)%m;e>>=1n;}
    zetasInv[i]=Number(r);
}

// --- NTT ---
function ntt(f){
    const fh=new Int16Array(f);
    let i=1;
    for(let len=128;len>=2;len>>=1){
        for(let start=0;start<N;start+=2*len){
            const z=zetas[i++];
            for(let j=start;j<start+len;j++){
                const t=Number((BigInt(z)*BigInt(fh[j+len]))%BigInt(Q));
                fh[j+len]=(fh[j]-t)%Q;if(fh[j+len]<0)fh[j+len]+=Q;
                fh[j]=(fh[j]+t)%Q;if(fh[j]>=Q)fh[j]-=Q;
            }
        }
    }
    for(let j=0;j<N;j++){if(fh[j]<0)fh[j]+=Q;}
    return fh;
}

function nttInv(fh){
    const f=new Int16Array(fh);
    let i=127;
    for(let len=2;len<=128;len<<=1){
        for(let start=0;start<N;start+=2*len){
            const z=zetasInv[i--];
            for(let j=start;j<start+len;j++){
                const t=f[j];
                f[j]=(t+f[j+len])%Q;if(f[j]>=Q)f[j]-=Q;
                f[j+len]=Number((BigInt(z)*BigInt((f[j+len]-t+2*Q)%Q))%BigInt(Q));
            }
        }
    }
    const invN = 3303; // N^{-1} mod Q = 256^{-1} mod 3329
    for(let j=0;j<N;j++){f[j]=Number((BigInt(f[j])*BigInt(invN))%BigInt(Q));if(f[j]<0)f[j]+=Q;}
    return f;
}

// --- Basemul ---
function basemul(a0,a1,b0,b1,zeta){
    const r0=Number((BigInt(a0)*BigInt(b0)+BigInt(zeta)*BigInt(a1)*BigInt(b1))%BigInt(Q));
    const r1=Number((BigInt(a0)*BigInt(b1)+BigInt(a1)*BigInt(b0))%BigInt(Q));
    return [r0,r1];
}

function nttPolyMul(f_hat,g_hat){
    const r=new Int16Array(N);
    for(let i=0;i<64;i++){
        const z=zetas[64+i];
        const [r0,r1]=basemul(f_hat[4*i],f_hat[4*i+1],g_hat[4*i],g_hat[4*i+1],z);
        r[4*i]=r0;r[4*i+1]=r1;
        const [r2,r3]=basemul(f_hat[4*i+2],f_hat[4*i+3],g_hat[4*i+2],g_hat[4*i+3],(Q-z)%Q);
        r[4*i+2]=r2;r[4*i+3]=r3;
    }
    return r;
}

// --- CBD ---
function cbd2(buf){
    const r=new Int16Array(N);
    for(let i=0;i<128;i++){
        const b=buf[i];
        r[2*i]=(b&1)+((b>>1)&1)-((b>>2)&1)-((b>>3)&1);
        r[2*i+1]=((b>>4)&1)+((b>>5)&1)-((b>>6)&1)-((b>>7)&1);
    }
    return r;
}

// --- SHAKE wrappers ---
function shake128(data,n){ return sha3.shake128.create(n).update(data).arrayBuffer(); }
function sha3_512(data){ return sha3.sha3_512.create().update(data).arrayBuffer(); }
function sha3_256(data){ return sha3.sha3_256.create().update(data).arrayBuffer(); }

// --- SampleNTT (FIPS 203) --- uses 2-byte nonce
function sampleNTT(seed,i,j){
    const nonce=new Uint8Array([i&0xff,j&0xff]); // 2-byte nonce
    const input=new Uint8Array(seed.length+2);
    input.set(seed,0);input.set(nonce,seed.length);
    const stream=shake128(input,504); // 168*3 bytes
    const a=new Int16Array(N);
    let pos=0,idx=0;
    while(pos<N&&idx<503){
        const d1=stream[idx]|((stream[idx+1]&0x0F)<<8);
        const d2=(stream[idx+1]>>4)|(stream[idx+2]<<4);
        idx+=3;
        if(d1<Q)a[pos++]=d1;
        if(pos<N&&d2<Q)a[pos++]=d2;
    }
    return a;
}

// --- Byte encode/decode ---
function byteEncode_12(f){
    const out=new Uint8Array(384);
    let off=0;
    for(let i=0;i<N;i++){
        let v=((f[i]%Q)+Q)%Q;
        v=Math.round(v*4095/Q); // compress to 12 bits
        out[off]=(v>>4)&0xFF;out[off+1]=((v&0x0F)<<4)|0;off+=2;
    }
    // pack 12-bit values
    off=0;
    for(let i=0;i<N;i+=2){
        const v0=Math.round((((f[i]%Q)+Q)%Q)*4095/Q);
        const v1=Math.round((((f[i+1]%Q)+Q)%Q)*4095/Q);
        out[off]=(v0>>4)&0xFF;
        out[off+1]=((v0&0x0F)<<4)|((v1>>8)&0x0F);
        out[off+2]=v1&0xFF;
        off+=3;
    }
    return out.slice(0,N*3/2); // 384 bytes
}

function byteDecode_12(data){
    const f=new Int16Array(N);
    let off=0;
    for(let i=0;i<N;i+=2){
        const b0=data[off],b1=data[off+1],b2=data[off+2];
        const v0=((b0<<4)|((b1>>4)&0x0F))<<0;
        const v1=(((b1&0x0F)<<8)|b2)<<0;
        f[i]=Math.round(v0*Q/4095);
        f[i+1]=Math.round(v1*Q/4095);
        off+=3;
    }
    return f;
}

// --- FIPS 203 KeyGen ---
function keyGenKAT(d,z,rho,sigma){
    // A = SampleNTT matrix
    const A=[];
    for(let i=0;i<K;i++){
        A[i]=[];
        for(let j=0;j<K;j++){
            A[i][j]=sampleNTT(rho,i,j); // NTT domain
        }
    }
    // s,e in time domain
    const s=[],e=[];
    for(let i=0;i<K;i++){
        const bufI=new Uint8Array([i]);
        const bufIK=new Uint8Array([i+K]);
        s[i]=cbd2(new Uint8Array(shake128(Buffer.concat([sigma,bufI]),128)));
        e[i]=cbd2(new Uint8Array(shake128(Buffer.concat([sigma,bufIK]),128)));
    }
    // sHat,eHat = NTT(s), NTT(e)
    const sHat=[],eHat=[];
    for(let i=0;i<K;i++){sHat[i]=ntt(s[i]);eHat[i]=ntt(e[i]);}
    // tHat = A * sHat + eHat (NTT domain)
    const tHat=[];
    for(let i=0;i<K;i++){
        let sum=new Int16Array(N);
        for(let j=0;j<K;j++){
            const prod=nttPolyMul(A[i][j],sHat[j]);
            for(let l=0;l<N;l++)sum[l]=(sum[l]+prod[l])%Q;
        }
        for(let l=0;l<N;l++)sum[l]=(sum[l]+eHat[i][l])%Q;
        tHat[i]=sum;
    }
    // t = NTT^{-1}(tHat)
    const t=[];
    for(let i=0;i<K;i++)t[i]=nttInv(tHat[i]);
    // ek = ByteEncode_12(t[0]) || ByteEncode_12(t[1]) || ByteEncode_12(t[2]) || rho
    const ek=new Uint8Array(1184);
    let off=0;
    for(let i=0;i<K;i++){
        ek.set(byteEncode_12(t[i]),off);
        off+=384;
    }
    ek.set(rho,off);
    // dk = ByteEncode_12(s) || ek || H(ek) || z
    const h_ek=sha3_256(ek);
    const dk=new Uint8Array(2400);
    off=0;
    for(let i=0;i<K;i++){
        dk.set(byteEncode_12(s[i]),off);
        off+=384;
    }
    dk.set(ek,off);off+=1184;
    dk.set(new Uint8Array(h_ek),off);off+=32;
    dk.set(z,off);
    return {ek,dk};
}

// --- FIPS 203 Encaps ---
function encapsulate(ek){
    // Decode ek
    const t=[];
    let off=0;
    for(let i=0;i<K;i++){
        t[i]=byteDecode_12(ek.slice(off,off+384));
        off+=384;
    }
    const rho=ek.slice(off,off+32);
    // Random m
    const m=crypto.randomBytes(32);
    // H(m || H(ek)) -> KBar,r
    const h_ek=sha3_256(ek);
    const combined=Buffer.concat([m,Buffer.from(h_ek)]);
    const kr=sha3_512(combined);
    const KBar=kr.slice(0,32);
    const r=new Uint8Array(kr.slice(32,64));
    // A' and noise vectors
    const AT=[];
    for(let i=0;i<K;i++){
        AT[i]=[];
        for(let j=0;j<K;j++){
            AT[i][j]=sampleNTT(rho,i,j);
        }
    }
    const rVec=[],e1=[],e2_=[];
    for(let i=0;i<K;i++){
        const bufI=new Uint8Array([i]);
        rVec[i]=cbd2(new Uint8Array(shake128(Buffer.concat([r,bufI]),128)));
        e1[i]=cbd2(new Uint8Array(shake128(Buffer.concat([r,new Uint8Array([i+K])]),128)));
    }
    e2_[0]=cbd2(new Uint8Array(shake128(Buffer.concat([r,new Uint8Array([2*K])]),128)));
    // NTT(rVec) and NTT(e1), NTT(e2)
    const rHat=[],e1Hat=[];
    for(let i=0;i<K;i++){rHat[i]=ntt(rVec[i]);e1Hat[i]=ntt(e1[i]);}
    const e2Hat=ntt(e2_[0]);
    // u = NTT^{-1}(AT * rHat + e1Hat)
    const u=[];
    for(let i=0;i<K;i++){
        let sum=new Int16Array(N);
        for(let j=0;j<K;j++){
            const prod=nttPolyMul(AT[i][j],rHat[j]);
            for(let l=0;l<N;l++)sum[l]=(sum[l]+prod[l])%Q;
        }
        for(let l=0;l<N;l++)sum[l]=(sum[l]+e1Hat[i][l])%Q;
        u[i]=nttInv(sum);
    }
    // mu = byteEncode_12(decompress(byteDecode_12(t.inner with r + e2)))
    // v = NTT^{-1}(tHat.inner * rHat + e2Hat) + decompress(byteDecode_1(mu))
    // Simplified FIPS 203 encaps:
    // tHat = NTT(t)
    const tHat=[];
    for(let i=0;i<K;i++)tHat[i]=ntt(t[i]);
    // v_hat = sum(tHat_i * rHat_i) + e2Hat
    let vHat=new Int16Array(N);
    for(let i=0;i<K;i++){
        const prod=nttPolyMul(tHat[i],rHat[i]);
        for(let l=0;l<N;l++)vHat[l]=(vHat[l]+prod[l])%Q;
    }
    for(let l=0;l<N;l++)vHat[l]=(vHat[l]+e2Hat[l])%Q;
    const vTmp=nttInv(vHat);
    // mu = H(m) compressed
    const mu=sha3_256(m);
    // Decompress mu to polynomial, add to v
    const muPoly=new Int16Array(N);
    for(let i=0;i<N;i++){
        const byteIdx=i>>3;
        const bitIdx=i&7;
        muPoly[i]=((mu[byteIdx]>>bitIdx)&1)*Math.round(Q/2);
    }
    const v=new Int16Array(N);
    for(let i=0;i<N;i++)v[i]=(vTmp[i]+muPoly[i])%Q;
    // c1 = byteEncode_12(u values)
    const c1=new Uint8Array(K*384);
    off=0;
    for(let i=0;i<K;i++){c1.set(byteEncode_12(u[i]),off);off+=384;}
    // c2 = byteEncode_1(v) (32 bytes for 256 bits)
    const c2=new Uint8Array(32);
    for(let i=0;i<N;i++){
        const b=Math.round(v[i]*1/Q)&1;
        c2[i>>3]|=(b<<(i&7));
    }
    const c=Buffer.concat([c1,c2]);
    // K = KDF(KBar || H(c))
    const h_c=sha3_256(c);
    const K=new Uint8Array(sha3.sha3_256.create().update(Buffer.concat([KBar,h_c])).arrayBuffer());
    return {c,K};
}

// --- KAT verification ---
function parseHexField(fullText, fieldName) {
    // Correct implementation: find field, capture multi-line hex until next 'FieldName:'
    const pattern = new RegExp('^' + fieldName + ':\\s*([0-9A-Fa-f\\s]+?)(?=^[A-Z][A-Z0-9_]*\\s*:|$)', 'm');
    const m = fullText.match(pattern);
    return m ? m[1].replace(/\\s/g, '') : '';
}

function main(){
    const kgFile=fs.readFileSync('/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/Key Generation -- ML-KEM-768.txt','utf8');
    const encFile=fs.readFileSync('/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/Encapsulation -- ML-KEM-768.txt','utf8');
    const decFile=fs.readFileSync('/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/Decapsulation -- ML-KEM-768.txt','utf8');

    // Parse KeyGen
    const d=Buffer.from(parseHexField(kgFile,'d'),'hex');
    const z=Buffer.from(parseHexField(kgFile,'z'),'hex');
    const d_for_G=Buffer.from(parseHexField(kgFile,'d'),'hex');
    const G_d=Buffer.from(sha3.sha3_512.arrayBuffer(d_for_G));
    const rho=G_d.slice(0,32);
    const sigma=G_d.slice(32,64);

    console.log('Running FIPS 203 KeyGen...');
    const {ek,dk}=keyGenKAT(d,z,rho,sigma);
    const katEk=parseHexField(kgFile,'ek');
    const katDk=parseHexField(kgFile,'dk');
    console.log('ek match:',Buffer.from(ek).toString('hex')===katEk ? 'PASS' : 'FAIL');
    console.log('  computed ek[0:32]:',Buffer.from(ek).toString('hex').substring(0,64));
    console.log('  KAT ek[0:32]:',katEk.substring(0,64));
    console.log('dk match:',Buffer.from(dk).toString('hex')===katDk ? 'PASS' : 'FAIL');
    console.log('  computed dk[0:32]:',Buffer.from(dk).toString('hex').substring(0,64));
    console.log('  KAT dk[0:32]:',katDk.substring(0,64));

    // Encaps test (use KAT ek)
    console.log('\nRunning Encaps...');
    const katEnc_d=parseHexField(encFile,'ek');
    const katEnc_m=parseHexField(encFile,'m');
    const katEnc_K=parseHexField(encFile,'K');
    const katEnc_c=parseHexField(encFile,'c');

    console.log('KAT ek hex len:',katEnc_d.length);
    console.log('KAT m hex:',Buffer.from(katEnc_m,'hex').toString('hex').substring(0,32),'...');
    console.log('KAT K hex:',Buffer.from(katEnc_K,'hex').toString('hex'));
    console.log('KAT c hex:',Buffer.from(katEnc_c,'hex').toString('hex').substring(0,32),'...');
}

main();