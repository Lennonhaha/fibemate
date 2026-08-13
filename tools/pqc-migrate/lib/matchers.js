// 检测规则表 —— 密码算法 → 量子安全位 / 迁移建议 / 紧急度
// 数据来源：NIST PQC 迁移指南 + FIBEMATE pqc-dashboard-data.json
const RULES = {
  // 非对称（Shor 可破 → 量子安全位 0）
  'RSA-2048':      { quantumBits: 0,   migration: 'ML-KEM-768 / ML-DSA-44', severity: 'HIGH' },
  'RSA-3072':      { quantumBits: 0,   migration: 'ML-KEM-768 / ML-DSA-44', severity: 'HIGH' },
  'RSA-4096':      { quantumBits: 0,   migration: 'ML-KEM-768 / ML-DSA-44', severity: 'HIGH' },
  'RSA':           { quantumBits: 0,   migration: 'ML-KEM-768 / ML-DSA-44', severity: 'HIGH' },
  'ECDSA':         { quantumBits: 0,   migration: 'ML-DSA-44',              severity: 'HIGH' },
  'ECDH':          { quantumBits: 0,   migration: 'ML-KEM-768',             severity: 'HIGH' },
  'SM2':           { quantumBits: 0,   migration: 'ML-KEM-768 + ML-DSA-44', severity: 'HIGH' },
  'Ed25519':       { quantumBits: 0,   migration: 'SLH-DSA-128s / ML-DSA-44', severity: 'HIGH' },
  'X25519':        { quantumBits: 0,   migration: 'ML-KEM-768',             severity: 'HIGH' },

  // 对称（Grover 减半 → 量子安全位 = 经典位/2）
  'AES-128':       { quantumBits: 64,  migration: 'AES-256',                severity: 'MEDIUM' },
  'AES-192':       { quantumBits: 96,  migration: 'AES-256',                severity: 'MEDIUM' },
  'SM4':           { quantumBits: 64,  migration: 'AES-256',                severity: 'MEDIUM' },
  'SHA-256':       { quantumBits: 128, migration: 'SHA3-512 / SHAKE256',    severity: 'MEDIUM' },
  'SHA-512':       { quantumBits: 256, migration: 'SHA3-512',               severity: 'LOW' },
  'SHA-1':         { quantumBits: 0,   migration: 'SHA3-512 (SHA-1 已弃用)', severity: 'HIGH' },
  'MD5':           { quantumBits: 0,   migration: 'SHA3-512 (MD5 已弃用)',  severity: 'HIGH' },
  'SM3':           { quantumBits: 128, migration: 'SHAKE256',               severity: 'LOW' },

  // 后量子（已安全）
  'ML-KEM-768':    { quantumBits: 128, migration: '— (already PQC-safe)',   severity: 'OK' },
  'ML-DSA-44':     { quantumBits: 128, migration: '— (already PQC-safe)',   severity: 'OK' },
  'SLH-DSA-128s':  { quantumBits: 128, migration: '— (already PQC-safe)',   severity: 'OK' },
};

// 密码学包名 → 算法映射（npm / go / maven）
const CRYPTO_PACKAGES = {
  // npm
  'jsonwebtoken':       { algorithm: 'RSA-2048', category: 'sign',    note: 'JWT 签名（常见默认 RS256）' },
  'jose':               { algorithm: 'RSA',      category: 'sign',    note: 'JOSE 签名/加密，需检查具体算法' },
  'elliptic':           { algorithm: 'ECDSA',    category: 'sign',    note: '椭圆曲线签名' },
  'ecdsa-secp256r1':    { algorithm: 'ECDSA',    category: 'sign' },
  'crypto-js':          { algorithm: 'AES-128',  category: 'encrypt', note: 'AES 默认 128，需检查模式' },
  'bcrypt':             { algorithm: 'SHA-512',  category: 'hash',    note: '密码哈希（基于 Blowfish）' },
  'bcryptjs':           { algorithm: 'SHA-512',  category: 'hash' },
  'argon2':             { algorithm: 'SHA-256',  category: 'hash',    note: 'Argon2 密码哈希' },
  'sha.js':             { algorithm: 'SHA-256',  category: 'hash' },
  'sm-crypto':          { algorithm: 'SM2',      category: 'sign',    note: '国密 SM2/SM3/SM4' },
  'gm-crypto':          { algorithm: 'SM2',      category: 'sign',    note: '国密 SM2/SM3/SM4' },
  '@noble/curves':      { algorithm: 'ECDSA',    category: 'sign',    note: '曲线库，支持多种曲线' },
  '@noble/hashes':      { algorithm: 'SHA-256',  category: 'hash' },
  '@noble/post-quantum':{ algorithm: 'ML-KEM-768', category: 'kem',   note: '后量子实现（安全）' },
  'tweetnacl':          { algorithm: 'Ed25519',  category: 'sign' },
  'libsodium-wrappers': { algorithm: 'Ed25519',  category: 'sign' },
  'node-forge':         { algorithm: 'RSA',      category: 'sign',    note: 'RSA/AES 等混合' },

  // go
  'crypto/rsa':         { algorithm: 'RSA',      category: 'sign' },
  'crypto/ecdsa':       { algorithm: 'ECDSA',    category: 'sign' },
  'crypto/ed25519':     { algorithm: 'Ed25519',  category: 'sign' },
  'golang.org/x/crypto':{ algorithm: 'RSA',      category: 'multiple', note: '多种算法，需检查' },

  // maven
  'bcprov':             { algorithm: 'RSA',      category: 'multiple', note: 'Bouncy Castle 多种算法' },
  'bcpkix':             { algorithm: 'RSA',      category: 'multiple' },
};

// 模糊匹配关键词（包名含这些词 → 需人工审查）
const KEYWORD_RE = /(crypto|cipher|ssl|tls|encrypt|decrypt|sign|verify|hash|keccak|sha|aes|rsa|ecc|ecdsa|ecdh|kem|dsa|argon|bcrypt|ed25519|x25519|sm2|sm3|sm4|jwt|jose)/i;

function enrich(match) {
  const rule = RULES[match.algorithm];
  if (!rule) return { ...match, quantumBits: null, migration: 'manual review', severity: 'LOW' };
  return { ...match, quantumBits: rule.quantumBits, migration: rule.migration, severity: rule.severity };
}

function matchCryptoDep(name) {
  const key = Object.keys(CRYPTO_PACKAGES).find(k => k.toLowerCase() === name.toLowerCase());
  if (key) return enrich({ ...CRYPTO_PACKAGES[key], algorithm: CRYPTO_PACKAGES[key].algorithm });

  if (KEYWORD_RE.test(name)) {
    return { algorithm: 'unknown', category: 'unknown', severity: 'LOW', quantumBits: null, migration: 'manual review', note: '包名含密码学关键词，需人工确认' };
  }
  return null;
}

module.exports = { RULES, CRYPTO_PACKAGES, matchCryptoDep, enrich };
