
const sha3=require('js-sha3');
const fs=require('fs');
const Q=3329n,N=256,K=3;

function shake128(data,bytes){return sha3.shake128.create(bytes*8).update(data).arrayBuffer();}
function shake256(data,bytes){return sha3.shake256.create(bytes*8).update(data).arrayBuffer();}
function sampleNTT(seed,j,i){
    const nonce=new Uint8Array([j&0xff,i&0xff]);
    const input=new Uint8Array(seed.length+2);input.set(seed,0);input.set(nonce,seed.length);
    const stream=new Uint8Array(shake128(input,504));
    const a=new Int16Array(N);let pos=0,idx=0;
    while(pos<N&&idx<503){
        const d1=stream[idx]|((stream[idx+1]&0x0F)<<8);
        const d2=(stream[idx+1]>>4)|(stream[idx+2]<<4);
        idx+=3;
        if(d1<Number(Q))a[pos++]=d1;
        if(pos<N&&d2<Number(Q))a[pos++]=d2;
    }
    return a;
}
function cbd2(buf){const r=new Int16Array(256);for(let i=0;i<128;i++){const b=buf[i];r[2*i]=(b&1)+((b>>1)&1)-((b>>2)&1)-((b>>3)&1);r[2*i+1]=((b>>4)&1)+((b>>5)&1)-((b>>6)&1)-((b>>7)&1);}return r;}
function samplePolyCBD(seed){return cbd2(new Uint8Array(shake256(seed,128)));}

const kgFile=fs.readFileSync('/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/Key Generation -- ML-KEM-768.txt','utf8');
function parseArrayField(fieldName){
    const lines=kgFile.split('\n');let cap=false,val='';
    for(const l of lines){
        if(cap&&/^[a-zA-Z]/.test(l))break;
        if(cap){val+=l.trim();continue;}
        if(l.startsWith(fieldName+':')){cap=true;val=l.substring(fieldName.length+1).trim();}
    }
    return val.replace(/[\s\[\]]/g,'').split(',').filter(s=>s!=='').map(Number);
}
function parseHexField(fieldName){
    const lines=kgFile.split('\n');let capture=false,val='';
    for(const line of lines){
        if(capture&&/^[a-zA-Z]/.test(line))break;
        if(capture){val+=line.trim();continue;}
        if(line.startsWith(fieldName+':')){capture=true;val=line.substring(fieldName.length+1).trim();}
    }
    return val.replace(/\s/g,'');
}

const d_for_kat=Buffer.from(parseHexField('d'),'hex');
const G_d=Buffer.from(sha3.sha3_512.arrayBuffer(d_for_kat));
const rho=G_d.slice(0,32);
const sigma=G_d.slice(32,64);


function br7(x){let r=0;for(let i=0;i<7;i++){r=(r<<1)|(x&1);x>>=1;}return r;}
const zetas=[];for(let i=0;i<128;i++){let b=BigInt(br7(i)),r=1n,base=17n;while(b>0n){if(b&1n)r=(r*base)%Q;base=(base*base)%Q;b>>=1n;}zetas[i]=r;}

function ntt(f){
    const fh=new Int16Array(f);let i=1;
    for(let len=128;len>=2;len>>=1){
        for(let start=0;start<N;start+=2*len){
            const z=zetas[i++];
            for(let j=start;j<start+len;j++){
                const t=Number((z*BigInt(fh[j+len]))%Q);
                fh[j+len]=(fh[j]-t)%Number(Q);if(fh[j+len]<0)fh[j+len]+=Number(Q);
                fh[j]=(fh[j]+t)%Number(Q);if(fh[j]>=Number(Q))fh[j]-=Number(Q);
            }
        }
    }
    for(let j=0;j<N;j++){if(fh[j]<0)fh[j]+=Number(Q);}
    return fh;
}

// ***** FIX: N^{-1} = 256^{-1} = 3316 (was 3303 = 128^{-1}) *****
// Verify: 256 * 3316 = 849,000? No
// 256 * 13 = 3328 = -1 mod 3329, so 256^{-1} = -13 = 3316
const N_INV = 3316;
console.log('256 *',N_INV,'mod 3329 =',(256*N_INV)%3329);

const zeInv=[];for(let i=1;i<128;i++){let v=zetas[i],r=1n,e=Q-2n;while(e>0n){if(e&1n)r=(r*v)%Q;v=(v*v)%Q;e>>=1n;}zeInv[i]=r;}

function nttInv(fh){
    const f=new Int16Array(fh);let idx=127;
    for(let len=2;len<=128;len<<=1){
        for(let start=0;start<N;start+=2*len){
            const z=zeInv[idx--];
            for(let j=start;j<start+len;j++){
                const t=f[j];f[j]=(t+f[j+len])%Number(Q);if(f[j]>=Number(Q))f[j]-=Number(Q);
                f[j+len]=Number((z*BigInt((f[j+len]-t+2*Number(Q))%Number(Q)))%Q);
            }
        }
    }
    for(let j=0;j<N;j++){f[j]=Number((BigInt(f[j])*BigInt(N_INV))%Q);if(f[j]<0)f[j]+=Number(Q);}
    return f;
}

function basemul(a0,a1,b0,b1,zeta){
    const z=BigInt(zeta),a0b=BigInt(a0),a1b=BigInt(a1),b0b=BigInt(b0),b1b=BigInt(b1);
    return [Number((a0b*b0b+z*a1b*b1b)%Q),Number((a0b*b1b+a1b*b0b)%Q)];
}
function nttPolyMul(fh,gh){
    const r=new Int16Array(N);
    for(let i=0;i<64;i++){const z=Number(zetas[64+i]),negZ=(Number(Q)-z)%Number(Q);const [r0,r1]=basemul(fh[4*i],fh[4*i+1],gh[4*i],gh[4*i+1],z);r[4*i]=r0;r[4*i+1]=r1;const [r2,r3]=basemul(fh[4*i+2],fh[4*i+3],gh[4*i+2],gh[4*i+3],negZ);r[4*i+2]=r2;r[4*i+3]=r3;}
    return r;
}
function byteEncode_12(f){
    const out=new Uint8Array(384);
    for(let i=0;i<N;i+=2){
        const a=((f[i]%Number(Q))+Number(Q))%Number(Q),b=((f[i+1]%Number(Q))+Number(Q))%Number(Q);
        const v0=Math.round(a*4095/Number(Q)),v1=Math.round(b*4095/Number(Q));
        const off=i*3/2;
        out[off]=(v0>>4)&0xFF;
        out[off+1]=((v0&0x0F)<<4)|((v1>>8)&0x0F);
        out[off+2]=v1&0xFF;
    }
    return out;
}

// Build
const A=[];for(let i=0;i<K;i++){A[i]=[];for(let j=0;j<K;j++)A[i][j]=sampleNTT(rho,j,i);}
const s=[],sHat=[];for(let i=0;i<K;i++){s[i]=samplePolyCBD(Buffer.concat([sigma,new Uint8Array([i])]));sHat[i]=ntt(s[i]);}
const e=[],eHat=[];for(let i=0;i<K;i++){e[i]=samplePolyCBD(Buffer.concat([sigma,new Uint8Array([i+K])]));eHat[i]=ntt(e[i]);}

const tHat=[];
for(let i=0;i<K;i++){let sum=new Int16Array(N);for(let j=0;j<K;j++){const prod=nttPolyMul(A[i][j],sHat[j]);for(let l=0;l<N;l++)sum[l]=(sum[l]+prod[l])%Number(Q);}for(let l=0;l<N;l++)sum[l]=(sum[l]+eHat[i][l])%Number(Q);tHat[i]=sum;}

// Round-trip test
const testBack=ntt(nttInv(tHat[0]));
console.log('\nRound-trip nttInv->ntt [0..3]:',((testBack[0]%Number(Q))+Number(Q))%Number(Q),((testBack[1]%Number(Q))+Number(Q))%Number(Q),((testBack[2]%Number(Q))+Number(Q))%Number(Q),((testBack[3]%Number(Q))+Number(Q))%Number(Q));
console.log('Expected tHat[0..3]:',((tHat[0][0]%Number(Q))+Number(Q))%Number(Q),((tHat[0][1]%Number(Q))+Number(Q))%Number(Q),((tHat[0][2]%Number(Q))+Number(Q))%Number(Q),((tHat[0][3]%Number(Q))+Number(Q))%Number(Q));

// Decode KAT t from KAT ek
const ekBytes=Buffer.from(parseHexField('ek'),'hex');
const katT0=(()=>{
    const f=new Int16Array(N);
    for(let i=0;i<N;i+=2){
        const b0=ekBytes[i*3/2],b1=ekBytes[i*3/2+1],b2=ekBytes[i*3/2+2];
        const v0=(b0<<4)|((b1>>4)&0x0F),v1=((b1&0x0F)<<8)|b2;
        f[i]=Math.round(v0*Number(Q)/4095);f[i+1]=Math.round(v1*Number(Q)/4095);
    }
    return f;
})();

// My t
const t=[];
for(let i=0;i<K;i++)t[i]=nttInv(tHat[i]);

console.log('\nMy  t[0][0..3]:',t[0][0],t[0][1],t[0][2],t[0][3]);
console.log('KAT t[0][0..3]:',katT0[0],katT0[1],katT0[2],katT0[3]);

let m=true;
for(let l=0;l<20;l++){if(t[0][l]!==katT0[l]){console.log('t[0]['+l+']: my='+t[0][l]+' kat='+katT0[l]);m=false;}}
console.log('t[0] match:',m?'PASS':'FAIL');

// ek
const ek=new Uint8Array(K*384+32);let off=0;
for(let i=0;i<K;i++){ek.set(byteEncode_12(t[i]),off);off+=384;}
ek.set(rho,off);
const myEk=Buffer.from(ek).toString('hex');
const katEk=parseHexField('ek');
console.log('\n=== EK ===');
console.log('KAT ek[0..63]:',katEk.substring(0,64));
console.log('My  ek[0..63]:',myEk.substring(0,64));
console.log('ek match:',myEk===katEk?'PASS':'FAIL');
if(myEk!==katEk){let dc=0;for(let i=0;i<katEk.length;i++){if(myEk[i]!==katEk[i])dc++;}console.log('Diff chars:',dc,'/',katEk.length);}
