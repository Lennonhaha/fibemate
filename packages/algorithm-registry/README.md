# @fibemate/algorithm-registry

Unified metadata registry for FIBEMATE cryptographic algorithms.

## Overview

This package provides standardized metadata for all cryptographic algorithms used in FIBEMATE, including:

- **Post-Quantum**: ML-KEM-768, ML-DSA-65, SLH-DSA-128s
- **Classic**: P-256/ECDH, RSA, AES-256-GCM, SHA-256
- **Chinese Standards**: SM2, SM3, SM4
- **Protocol**: Double-Ratchet
- **Primitives**: NTT
- **Verification**: TLA+ specifications

## Installation

```bash
npm install @fibemate/algorithm-registry
```

## Usage

### Get All Algorithms

```javascript
const { getAllAlgorithms, getAlgorithmIds } = require('@fibemate/algorithm-registry');

// Get all algorithm IDs
const ids = getAlgorithmIds();
// ['ML-KEM', 'ML-DSA', 'SLH-DSA', 'SM2', 'SM3', 'SM4', 'P-256/ECDH', 'SHA-256', 'AES', 'Double-Ratchet', 'NTT', 'TLA+']

// Get full registry
const algorithms = getAllAlgorithms();
console.log(algorithms['ML-KEM']);
```

### Query by Property

```javascript
const { 
  getAlgorithm, 
  getByCategory, 
  getByRisk,
  getByMigrationPriority,
  getPQCReady 
} = require('@fibemate/algorithm-registry');

// Get specific algorithm
const mlkem = getAlgorithm('ML-KEM');
// { id: 'ml-kem-768', name: 'ML-KEM-768', ... }

// Get PQC algorithms
const pqcKems = getByCategory('pqc-kem');

// Get high migration priority
const highPriority = getByMigrationPriority('high');

// Get PQC-ready algorithms
const pqcReady = getPQCReady();
```

### Generate CBOM

```javascript
const { generateCBOM } = require('@fibemate/algorithm-registry');

const cbom = generateCBOM();
// Returns CycloneDX 1.6 compatible component list
```

### Get Statistics

```javascript
const { getStatistics } = require('@fibemate/algorithm-registry');

const stats = getStatistics();
// {
//   total: 12,
//   byCategory: { pqc: 3, classic: 5, ... },
//   byRisk: { safe: 9, warning: 3, ... },
//   pqcReady: 5,
//   nativeImplementations: 3,
//   fpgaImplementations: 3
// }
```

## Algorithm Metadata Structure

Each algorithm entry contains:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Full algorithm name |
| `family` | Algorithm family (e.g., "Post-Quantum KEM") |
| `category` | Category (pqc-kem, classic-ecc, etc.) |
| `version` | Implementation version |
| `securityLevel` | Classical/Quantum security bits, NIST level |
| `standards` | FIPS/GB/T/ISO/IANA/IETF references |
| `cbom` | CycloneDX 1.6 classification (risk, PQC-ready, migration priority) |
| `status` | Implementation status (active/development/deprecated) |
| `location` | Package path in FIBEMATE |
| `implementation` | Languages, native/WASM/FPGA support |
| `evidence` | KAT/TVLA/TSR verification evidence |

## CBOM Risk Levels

| Risk | Description | Examples |
|------|-------------|----------|
| `safe` | Quantum-resistant or acceptable quantum degradation | ML-KEM, SLH-DSA, AES, SHA-256 |
| `warning` | Shor-vulnerable, requires hybrid transition | SM2, P-256, Double-Ratchet |
| `vulnerable` | Deprecated or known weak | (none currently) |

## Migration Priorities

| Priority | Description |
|----------|-------------|
| `high` | Shor-vulnerable, prioritize hybrid migration |
| `medium` | PQC alternative available, transition recommended |
| `low` | Quantum-resistant or acceptable quantum security |

## Integration with Assessment Tools

This registry feeds into FIBEMATE's assessment tools:

- **CARS Radar** (`www/docs/cars-radar.html`) — Evidence linkage
- **IBM Seven-Dimension** (`www/docs/ibm-seven-radar.html`) — Standard alignment (D5)
- **CBOM Viewer** (`www/docs/cbom-viewer.html`) — CycloneDX export
- **PQC Dashboard** (`www/docs/pqc-dashboard.html`) — Algorithm overview

## License

GPL-3.0-only

## Related

- [FIBEMATE PQC Readiness](https://fibemate.net/docs/pqc-readiness.html)
- [CycloneDX 1.6 CBOM Specification](https://cyclonedx.org/capabilities/cbom/)
- [NIST PQC Standards](https://csrc.nist.gov/projects/post-quantum-cryptography)
