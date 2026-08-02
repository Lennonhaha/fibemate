/**
 * @fibemate/algorithm-registry — Cryptographic Algorithm Metadata Registry
 * 
 * Unified metadata for 12 algorithms used in FIBEMATE:
 * - Post-quantum: ML-KEM-768, ML-DSA-65, SLH-DSA-128s
 * - Classic: P-256/ECDH, RSA, AES, SHA-256
 * - Chinese standards: SM2, SM3, SM4
 * - Protocol: Double-Ratchet, NTT
 * 
 * Each algorithm entry contains:
 * - version: Implementation version
 * - securityLevel: Classical/Quantum security bits
 * - standards: FIPS/GB/T/IETF references
 * - cbom: CycloneDX 1.6 CBOM classification
 * - status: Implementation status (active/development/deprecated)
 * - location: Package path in FIBEMATE
 */

'use strict';

const ALGORITHMS = {
  // ===== Post-Quantum Cryptography =====
  'ML-KEM': {
    id: 'ml-kem-768',
    name: 'ML-KEM-768',
    family: 'Post-Quantum KEM',
    category: 'pqc-kem',
    version: '0.1.0',
    securityLevel: {
      classical: 192,
      quantum: 128,
      nistLevel: 3
    },
    standards: {
      primary: 'FIPS 203',
      nist: 'FIPS 203 (Aug 2024)',
      iana: 'NamedGroup 0x11ec (X25519MLKEM768)',
      ietf: 'draft-ietf-tls-hybrid-design'
    },
    cbom: {
      classification: 'post-quantum',
      risk: 'safe',
      pqcReady: true,
      migrationPriority: 'high'
    },
    status: 'active',
    location: 'packages/pqc-kem',
    implementation: {
      languages: ['JavaScript', 'C', 'WASM'],
      native: true,
      wasm: true,
      fpga: true
    },
    evidence: {
      kat: '10000 rounds, 100% pass',
      tvla: '36/36 pass (timing side-channel)',
      tsr: 'TSR lg-001~099'
    }
  },

  'ML-DSA': {
    id: 'ml-dsa-65',
    name: 'ML-DSA-65',
    family: 'Post-Quantum Signature',
    category: 'pqc-sig',
    version: '0.1.0',
    securityLevel: {
      classical: 192,
      quantum: 128,
      nistLevel: 3
    },
    standards: {
      primary: 'FIPS 204',
      nist: 'FIPS 204 (Aug 2024)'
    },
    cbom: {
      classification: 'post-quantum',
      risk: 'safe',
      pqcReady: true,
      migrationPriority: 'high'
    },
    status: 'development',
    location: 'packages/fml-dsa',
    implementation: {
      languages: ['JavaScript', 'WASM'],
      native: false,
      wasm: true,
      fpga: false
    },
    evidence: {
      kat: 'KAT verification in progress',
      tvla: null,
      tsr: null
    }
  },

  'SLH-DSA': {
    id: 'slh-dsa-128s',
    name: 'SLH-DSA-128s (SPHINCS+)',
    family: 'Post-Quantum Signature (Hash-Based)',
    category: 'pqc-sig',
    version: '0.1.0',
    securityLevel: {
      classical: 128,
      quantum: 128,
      nistLevel: 1
    },
    standards: {
      primary: 'FIPS 205',
      nist: 'FIPS 205 (Aug 2024)'
    },
    cbom: {
      classification: 'post-quantum',
      risk: 'safe',
      pqcReady: true,
      migrationPriority: 'medium'
    },
    status: 'active',
    location: 'packages/pqc-kem/src/slh-dsa',
    implementation: {
      languages: ['JavaScript'],
      native: false,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: '148/148 pass',
      tvla: null,
      tsr: 'TSR lg-001~099'
    }
  },

  // ===== Chinese Cryptographic Standards =====
  'SM2': {
    id: 'sm2-p256',
    name: 'SM2 Elliptic Curve',
    family: 'Chinese National Standard',
    category: 'classic-ecc',
    version: '0.1.0',
    securityLevel: {
      classical: 128,
      quantum: 0,
      nistLevel: null
    },
    standards: {
      primary: 'GM/T 0003',
      gb: 'GB/T 32918-2016',
      iso: 'ISO/IEC 14888-3:2018'
    },
    cbom: {
      classification: 'classic',
      risk: 'warning',
      pqcReady: false,
      migrationPriority: 'high',
      migrationNote: 'Shor-vulnerable, requires hybrid transition'
    },
    status: 'active',
    location: 'packages/sm2-ref',
    implementation: {
      languages: ['JavaScript'],
      native: false,
      wasm: false,
      fpga: true
    },
    evidence: {
      kat: 'Internal verification pass',
      tvla: 'Scalar masking + projective randomization',
      tsr: 'TSR lg-001~099'
    }
  },

  'SM3': {
    id: 'sm3-hash',
    name: 'SM3 Hash Function',
    family: 'Chinese National Standard',
    category: 'classic-hash',
    version: '0.1.0',
    securityLevel: {
      classical: 128,
      quantum: 64,
      nistLevel: null
    },
    standards: {
      primary: 'GM/T 0004',
      gb: 'GB/T 32905-2016',
      iso: 'ISO/IEC 10118-3:2018'
    },
    cbom: {
      classification: 'classic',
      risk: 'safe',
      pqcReady: false,
      migrationPriority: 'low',
      migrationNote: 'Grover reduces to 64-bit, acceptable for most applications'
    },
    status: 'active',
    location: 'packages/sm3-ref',
    implementation: {
      languages: ['JavaScript'],
      native: false,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: 'Test vectors verified',
      tvla: null,
      tsr: null
    }
  },

  'SM4': {
    id: 'sm4-block',
    name: 'SM4 Block Cipher',
    family: 'Chinese National Standard',
    category: 'classic-sym',
    version: '0.1.0',
    securityLevel: {
      classical: 128,
      quantum: 64,
      nistLevel: null
    },
    standards: {
      primary: 'GM/T 0002',
      gb: 'GB/T 32907-2016',
      iso: 'ISO/IEC 18033-3:2010'
    },
    cbom: {
      classification: 'classic',
      risk: 'safe',
      pqcReady: false,
      migrationPriority: 'low',
      migrationNote: 'Grover reduces to 64-bit, acceptable for symmetric encryption'
    },
    status: 'active',
    location: 'packages/sm4-ref',
    implementation: {
      languages: ['JavaScript'],
      native: false,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: 'Test vectors verified',
      tvla: null,
      tsr: null
    }
  },

  // ===== Classic Cryptography =====
  'P-256/ECDH': {
    id: 'p256-ecdh',
    name: 'NIST P-256 ECDH',
    family: 'Classic Elliptic Curve',
    category: 'classic-ecc',
    version: 'native',
    securityLevel: {
      classical: 128,
      quantum: 0,
      nistLevel: null
    },
    standards: {
      primary: 'FIPS 186-4',
      nist: 'SP 800-186',
      iana: 'NamedGroup 0x0017 (secp256r1)'
    },
    cbom: {
      classification: 'classic',
      risk: 'warning',
      pqcReady: false,
      migrationPriority: 'high',
      migrationNote: 'Shor-vulnerable, requires hybrid transition'
    },
    status: 'active',
    location: 'src/crypto/ecdh-p256.js',
    implementation: {
      languages: ['JavaScript', 'Native (Node.js crypto)'],
      native: true,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: 'KAT verification pass',
      tvla: null,
      tsr: null
    }
  },

  'SHA-256': {
    id: 'sha-256',
    name: 'SHA-256 Hash',
    family: 'SHA-2 Family',
    category: 'classic-hash',
    version: 'native',
    securityLevel: {
      classical: 128,
      quantum: 64,
      nistLevel: null
    },
    standards: {
      primary: 'FIPS 180-4',
      nist: 'FIPS 180-4 (SHA-2)'
    },
    cbom: {
      classification: 'classic',
      risk: 'safe',
      pqcReady: false,
      migrationPriority: 'low',
      migrationNote: 'Grover reduces to 64-bit, acceptable for most applications'
    },
    status: 'active',
    location: 'native (crypto.hash)',
    implementation: {
      languages: ['Native (Node.js crypto)'],
      native: true,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: 'NIST test vectors verified',
      tvla: null,
      tsr: null
    }
  },

  'AES': {
    id: 'aes-256-gcm',
    name: 'AES-256-GCM',
    family: 'AES Family',
    category: 'classic-sym',
    version: 'native',
    securityLevel: {
      classical: 256,
      quantum: 128,
      nistLevel: null
    },
    standards: {
      primary: 'FIPS 197',
      nist: 'SP 800-38D (GCM)'
    },
    cbom: {
      classification: 'classic',
      risk: 'safe',
      pqcReady: false,
      migrationPriority: 'low',
      migrationNote: 'Grover reduces to 128-bit, still secure'
    },
    status: 'active',
    location: 'native (crypto.aead)',
    implementation: {
      languages: ['Native (Node.js crypto)'],
      native: true,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: 'NIST test vectors verified',
      tvla: null,
      tsr: null
    }
  },

  // ===== Protocol-Level =====
  'Double-Ratchet': {
    id: 'double-ratchet',
    name: 'Double Ratchet Protocol',
    family: 'Secure Messaging Protocol',
    category: 'protocol',
    version: '1.0.0',
    securityLevel: {
      classical: 128,
      quantum: 0,
      nistLevel: null
    },
    standards: {
      primary: 'Signal Protocol',
      signal: 'Double Ratchet Algorithm',
      ietf: 'RFC 9420 (MLS)'
    },
    cbom: {
      classification: 'protocol',
      risk: 'warning',
      pqcReady: false,
      migrationPriority: 'high',
      migrationNote: 'Classic X3DH vulnerable to Shor, requires PQ-X3DH hybrid'
    },
    status: 'active',
    location: 'double-ratchet.js, double-ratchet-pq.js',
    implementation: {
      languages: ['JavaScript'],
      native: false,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: 'Integration tests pass',
      tvla: null,
      tsr: 'TSR lg-088-089'
    }
  },

  'NTT': {
    id: 'ntt-core',
    name: 'Number Theoretic Transform',
    family: 'Mathematical Primitive',
    category: 'primitive',
    version: '0.1.0',
    securityLevel: {
      classical: null,
      quantum: null,
      nistLevel: null
    },
    standards: {
      primary: 'FIPS 203/204 (internal)',
      note: 'Core primitive for ML-KEM/ML-DSA polynomial operations'
    },
    cbom: {
      classification: 'primitive',
      risk: 'safe',
      pqcReady: true,
      migrationPriority: 'low'
    },
    status: 'active',
    location: 'packages/pqc-kem/src/ml-kem-768-ntt.js',
    implementation: {
      languages: ['JavaScript', 'Verilog (FPGA)'],
      native: false,
      wasm: true,
      fpga: true
    },
    evidence: {
      kat: 'Internal verification pass',
      tvla: 'Hardware fault detection (REMO dual butterfly)',
      tsr: null
    }
  },

  'TLA+': {
    id: 'tla-spec',
    name: 'TLA+ Formal Specification',
    family: 'Formal Verification',
    category: 'verification',
    version: '1.0.0',
    securityLevel: {
      classical: null,
      quantum: null,
      nistLevel: null
    },
    standards: {
      primary: 'Lamport TLA+',
      note: 'Protocol-level model checking for hybrid KEM'
    },
    cbom: {
      classification: 'verification',
      risk: 'safe',
      pqcReady: true,
      migrationPriority: 'low'
    },
    status: 'active',
    location: 'docs/tla/C2.tla',
    implementation: {
      languages: ['TLA+'],
      native: false,
      wasm: false,
      fpga: false
    },
    evidence: {
      kat: '101,467 states, 7 invariants, 0 violations',
      tvla: null,
      tsr: 'TSR lg-069'
    }
  }
};

// ===== Helper Functions =====

/**
 * Get all algorithm IDs
 * @returns {string[]} Array of algorithm IDs
 */
function getAlgorithmIds() {
  return Object.keys(ALGORITHMS);
}

/**
 * Get all algorithms
 * @returns {Object} Full algorithm registry
 */
function getAllAlgorithms() {
  return { ...ALGORITHMS };
}

/**
 * Get algorithm by ID
 * @param {string} id - Algorithm ID (e.g., 'ML-KEM', 'SM2')
 * @returns {Object|null} Algorithm metadata or null if not found
 */
function getAlgorithm(id) {
  return ALGORITHMS[id] || null;
}

/**
 * Get algorithms by category
 * @param {string} category - Category filter (pqc-kem, pqc-sig, classic-ecc, etc.)
 * @returns {Object[]} Array of matching algorithms
 */
function getByCategory(category) {
  return Object.values(ALGORITHMS).filter(algo => algo.category === category);
}

/**
 * Get algorithms by CBOM risk level
 * @param {string} risk - Risk level (safe, warning, vulnerable)
 * @returns {Object[]} Array of matching algorithms
 */
function getByRisk(risk) {
  return Object.values(ALGORITHMS).filter(algo => algo.cbom.risk === risk);
}

/**
 * Get algorithms by migration priority
 * @param {string} priority - Priority level (high, medium, low)
 * @returns {Object[]} Array of matching algorithms
 */
function getByMigrationPriority(priority) {
  return Object.values(ALGORITHMS).filter(algo => algo.cbom.migrationPriority === priority);
}

/**
 * Get PQC-ready algorithms
 * @returns {Object[]} Array of PQC-ready algorithms
 */
function getPQCReady() {
  return Object.values(ALGORITHMS).filter(algo => algo.cbom.pqcReady);
}

/**
 * Get algorithms with native implementations
 * @returns {Object[]} Array of algorithms with native/C implementations
 */
function getNativeImplementations() {
  return Object.values(ALGORITHMS).filter(algo => algo.implementation.native);
}

/**
 * Get algorithms with FPGA implementations
 * @returns {Object[]} Array of algorithms with FPGA hardware
 */
function getFPGAImplementations() {
  return Object.values(ALGORITHMS).filter(algo => algo.implementation.fpga);
}

/**
 * Generate CBOM (CycloneDX 1.6) component list
 * @returns {Object[]} Array of CBOM component objects
 */
function generateCBOM() {
  return Object.entries(ALGORITHMS).map(([id, algo]) => ({
    type: 'cryptographic-asset',
    name: algo.name,
    'bom-ref': `alg-${id.toLowerCase()}`,
    version: algo.version,
    description: algo.family,
    properties: [
      { name: 'fibemate:category', value: algo.category },
      { name: 'fibemate:security:classical', value: String(algo.securityLevel.classical || 0) },
      { name: 'fibemate:security:quantum', value: String(algo.securityLevel.quantum || 0) },
      { name: 'fibemate:cbom:risk', value: algo.cbom.risk },
      { name: 'fibemate:cbom:pqcReady', value: String(algo.cbom.pqcReady) },
      { name: 'fibemate:cbom:migrationPriority', value: algo.cbom.migrationPriority },
      { name: 'fibemate:standards:primary', value: algo.standards.primary }
    ],
    externalReferences: algo.location.startsWith('http') ? [{
      type: 'documentation',
      url: algo.location
    }] : []
  }));
}

/**
 * Get statistics summary
 * @returns {Object} Statistics object
 */
function getStatistics() {
  const algos = Object.values(ALGORITHMS);
  return {
    total: algos.length,
    byCategory: {
      pqc: algos.filter(a => a.category.startsWith('pqc')).length,
      classic: algos.filter(a => a.category.startsWith('classic')).length,
      protocol: algos.filter(a => a.category === 'protocol').length,
      primitive: algos.filter(a => a.category === 'primitive').length,
      verification: algos.filter(a => a.category === 'verification').length
    },
    byRisk: {
      safe: algos.filter(a => a.cbom.risk === 'safe').length,
      warning: algos.filter(a => a.cbom.risk === 'warning').length,
      vulnerable: algos.filter(a => a.cbom.risk === 'vulnerable').length
    },
    byMigrationPriority: {
      high: algos.filter(a => a.cbom.migrationPriority === 'high').length,
      medium: algos.filter(a => a.cbom.migrationPriority === 'medium').length,
      low: algos.filter(a => a.cbom.migrationPriority === 'low').length
    },
    pqcReady: algos.filter(a => a.cbom.pqcReady).length,
    nativeImplementations: algos.filter(a => a.implementation.native).length,
    fpgaImplementations: algos.filter(a => a.implementation.fpga).length
  };
}

// ===== Exports =====

module.exports = {
  // Core data
  ALGORITHMS,
  
  // Getters
  getAlgorithmIds,
  getAllAlgorithms,
  getAlgorithm,
  getByCategory,
  getByRisk,
  getByMigrationPriority,
  getPQCReady,
  getNativeImplementations,
  getFPGAImplementations,
  
  // Generators
  generateCBOM,
  getStatistics
};
