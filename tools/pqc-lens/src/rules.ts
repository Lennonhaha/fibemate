// SPDX-License-Identifier: GPL-3.0-only
// PQC 检测规则表 — 与 pqc-migrate CLI 共享（01-pqc-migrate-cli.md §5）
export interface PqcRule {
  algorithm: string;
  category: 'kem' | 'sign' | 'hash' | 'cipher';
  quantumBits: number;      // 0 = 量子脆弱（Shor 可破），>0 = Grover 平方根级
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'OK';
  migration: string;
}

export const RULES: Record<string, PqcRule> = {
  // RSA
  'rsa':            { algorithm: 'RSA',            category: 'sign',   quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-KEM-768（KEM）+ ML-DSA-44（签名）' },
  'RSA-2048':       { algorithm: 'RSA-2048',       category: 'sign',   quantumBits: 0, severity: 'HIGH',   migration: 'Shor 可破。迁移到 ML-DSA-44' },
  'generateKeyPairSync': { algorithm: 'generateKeyPairSync', category: 'sign', quantumBits: 0, severity: 'MEDIUM', migration: '检查密钥类型，RSA/ECDSA 需迁移' },
  // ECDSA / 椭圆曲线
  'ecdsa':          { algorithm: 'ECDSA',          category: 'sign',   quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-DSA-44' },
  'ECDSA':          { algorithm: 'ECDSA',          category: 'sign',   quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-DSA-44' },
  'P-256':          { algorithm: 'ECDSA P-256',    category: 'sign',   quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-DSA-44' },
  'p-256':          { algorithm: 'ECDSA P-256',    category: 'sign',   quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-DSA-44' },
  'ecdh':           { algorithm: 'ECDH',           category: 'kem',    quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-KEM-768' },
  'ECDH':           { algorithm: 'ECDH',           category: 'kem',    quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-KEM-768' },
  // 哈希
  'sha256':         { algorithm: 'SHA-256',        category: 'hash',   quantumBits: 128, severity: 'LOW',  migration: 'Grover 128-bit 安全，监控即可' },
  'sha1':           { algorithm: 'SHA-1',          category: 'hash',   quantumBits: 80, severity: 'HIGH',  migration: '已碰撞，迁移到 SHA-256/SHA3-512' },
  'md5':            { algorithm: 'MD5',            category: 'hash',   quantumBits: 64, severity: 'HIGH',  migration: '已碰撞，迁移到 SHA-256' },
  // 对称
  'aes-128':        { algorithm: 'AES-128',        category: 'cipher', quantumBits: 128, severity: 'MEDIUM', migration: '考虑 AES-256（Grover 后 128-bit 有效安全）' },
  'aes128':         { algorithm: 'AES-128',        category: 'cipher', quantumBits: 128, severity: 'MEDIUM', migration: '考虑 AES-256' },
  // SM 国密
  'sm2':            { algorithm: 'SM2',            category: 'sign',   quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-KEM + ML-DSA' },
  'sm-crypto':      { algorithm: 'SM2 (sm-crypto)', category: 'sign',  quantumBits: 0, severity: 'HIGH',   migration: '迁移到 ML-KEM + ML-DSA' },
  // 已 PQC 安全
  'ml-kem':         { algorithm: 'ML-KEM',         category: 'kem',    quantumBits: 128, severity: 'OK',   migration: '✅ 已量子安全' },
  'mlkem':          { algorithm: 'ML-KEM',         category: 'kem',    quantumBits: 128, severity: 'OK',   migration: '✅ 已量子安全' },
  'ml-dsa':         { algorithm: 'ML-DSA',         category: 'sign',   quantumBits: 128, severity: 'OK',   migration: '✅ 已量子安全' },
  'mldsa':          { algorithm: 'ML-DSA',         category: 'sign',   quantumBits: 128, severity: 'OK',   migration: '✅ 已量子安全' },
  'slh-dsa':        { algorithm: 'SLH-DSA',        category: 'sign',   quantumBits: 128, severity: 'OK',   migration: '✅ 已量子安全' },
};

export function findRule(algo: string): PqcRule | null {
  // 精确匹配
  if (RULES[algo]) return RULES[algo];
  // 小写匹配
  const lower = algo.toLowerCase();
  if (RULES[lower]) return RULES[lower];
  return null;
}
