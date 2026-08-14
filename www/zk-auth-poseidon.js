// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Auth v12 — Poseidon ZK Integration
 * 
 * 使用 Poseidon 哈希承诺 + Groth16 ZK 证明
 * 基于 circom 电路：identity.circom
 * 
 * 后端 API 端点：
 * - POST /api/auth/register-zk-snarks
 * - POST /api/auth/login-zk-snarks
 * - GET  /api/auth/zk-snarks/status
 * 
 * 请求格式：
 * - commitment: 64 hex 字符 (Poseidon 输出)
 * - proof: Groth16 证明对象 {pi_a, pi_b, pi_c, protocol, curve}
 * - publicSignals: [expectedCommitment]
 */

const API = window.location.origin + '/api';

// ZK 配置
const ZK_CONFIG = {
  // 电路文件路径（相对于网站根目录）
  // 注意：这些路径需要相对于部署后的网站根目录
  wasmUrl: 'circuits/build/identity_js/identity.wasm',
  zkeyUrl: 'circuits/build/setup/identity_final.zkey',
  vkeyUrl: 'circuits/build/setup/verification_key.json',
  // snarkjs 路径
  snarkjsUrl: 'src/snarkjs.min.js'
};

// 检测是否在本地文件系统运行
const IS_LOCAL = window.location.protocol === 'file:';
if (IS_LOCAL) {
  log('WARNING: Running from file:// protocol. ZK proof generation requires a web server.');
}

function log(msg) {
  var d = document.getElementById('debugLog');
  var line = '[ZK-v12] ' + String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if (d) d.innerHTML += '<div style="margin:2px 0;border-bottom:1px solid #222;">' + line + '</div>';
  console.log('[ZK-v12]', msg);
}

// ===== snarkjs 加载器 =====
let snarkjsLoaded = false;
let snarkjsModule = null;

async function loadSnarkJS() {
  if (snarkjsLoaded) return snarkjsModule;
  
  return new Promise((resolve, reject) => {
    if (typeof window.snarkjs !== 'undefined') {
      snarkjsModule = window.snarkjs;
      snarkjsLoaded = true;
      resolve(snarkjsModule);
      return;
    }
    
    var script = document.createElement('script');
    script.src = ZK_CONFIG.snarkjsUrl;
    script.onload = function() {
      snarkjsModule = window.snarkjs;
      snarkjsLoaded = true;
      log('snarkjs loaded successfully');
      resolve(snarkjsModule);
    };
    script.onerror = function() {
      reject(new Error('Failed to load snarkjs'));
    };
    document.head.appendChild(script);
  });
}

// ===== Poseidon 哈希（使用 snarkjs 的 poseidon 实现）=====
// 注意：这里我们使用一个简单的 Poseidon 实现，基于 circomlibjs 的常量
// 生产环境应该使用 wasm 版本的 poseidon

// Poseidon 常量（基于 circomlibjs v0.1.7）
const POSEIDON_CONSTANTS = {
  // 简化版本：使用预计算的 Poseidon(12345, 67890) 值
  // 实际实现需要完整的 Poseidon 哈希函数
  // 这里我们使用 snarkjs 的 fullProve 来生成证明
};

// 将字符串转换为 field element（简化版本）
function stringToFieldElement(str) {
  // 使用 SHA-256 哈希，然后取前 31 字节作为 field element
  // 实际 field 大小是 254 位（BN128 曲线）
  var encoder = new TextEncoder();
  var data = encoder.encode(str);
  
  // 简化的哈希到 field
  var hash = 0n;
  for (var i = 0; i < data.length; i++) {
    hash = (hash * 256n + BigInt(data[i])) % (2n ** 253n);
  }
  return hash;
}

// ===== 承诺生成（Poseidon 版本）=====

async function poseidonCommit(username) {
  // 生成随机 salt
  var saltBytes = new Uint8Array(32);
  crypto.getRandomValues(saltBytes);
  var salt = Array.from(saltBytes).map(function(b) { 
    return b.toString(16).padStart(2, '0'); 
  }).join('');
  
  // 将用户名转换为 field element
  var usernameField = stringToFieldElement(username);
  var saltField = BigInt('0x' + salt) % (2n ** 253n);
  
  // 注意：这里我们不能直接在浏览器中计算 Poseidon 哈希
  // 因为需要 circomlibjs 的 buildPoseidon 函数
  // 所以我们使用 snarkjs 的 fullProve 来生成证明
  // 证明的 publicSignals[0] 就是 commitment
  
  return {
    username_hash: usernameField.toString(),
    salt: saltField.toString(),
    saltHex: salt,
    username: username
  };
}

// ===== ZK 证明生成（Groth16）=====

async function generatePoseidonZKProof(commitmentData) {
  log('Generating Groth16 ZK proof...');
  
  // 加载 snarkjs
  var snarkjs = await loadSnarkJS();
  
  // 准备输入
  var input = {
    username_hash: commitmentData.username_hash,
    salt: commitmentData.salt,
    expectedCommitment: "0"  // 占位，将在证明后更新
  };
  
  log('Loading WASM and zKey...');
  
  // 加载 WASM 和 zKey
  // 注意：在浏览器中，我们需要通过 fetch 加载这些文件
  var wasmResponse = await fetch(ZK_CONFIG.wasmUrl);
  var wasmBuffer = await wasmResponse.arrayBuffer();
  
  var zkeyResponse = await fetch(ZK_CONFIG.zkeyUrl);
  var zkeyBuffer = await zkeyResponse.arrayBuffer();
  
  log('Generating proof...');
  
  // 生成证明
  // 注意：snarkjs 的 fullProve 需要 File 对象或 ArrayBuffer
  var { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    new Uint8Array(wasmBuffer),
    new Uint8Array(zkeyBuffer)
  );
  
  log('Proof generated! Public signals: ' + JSON.stringify(publicSignals));
  
  return {
    proof: proof,
    publicSignals: publicSignals,
    commitment: publicSignals[0]  // 这就是 Poseidon 承诺
  };
}

// ===== 验证 ZK 证明 =====

async function verifyPoseidonZKProof(proof, publicSignals) {
  log('Verifying ZK proof...');
  
  var snarkjs = await loadSnarkJS();
  
  // 加载验证密钥
  var vkeyResponse = await fetch(ZK_CONFIG.vkeyUrl);
  var vkey = await vkeyResponse.json();
  
  var isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  
  log('Verification result: ' + (isValid ? 'VALID' : 'INVALID'));
  return isValid;
}

// ===== Web Crypto P-256 工具函数（复用原实现）=====

async function sha256Hex(message) {
  var data = new TextEncoder().encode(message);
  var hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(function(b) { 
    return b.toString(16).padStart(2, '0'); 
  }).join('');
}

async function generateP256KeyPair() {
  var keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  
  var pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  var pubHex = Array.from(new Uint8Array(pubRaw)).map(function(b) { 
    return b.toString(16).padStart(2, '0'); 
  }).join('');
  
  var privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  var pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  
  return {
    publicKey: pubHex,
    privateKeyJwk: privJwk,
    publicKeyJwk: pubJwk,
    privateKeyObj: keyPair.privateKey,
    publicKeyObj: keyPair.publicKey
  };
}

async function signWithP256(message, privateKeyObj) {
  var data = new TextEncoder().encode(message);
  var sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKeyObj,
    data
  );
  return Array.from(new Uint8Array(sigBuf)).map(function(b) { 
    return b.toString(16).padStart(2, '0'); 
  }).join('');
}

async function importP256PrivateKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']
  );
}

// ===== Poseidon ZK 认证流程 =====

/**
 * Poseidon ZK 匿名注册
 */
async function doPoseidonZKRegister(username, password) {
  log('doPoseidonZKRegister | user=' + username);

  try {
    // 1. 生成 Poseidon 承诺数据
    log('生成 Poseidon 承诺...');
    var commitmentData = await poseidonCommit(username);
    
    // 2. 生成 Groth16 ZK 证明
    log('生成 Groth16 ZK 证明...');
    var zkResult = await generatePoseidonZKProof(commitmentData);
    var commitment = zkResult.commitment;
    var proof = zkResult.proof;
    var publicSignals = zkResult.publicSignals;
    
    log('Commitment: ' + commitment);
    
    // 3. 生成 P-256 密钥对
    log('生成 P-256 密钥对...');
    var keyPair = await generateP256KeyPair();
    
    // 4. 签名 commitment
    log('签名 commitment...');
    var signature = await signWithP256(commitment.toString(), keyPair.privateKeyObj);
    
    // 5. 发送注册请求
    var body = JSON.stringify({
      commitment: commitment.toString(),
      publicKey: keyPair.publicKey,
      proof: proof,
      publicSignals: publicSignals,
      displayName: username
    });
    
    log('POST /auth/register-zk-snarks | body_len=' + body.length);
    var res = await fetch(API + '/auth/register-zk-snarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    });
    
    log('status=' + res.status);
    var text = await res.text();
    log('response: ' + text.substring(0, 200));
    
    if (!res.ok) throw new Error(text);
    var data = JSON.parse(text);
    
    // 6. 存储 token 和 ZK secrets
    sessionStorage.setItem('fk_token', data.token);
    sessionStorage.setItem('fk_uid', data.userId);
    sessionStorage.setItem('fk_uname', data.displayName || username);
    if (data.displayName) {
      sessionStorage.setItem('fk_displayName', data.displayName);
    }
    localStorage.setItem('fk_privkey_jwk', JSON.stringify(keyPair.privateKeyJwk));
    localStorage.setItem('fk_pubkey_hex', keyPair.publicKey);
    
    // 存储 Poseidon ZK secrets
    localStorage.setItem('fk_poseidon_secrets', JSON.stringify({
      username: username,
      username_hash: commitmentData.username_hash,
      salt: commitmentData.salt,
      saltHex: commitmentData.saltHex,
      commitment: commitment.toString(),
      privateKeyJwk: keyPair.privateKeyJwk,
      publicKeyJwk: keyPair.publicKeyJwk
    }));
    
    log('POSEIDON ZK REGISTER SUCCESS!');
    return data;
  } catch(e) {
    log('doPoseidonZKRegister 异常: ' + (e.message || String(e)));
    alert('Poseidon ZK 注册失败: ' + (e.message || String(e)));
    throw e;
  }
}

/**
 * Poseidon ZK 匿名登录
 */
async function doPoseidonZKLogin() {
  log('doPoseidonZKLogin');

  try {
    var secretsJson = localStorage.getItem('fk_poseidon_secrets');
    if (!secretsJson) throw new Error('未找到 Poseidon ZK 密钥，请先注册');
    var secrets = JSON.parse(secretsJson);
    
    // 1. 导入私钥
    var privObj = await importP256PrivateKey(secrets.privateKeyJwk);
    
    // 2. 重新生成 ZK 证明
    var commitmentData = {
      username_hash: secrets.username_hash,
      salt: secrets.salt
    };
    
    var zkResult = await generatePoseidonZKProof(commitmentData);
    var proof = zkResult.proof;
    var publicSignals = zkResult.publicSignals;
    
    // 3. 签名 challenge
    var challenge = publicSignals[0].toString();
    var signature = await signWithP256(challenge, privObj);
    
    // 4. 发送登录请求
    var body = JSON.stringify({
      commitment: secrets.commitment,
      proof: proof,
      publicSignals: publicSignals,
      signature: signature,
      timestamp: Date.now()
    });
    
    log('POST /auth/login-zk-snarks');
    var res = await fetch(API + '/auth/login-zk-snarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    });
    
    log('status=' + res.status);
    var text = await res.text();
    if (!res.ok) throw new Error(text);
    var data = JSON.parse(text);
    
    sessionStorage.setItem('fk_token', data.token);
    sessionStorage.setItem('fk_uid', data.userId);
    sessionStorage.setItem('fk_uname', data.displayName || data.username || '');
    if (data.displayName) {
      sessionStorage.setItem('fk_displayName', data.displayName);
    }
    
    log('POSEIDON ZK LOGIN SUCCESS!');
    return data;
  } catch(e) {
    log('doPoseidonZKLogin 异常: ' + (e.message || String(e)));
    alert('Poseidon ZK 登录失败: ' + (e.message || String(e)));
    throw e;
  }
}

// ===== 向后兼容的 API =====

// 保持与旧版相同的接口
async function doZKRegister(username, password) {
  // 检测是否支持 Poseidon ZK
  if (window.FIBEMATE_ZK_POSEIDON_ENABLED) {
    return doPoseidonZKRegister(username, password);
  }
  // 否则回退到旧版实现（需要加载 zk-auth.js）
  throw new Error('Poseidon ZK not enabled. Please load zk-auth.js for legacy support.');
}

async function doZKLogin() {
  if (window.FIBEMATE_ZK_POSEIDON_ENABLED) {
    return doPoseidonZKLogin();
  }
  throw new Error('Poseidon ZK not enabled.');
}

function isLoggedIn() { 
  return !!sessionStorage.getItem('fk_token'); 
}

function getUserInfo() { 
  return { 
    token: sessionStorage.getItem('fk_token'), 
    username: sessionStorage.getItem('fk_uname') 
  }; 
}

function doLogout() { 
  ['fk_token','fk_uid','fk_uname','fk_priv','fk_privkey_jwk','fk_pubkey_hex',
   'fk_zk_secrets','fk_poseidon_secrets','fk_displayName'].forEach(function(k) { 
    localStorage.removeItem(k); 
  }); 
  window.location.href = 'index.html'; 
}

// 浏览器环境
if (typeof window !== 'undefined') {
  window.FIBEMATE_ZK_POSEIDON = {
    doPoseidonZKRegister,
    doPoseidonZKLogin,
    doZKRegister,  // 兼容旧接口
    doZKLogin,     // 兼容旧接口
    doLogout,
    isLoggedIn,
    getUserInfo,
    verifyPoseidonZKProof,
    // 配置
    enable: function() { window.FIBEMATE_ZK_POSEIDON_ENABLED = true; },
    disable: function() { window.FIBEMATE_ZK_POSEIDON_ENABLED = false; }
  };
  
  // 默认启用
  window.FIBEMATE_ZK_POSEIDON_ENABLED = true;
}

log('AUTH v12 (Poseidon ZK, Groth16) loaded. API=' + API);
