const { writeFileSync, readFileSync } = require('fs');
const path = require('path');

const base = 'C:/temp/fibemate-clone';

// Rebuild fresh scan data
require('./bloom-scan.js');

// Now bloom-scan-output.json should exist (written by scan script)
// Merge into bloom-data.json
const scan = JSON.parse(readFileSync(path.join(base, 'tools/bloom-scan-output.json'), 'utf8'));
const data = JSON.parse(readFileSync(path.join(base, 'tools/bloom-data.json'), 'utf8'));

for (const [algo, br] of Object.entries(scan.blastRadius)) {
    if (data.blastRadius[algo]) {
        data.blastRadius[algo].directFiles = br.direct;
        data.blastRadius[algo].indirectFiles = br.indirect;
    }
}

writeFileSync(path.join(base, 'tools/bloom-data.json'), JSON.stringify(data, null, 2), 'utf8');
console.log('Merged. ML-KEM directFiles:', data.blastRadius['ML-KEM'].directFiles ? data.blastRadius['ML-KEM'].directFiles.length : 'missing');
console.log('P-256 directFiles:', data.blastRadius['P-256/ECDH'].directFiles ? data.blastRadius['P-256/ECDH'].directFiles.length : 'missing');
