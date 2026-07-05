
const sha3=require('js-sha3');
const fs=require('fs');
const Q=3329,N=256,K=3;

// === Zetas ===
function br7(x){let r=0;for(let i=0;i<7;i++){r=(r<<1)|(x&1);x>>=1;}return r;}
const zetas=new Int16Array(128);
for(let i=0;i<128;i++){let b=BigInt(br7(i)),r=1n,base=17n;while(b>0n){if(b&1n)r=(r*base)%BigInt(Q);base=(base*base)%BigInt(Q);b>>=1n;}zetas[i]=Number(r);}
const zetasInv=new Int16Array(128);
for(let i=1;i<128;i++){let v=BigInt(zetas[i]),r=1n,e=BigInt(Q-2);while(e>0n){if(e&1n)r=(r*v)%BigInt(Q);v=(v*v)%BigInt(Q);e>>=1n;}zetasInv[i]=Number(r);}

// === NTT ===
function ntt(f){
    const fh=new Int16Array(f);let i=1;
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
    const f=new Int16Array(fh);let i=127;
    for(let len=2;len<=128;len<<=1){
        for(let start=0;start<N;start+=2*len){
            const z=zetasInv[i--];
            for(let j=start;j<start+len;j++){
                const t=f[j];f[j]=(t+f[j+len])%Q;if(f[j]>=Q)f[j]-=Q;
                f[j+len]=Number((BigInt(z)*BigInt((t-f[j+len]+2*Q)%Q))%BigInt(Q));
            }
        }
    }
    for(let j=0;j<N;j++){f[j]=Number((BigInt(f[j])*BigInt(3303))%BigInt(Q));if(f[j]<0)f[j]+=Q;}
    return f;
}

// === Basemul ===
function basemul(a0,a1,b0,b1,zeta){
    return [Number((BigInt(a0)*BigInt(b0)+BigInt(zeta)*BigInt(a1)*BigInt(b1))%BigInt(Q)),
            Number((BigInt(a0)*BigInt(b1)+BigInt(a1)*BigInt(b0))%BigInt(Q))];
}

function nttPolyMul(fh,gh){
    const r=new Int16Array(N);
    for(let i=0;i<64;i++){
        const z=zetas[64+i];
        const [r0,r1]=basemul(fh[4*i],fh[4*i+1],gh[4*i],gh[4*i+1],z);
        r[4*i]=r0;r[4*i+1]=r1;
        const [r2,r3]=basemul(fh[4*i+2],fh[4*i+3],gh[4*i+2],gh[4*i+3],(Q-z)%Q);
        r[4*i+2]=r2;r[4*i+3]=r3;
    }
    return r;
}

// === XOF: SHAKE-128 for SampleNTT ===
function shake128(data,bytes){
    return sha3.shake128.create(bytes*8).update(data).arrayBuffer();
}

// === PRF: SHAKE-256 for CBD ===
function shake256(data,bytes){
    return sha3.shake256.create(bytes*8).update(data).arrayBuffer();
}

// === SampleNTT (FIPS 203 Algo 7) ===
function sampleNTT(seed,i,j){
    const nonce=new Uint8Array([i&0xff,j&0xff]);
    const input=new Uint8Array(seed.length+2);input.set(seed,0);input.set(nonce,seed.length);
    const stream=new Uint8Array(shake128(input,504));
    const a=new Int16Array(N);let pos=0,idx=0;
    while(pos<N&&idx<503){
        const d1=stream[idx]|((stream[idx+1]&0x0F)<<8);
        const d2=(stream[idx+1]>>4)|(stream[idx+2]<<4);
        idx+=3;
        if(d1<Q)a[pos++]=d1;
        if(pos<N&&d2<Q)a[pos++]=d2;
    }
    return a;
}

// === SamplePolyCBD (FIPS 203 Algo 9) ===
function cbd2(buf){
    const r=new Int16Array(256);
    for(let i=0;i<128;i++){const b=buf[i];r[2*i]=(b&1)+((b>>1)&1)-((b>>2)&1)-((b>>3)&1);r[2*i+1]=((b>>4)&1)+((b>>5)&1)-((b>>6)&1)-((b>>7)&1);}
    return r;
}

function samplePolyCBD(seed){
    const buf=new Uint8Array(shake256(seed,128));
    return cbd2(buf);
}

// === ByteEncode/Decode (FIPS 203 Algo 4/5) ===
function byteEncode_12(f){
    const out=new Uint8Array(384);
    for(let i=0;i<N;i+=2){
        const a=((f[i]%Q)+Q)%Q, b=((f[i+1]%Q)+Q)%Q;
        const v0=Math.round(a*4095/Q), v1=Math.round(b*4095/Q);
        const off=i*3/2;
        out[off]=(v0>>4)&0xFF;
        out[off+1]=((v0&0x0F)<<4)|((v1>>8)&0x0F);
        out[off+2]=v1&0xFF;
    }
    return out;
}

function byteDecode_12(data,offset){
    const f=new Int16Array(N);
    for(let i=0;i<N;i+=2){
        const b0=data[offset+i*3/2],b1=data[offset+i*3/2+1],b2=data[offset+i*3/2+2];
        const v0=((b0<<4)|((b1>>4)&0x0F));
        const v1=(((b1&0x0F)<<8)|b2);
        f[i]=Math.round(v0*Q/4095);
        f[i+1]=Math.round(v1*Q/4095);
    }
    return f;
}

// === Parser ===
function parseHexField(fullText,fieldName){
    const lines=fullText.split('\n');let capture=false,val='';
    for(const line of lines){
        if(capture&&/^[a-zA-Z]/.test(line))break;
        if(capture){val+=line.trim();continue;}
        if(line.startsWith(fieldName+':')){capture=true;val=line.substring(fieldName.length+1).trim();}
    }
    return val.replace(/\s/g,'');
}

// === MAIN ===
console.log('=== FIPS 203 ML-KEM-768 KeyGen KAT ===\n');
const kgFile=fs.readFileSync('/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/Key Generation -- ML-KEM-768.txt','utf8');
const rho=Buffer.from(parseHexField(kgFile,'rho'),'hex');
const sigma=Buffer.from(parseHexField(kgFile,'sigma'),'hex');
const katEkHex=parseHexField(kgFile,'ek');
const katDkHex=parseHexField(kgFile,'dk');

// KeyGen
const A=[];for(let i=0;i<K;i++){A[i]=[];for(let j=0;j<K;j++)A[i][j]=sampleNTT(rho,i,j);}
const s=[],e=[];
for(let i=0;i<K;i++){s[i]=samplePolyCBD(Buffer.concat([sigma,new Uint8Array([i])]));e[i]=samplePolyCBD(Buffer.concat([sigma,new Uint8Array([i+K])]));}
const sHat=[],eHat=[];for(let i=0;i<K;i++){sHat[i]=ntt(s[i]);eHat[i]=ntt(e[i]);}

// Verify A[0][0]
const kat_aHat_line=kgFile.match(/aHat: \[\[\[(.*?)\]\]\]/s);
if(kat_aHat_line){
    const coefs=kat_aHat_line[1].split(',').map(s=>parseInt(s.trim()));
    let aOk=true;
    for(let l=0;l<10;l++){if(A[0][0][l]!==coefs[l]){aOk=false;console.log('A[0][0][',l,']: my=',A[0][0][l],' KAT=',coefs[l]);}}
    console.log('A[0][0] match:',aOk?'PASS':'FAIL');
}

// Verify s (time domain)
const kat_s_match=kgFile.match(/s: \[\[\[(.*?)\]\]\]/s);
if(kat_s_match){
    // Parse KAT s (values stored mod Q, need to match our mod-Q representation)
    const sCoefs=kat_s_match[1].split(',').map(s=>parseInt(s.trim()));
    let sOk=true;
    for(let l=0;l<10;l++){const my=((s[0][l]%Q)+Q)%Q;if(my!==sCoefs[l]){sOk=false;console.log('s[0][',l,']: my=',my,' KAT=',sCoefs[l]);}}
    console.log('s[0] match:',sOk?'PASS':'FAIL');
}

// Verify sHat
const kat_shat_match=kgFile.match(/sHat: \[\[\[(.*?)\]\]\]/s);
if(kat_shat_match){
    const shCoefs=kat_shat_match[1].split(',').map(s=>parseInt(s.trim()));
    let shOk=true;
    for(let l=0;l<10;l++){const my=((sHat[0][l]%Q)+Q)%Q;if(my!==shCoefs[l]){shOk=false;console.log('sHat[0][',l,']: my=',my,' KAT=',shCoefs[l]);}}
    console.log('sHat[0] match:',shOk?'PASS':'FAIL');
}

// tHat and t
const tHat=[];
for(let i=0;i<K;i++){
    let sum=new Int16Array(N);
    for(let j=0;j<K;j++){const prod=nttPolyMul(A[i][j],sHat[j]);for(let l=0;l<N;l++)sum[l]=(sum[l]+prod[l])%Q;}
    for(let l=0;l<N;l++)sum[l]=(sum[l]+eHat[i][l])%Q;
    tHat[i]=sum;
}
const t=[];for(let i=0;i<K;i++)t[i]=nttInv(tHat[i]);

// Verify tHat
const kat_th_match=kgFile.match(/tHat: \[\[\[(.*?)\]\]\]/s);
if(kat_th_match){
    const thCoefs=kat_th_match[1].split(',').map(s=>parseInt(s.trim()));
    let thOk=true;
    for(let l=0;l<10;l++){const my=((tHat[0][l]%Q)+Q)%Q;if(my!==thCoefs[l]){thOk=false;console.log('tHat[0][',l,']: my=',my,' KAT=',thCoefs[l]);}}
    console.log('tHat[0] match:',thOk?'PASS':'FAIL');
}

// ek
const ek=new Uint8Array(1184);let off=0;
for(let i=0;i<K;i++){ek.set(byteEncode_12(t[i]),off);off+=384;}
ek.set(rho,off);
const myEk=Buffer.from(ek).toString('hex');
console.log('\n=== ek ===');
console.log('KAT ek[0..63]:',katEkHex.substring(0,64));
console.log('My  ek[0..63]:',myEk.substring(0,64));
console.log('ek match:',myEk===katEkHex?'PASS':'FAIL');
if(myEk!==katEkHex){
    let dc=0;
    for(let i=0;i<katEkHex.length;i++){if(myEk[i]!==katEkHex[i])dc++;}
    console.log('Diff chars:',dc,'/',katEkHex.length);
    // Show first mismatch
    for(let i=0;i<Math.min(64,katEkHex.length);i+=2){
        if(myEk.substring(i,i+2)!==katEkHex.substring(i,i+2)){
            console.log('First mismatch at byte',i/2,': my=',myEk.substring(i,i+2),'kat=',katEkHex.substring(i,i+2));
            break;
        }
    }
}
