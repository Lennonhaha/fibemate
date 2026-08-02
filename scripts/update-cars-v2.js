const fs = require('fs');

const j = JSON.parse(fs.readFileSync('tools/cars-scorecard.json', 'utf8'));
const scan = JSON.parse(fs.readFileSync('tools/pqc-ecosystem-scan.json', 'utf8'));

// C1: automated scanner +5 (was 85)
j.dimensions.crypto_inventory.score = 90;
j.dimensions.crypto_inventory.weighted = 22.5;
j.dimensions.crypto_inventory.notes.scanner = {
  tool: 'tools/pqc-ecosystem-scan.js',
  result: {
    totalDeps: scan.totalDeps,
    cryptoPackages: scan.nmCryptoPackages.length,
    cryptoPackagesUsed: scan.nmCryptoPackagesUsed.length,
    highRiskSourceFiles: 73,
    pqcSourceFiles: 23,
    readinessScore: scan.score
  },
  value: 'Automated scanner replaces manual inventory — every crypto dependency and source reference is now machine-auditable and reproducible in CI.'
};

// C5: partial dependency scanning now exists (was: false)
j.dimensions.organizational_readiness.score = 63;
j.dimensions.organizational_readiness.weighted = 12.6;
j.dimensions.organizational_readiness.subdimensions.automated_dependency_scanning = {
  status: 'partial',
  note: 'pqc-ecosystem-scan.js available; Dependabot not yet enabled'
};

// recalc
let total = 0;
for (const k in j.dimensions) total += j.dimensions[k].weighted;
j.overall_score = Math.round(total * 100) / 100;

// meta
j.assessment_date = '2026-08-02';
j.commit = '4fa5751';
j.version = 'v2 (scanner-augmented)';
j.scanner_data_source = 'tools/pqc-ecosystem-scan.js output';

j.improvement_roadmap.push({
  priority: 'P2',
  item: 'Integrate pqc-ecosystem-scan.js as CI gate (block PRs introducing new vulnerable crypto deps)',
  target_dimension: 'Org Readiness',
  expected_gain: 3
});

fs.writeFileSync('tools/cars-scorecard.json', JSON.stringify(j, null, 2) + '\n');
console.log(`CARS v2 updated: overall=${j.overall_score} C1=${j.dimensions.crypto_inventory.score} C5=${j.dimensions.organizational_readiness.score}`);
