// Correct KAT parser v3: properly bounded fields
const Q=3329,N=256,K=3,fs=require('fs');

const KAT_FIELDS=['z','d','rho','sigma','aHat','s','sHat','e','eHat','ek','dk'];

function readKATField(field){
    // Read file as string
    const kg=fs.readFileSync('/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/Key Generation -- ML-KEM-768.txt','utf8');
    const idx=kg.indexOf(field+':');
    if(idx<0){console.log('Field '+field+' not found');return null;}
    
    // Find start of value (skip field name and whitespace)
    let pos=idx+field.length+1;
    while(pos<kg.length&&(kg[pos]==' '||kg[pos]=='\t'||kg[pos]=='\n'||kg[pos]=='\r'))pos++;
    
    // Find end: next field or end of file
    let endPos=kg.length;
    for(let f of KAT_FIELDS){
        if(f===field)continue;
        const fi=kg.indexOf('\n'+f+':',pos);
        if(fi!==-1&&fi<endPos)endPos=fi;
    }
    const section=kg.slice(pos,endPos);
    
    // Debug: print first 200 chars
    console.log('Field '+field+': first 150 chars: '+JSON.stringify(section.slice(0,150)));
    
    // Extract all integers from this bounded section
    const nums=[];
    let neg=0;
    for(let i=0;i<section.length;i++){
        const c=section[i];
        if(c>='0'&&c<='9'){let v=0,j=i;while(j<section.length&&section[j]>='0'&&section[j]<='9'){v=v*10+(section.charCodeAt(j)-48);j++;}nums.push(neg?-v:v);neg=0;i=j-1;}
        else if(c=='-')neg=1;
    }
    console.log('Field '+field+': parsed '+nums.length+' integers, first 8: '+nums.slice(0,8).join(','));
    return nums;
}

function readKATHex(field){
    const nums=readKATField(field);
    if(!nums)return null;
    // Convert array of 0x00-0xFF integers to Buffer
    const buf=Buffer.alloc(nums.length);
    for(let i=0;i<nums.length;i++)buf[i]=nums[i]&0xFF;
    return buf;
}

function toU(v){return ((v%Q)+Q)%Q;}

// Test: read s (should be 768 values)
console.log('=== Testing s ===');
const sVals=readKATField('s');
console.log('sVals.length=',sVals? sVals.length:0);

console.log('\n=== Testing sHat ===');
const shVals=readKATField('sHat');
console.log('shVals.length=',shVals? shVals.length:0);
if(shVals&&shVals.length>=8)console.log('shVals[0..7]:',shVals[0],shVals[1],shVals[2],shVals[3],shVals[4],shVals[5],shVals[6],shVals[7]);

console.log('\n=== Testing aHat ===');
const aVals=readKATField('aHat');
console.log('aVals.length=',aVals? aVals.length:0);
if(aVals&&aVals.length>=8)console.log('aVals[0..7]:',aVals[0],aVals[1],aVals[2],aVals[3],aVals[4],aVals[5],aVals[6],aVals[7]);

console.log('\n=== Testing e ===');
const eVals=readKATField('e');
console.log('eVals.length=',eVals? eVals.length:0);

console.log('\n=== Testing eHat ===');
const ehVals=readKATField('eHat');
console.log('ehVals.length=',ehVals? ehVals.length:0);

// If all lengths are correct, proceed to NTT verification
if(sVals&&sVals.length===768&&shVals&&shVals.length===768){
    console.log('\n=== All lengths correct! Proceeding to NTT verify ===');
}