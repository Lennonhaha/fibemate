
const sha3 = require('js-sha3');
const fs = require('fs');
const Q=3329,N=256,K=3;

function br7(x){let r=0;for(let i=0;i<7;i++){r=(r<<1)|(x&1);x>>=1;}return r;}
const zetas=new Int16Array(128);
for(let i=0;i<128;i++){let b=BigInt(br7(i)),r=1n,base=17n;while(b>0n){if(b&1n)r=(r*base)%BigInt(Q);base=(base*base)%BigInt(Q);b>>=1n;}zetas[i]=Number(r);}
const zetasInv=new Int16Array(128);
for(let i=1;i<128;i++){let v=BigInt(zetas[i]),r=1n,e=BigInt(Q-2);while(e>0n){if(e&1n)r=(r*v)%BigInt(Q);v=(v*v)%BigInt(Q);e>>=1n;}zetasInv[i]=Number(r);}

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

function cbd2(buf){
    const r=new Int16Array(N);
    for(let i=0;i<128;i++){const b=buf[i];r[2*i]=(b&1)+((b>>1)&1)-((b>>2)&1)-((b>>3)&1);r[2*i+1]=((b>>4)&1)+((b>>5)&1)-((b>>6)&1)-((b>>7)&1);}
    return r;
}

// === KEY FIX: js-sha3 shake128(data, outputBITS) - 504 bytes = 4032 bits ===
function shake128(data,bytes){return sha3.shake128.create(bytes*8).update(data).arrayBuffer();}

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

function byteEncode_12(f){
    const out=new Uint8Array(384);
    for(let i=0;i<N;i+=2){
        const v0=Math.round((((f[i]%Q)+Q)%Q)*4095/Q);
        const v1=Math.round((((f[i+1]%Q)+Q)%Q)*4095/Q);
        const off=i*3/2;
        out[off]=(v0>>4)&0xFF;
        out[off+1]=((v0&0x0F)<<4)|((v1>>8)&0x0F);
        out[off+2]=v1&0xFF;
    }
    return out;
}

function parseHexField(fullText,fieldName){
    const lines=fullText.split('\n');let capture=false,val='';
    for(const line of lines){
        if(capture&&/^[a-zA-Z]/.test(line))break;
        if(capture){val+=line.trim();continue;}
        if(line.startsWith(fieldName+':')){capture=true;val=line.substring(fieldName.length+1).trim();}
    }
    return val.replace(/\s/g,'');
}

console.log('=== FIPS 203 KeyGen KAT Test ===');
const kgFile=fs.readFileSync('/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/Key Generation -- ML-KEM-768.txt','utf8');
const d=Buffer.from(parseHexField(kgFile,'d'),'hex');
const z=Buffer.from(parseHexField(kgFile,'z'),'hex');
const rho=Buffer.from(parseHexField(kgFile,'rho'),'hex');
const sigma=Buffer.from(parseHexField(kgFile,'sigma'),'hex');
const katEkHex=parseHexField(kgFile,'ek');

console.log('KAT ek[0..63]:',katEkHex.substring(0,64));

// KeyGen
const A=[];for(let i=0;i<K;i++){A[i]=[];for(let j=0;j<K;j++)A[i][j]=sampleNTT(rho,i,j);}
console.log('A[0][0][0..3]:',A[0][0][0],A[0][0][1],A[0][0][2],A[0][0][3]);
console.log('KAT aHat[0][0][0..3]: 503 2488 1249 1628');
console.log('A match:',A[0][0][0]===503&&A[0][0][1]===2488?'YES':'NO');

const s=[],e=[];
for(let i=0;i<K;i++){
    s[i]=cbd2(new Uint8Array(shake128(Buffer.concat([sigma,new Uint8Array([i])]),128)));
    e[i]=cbd2(new Uint8Array(shake128(Buffer.concat([sigma,new Uint8Array([i+K])]),128)));
}
const sHat=[],eHat=[];for(let i=0;i<K;i++){sHat[i]=ntt(s[i]);eHat[i]=ntt(e[i]);}
console.log('sHat[0][0..3]:',sHat[0][0],sHat[0][1],sHat[0][2],sHat[0][3]);
console.log('KAT sHat[0][0..3]: 1817 1197 2005 676');
console.log('sHat match:',(sHat[0][0]+3329)%3329===1817?'YES':'NO');

// tHat = A * sHat + eHat
const tHat=[];
for(let i=0;i<K;i++){
    let sum=new Int16Array(N);
    for(let j=0;j<K;j++){const prod=nttPolyMul(A[i][j],sHat[j]);for(let l=0;l<N;l++)sum[l]=(sum[l]+prod[l])%Q;}
    for(let l=0;l<N;l++)sum[l]=(sum[l]+eHat[i][l])%Q;
    tHat[i]=sum;
}

const t=[];for(let i=0;i<K;i++)t[i]=nttInv(tHat[i]);
console.log('t[0][0..3]:',t[0][0],t[0][1],t[0][2],t[0][3]);

// ek
const ek=new Uint8Array(1184);let off=0;
for(let i=0;i<K;i++){ek.set(byteEncode_12(t[i]),off);off+=384;}
ek.set(rho,off);
const myEk=Buffer.from(ek).toString('hex');
console.log('\nMy ek[0..63]:',myEk.substring(0,64));
console.log('KAT ek[0..63]:',katEkHex.substring(0,64));
console.log('ek match:',myEk===katEkHex?'PASS':'FAIL');
if(myEk!==katEkHex){
    let diffCount=0;
    for(let i=0;i<katEkHex.length;i++){if(myEk[i]!==katEkHex[i])diffCount++;}
    console.log('Diff chars:',diffCount,'/',katEkHex.length);
}
