const { readFileSync, readdirSync, writeFileSync, existsSync, statSync } = require('fs');
const { resolve, join, dirname } = require('path');

const base = 'C:/temp/fibemate-clone';
const NODE_MODULES = join(base, 'node_modules');

// ═══ Phase 1: Scan node_modules for crypto packages ═══
function scanNodeModules() {
    const packages = [];
    const topDirs = readdirSync(NODE_MODULES).filter(d => !d.startsWith('.'));
    
    for (const dir of topDirs) {
        const p = join(NODE_MODULES, dir);
        const pkgPath = join(p, 'package.json');
        if (!existsSync(pkgPath)) continue;
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
            const text = [
                (pkg.description || ''),
                pkg.name || '',
                ...(pkg.keywords || [])
            ].join(' ').toLowerCase();
            
            const cryptoScore = scoreCryptoRelevance(text);
            if (cryptoScore > 0) {
                packages.push({
                    name: pkg.name,
                    version: pkg.version,
                    description: (pkg.description || '').substring(0, 200),
                    cryptoScore,
                    keywords: (pkg.keywords || []).filter(k => scoreCryptoRelevance(k.toLowerCase()) > 0),
                    repository: pkg.repository ? (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url || '') : '',
                    license: pkg.license || '',
                    deprecated: pkg.deprecated || false,
                    hasNative: !!(pkg.dependencies && (pkg.dependencies['node-gyp'] || pkg.dependencies['node-addon-api'] || pkg.dependencies['bindings'])),
                });
            }
        } catch (e) { /* skip */ }
    }
    
    return packages.sort((a, b) => b.cryptoScore - a.cryptoScore);
}

function scoreCryptoRelevance(text) {
    const patterns = [
        // PQC — highest weight
        { re: /\bpost[ -]?quantum\b/, weight: 10 },
        { re: /\bml[ -]?kem\b/, weight: 9 },
        { re: /\bdilithium\b/, weight: 9 },
        { re: /\bsphincs\b/, weight: 8 },
        { re: /\bkyber\b/, weight: 8 },
        { re: /\bntru\b/, weight: 7 },
        { re: /\bfalcon\b/, weight: 7 },
        { re: /\blattice[ -]?based\b/, weight: 6 },
        { re: /\bfips\s*(20[3-5]|140)\b/, weight: 6 },
        
        // Traditional crypto
        { re: /\bcryptograph/, weight: 5 },
        { re: /\bencryption?\b/, weight: 5 },
        { re: /\bdecrypt/, weight: 4 },
        { re: /\bcipher\b/, weight: 4 },
        { re: /\belliptic\s*curve\b/, weight: 5 },
        { re: /\becdsa\b/, weight: 5 },
        { re: /\becdh\b/, weight: 5 },
        { re: /\bed25519\b/, weight: 4 },
        { re: /\bx25519\b/, weight: 4 },
        { re: /\brsa\b/, weight: 4 },
        { re: /\baes\b/, weight: 3 },
        { re: /\bhmac\b/, weight: 3 },
        { re: /\bsha[\s-]?(256|384|512|3)\b/, weight: 3 },
        { re: /\bpbkdf/, weight: 2 },
        { re: /\bscrypt\b/, weight: 2 },
        { re: /\bargon2\b/, weight: 2 },
        
        // Infrastructure
        { re: /\bhash/i, weight: 2 },
        { re: /\bsignature\b/, weight: 3 },
        { re: /\bkey\s*exchange\b/, weight: 4 },
        { re: /\bkey\s*agreement\b/, weight: 4 },
        { re: /\bkey\s*derivation\b/, weight: 3 },
        { re: /\bdigital\s*sign/, weight: 3 },
        { re: /\bpassword/i, weight: 1 },
        { re: /\brandom/i, weight: 1 },
        { re: /\btls\b/, weight: 3 },
        { re: /\bssl\b/, weight: 3 },
        { re: /\bcertificate\b/, weight: 2 },
        { re: /\bx509\b/, weight: 2 },
        { re: /\bjwt\b/, weight: 2 },
        { re: /\bjson\s*web\s*token\b/, weight: 2 },
        { re: /\bzka?p\b/i, weight: 3 },
        { re: /\bmerkle\b/, weight: 4 },
        
        // Security
        { re: /\bsecurity\b/, weight: 1 },
        { re: /\bauth/i, weight: 1 },
        { re: /\bhelmet\b/, weight: 1 },
        { re: /\bcors\b/, weight: 1 },
    ];
    
    return patterns.reduce((sum, { re, weight }) => sum + (re.test(text) ? weight : 0), 0);
}

// ═══ Phase 2: Scan project source for npm dependency usage ═══
function scanSourceForDeps() {
    const depUsage = {};
    const files = allFiles(base, ['.git', 'node_modules', 'archives', 'evidence', 'fuzz', 'kat_results', 'temp', 'tsa', '.bak']);
    
    for (const file of files) {
        if (!/\.(js|mjs|cjs|ts)$/.test(file)) continue;
        try {
            const content = readFileSync(file, 'utf8');
            // Find require('x') and import ... from 'x'
            const reqRegex = /require\s*\(\s*['"]([^'"]+)['"]\)/g;
            const impRegex = /(?:import|export)\s+.*?\bfrom\s+['"]([^'"]+)['"]/g;
            let m;
            
            const seen = new Set();
            for (const pattern of [reqRegex, impRegex]) {
                while ((m = pattern.exec(content)) !== null) {
                    const dep = m[1];
                    // Skip relative/local imports
                    if (dep.startsWith('.') || dep.startsWith('/') || dep.startsWith('\\')) continue;
                    // Get top-level package name
                    const pkgName = dep.startsWith('@') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0];
                    if (!seen.has(pkgName)) {
                        seen.add(pkgName);
                        if (!depUsage[pkgName]) depUsage[pkgName] = { files: [], count: 0 };
                        depUsage[pkgName].files.push(relative(base, file).replace(/\\/g, '/'));
                        depUsage[pkgName].count++;
                    }
                }
            }
        } catch (e) { /* skip */ }
    }
    
    return depUsage;
}

function allFiles(dir, excludeDirs) {
    const result = [];
    const stack = [dir];
    while (stack.length) {
        const d = stack.pop();
        try {
            const entries = readdirSync(d, { withFileTypes: true });
            for (const e of entries) {
                if (e.name.startsWith('.')) continue;
                if (e.isDirectory()) {
                    const rel = relative(base, join(d, e.name)).replace(/\\/g, '/');
                    if (excludeDirs.some(ex => rel.startsWith(ex))) continue;
                    stack.push(join(d, e.name));
                } else {
                    result.push(join(d, e.name));
                }
            }
        } catch (err) { /* skip permission errors */ }
    }
    return result;
}

function relative(from, to) {
    const fromParts = from.replace(/\\/g, '/').split('/');
    const toParts = to.replace(/\\/g, '/').split('/');
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
    return toParts.slice(i).join('/');
}

// ═══ Phase 3: PQC readiness assessment ═══
function assessPqcReadiness(nmPackages, depUsage) {
    const CRYPTO_CLASSIFICATION = {
        // PQC algorithms
        'pqc-kyber': { type: 'PQC', algorithm: 'ML-KEM-768 (Kyber)', risk: 'transition', note: 'Kyber v0.7 — NIST FIPS 203 standardized as ML-KEM, upgrade path exists' },
        '@noble/post-quantum': { type: 'PQC', algorithm: 'ML-KEM + ML-DSA + SLH-DSA', risk: 'quantum_safe', note: 'Noble multi-algorithm PQC library, covers all FIPS 203/204/205' },
        
        // Traditional algorithms (quantum vulnerable)
        '@noble/curves': { type: 'traditional', algorithm: 'ECDSA/ECDH/EdDSA', risk: 'quantum_vulnerable', note: 'Elliptic curve cryptography — Shor\'s algorithm vulnerable' },
        'sm-crypto': { type: 'traditional', algorithm: 'SM2/SM3/SM4', risk: 'quantum_vulnerable', note: 'Chinese national cryptography — SM2 ECC vulnerable to Shor, SM3/SM4 quantum-safe (hash/symmetric)' },
        'bcryptjs': { type: 'traditional', algorithm: 'bcrypt', risk: 'quantum_weakened', note: 'Password hashing — Grover\'s algorithm halves effective security bits' },
        'jsonwebtoken': { type: 'traditional', algorithm: 'JWT (HS256/RS256/ES256)', risk: 'depends', note: 'Security depends on configured algorithm — RS256/ES256 are quantum vulnerable' },
        'better-sqlite3': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'No direct crypto exposure' },
        'helmet': { type: 'security', algorithm: 'HTTP security headers', risk: 'none', note: 'No quantum exposure' },
        
        // Infrastructure — no direct crypto
        'express': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Web framework' },
        'ws': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'WebSocket library' },
        'cors': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'CORS middleware' },
        'mongoose': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'MongoDB ODM' },
        'uuid': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'UUID generation' },
        'node-addon-api': { type: 'infra', algorithm: 'N/A', risk: 'none', note: 'Native addon bridge' },
        'eslint': { type: 'dev', algorithm: 'N/A', risk: 'none', note: 'Dev tool' },
        'lowdb': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'JSON database' },
        '@alicloud/dysmsapi20170525': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Alibaba Cloud SMS API' },
        '@alicloud/openapi-client': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Alibaba Cloud API client' },
    };

    // Classify all deps
    const assessment = {};
    for (const dep of Object.keys(depUsage)) {
        const info = CRYPTO_CLASSIFICATION[dep] || {};
        assessment[dep] = {
            usageFiles: depUsage[dep].files,
            usageCount: depUsage[dep].count,
            type: info.type || 'unknown',
            algorithm: info.algorithm || 'unknown',
            risk: info.risk || 'unknown',
            note: info.note || 'Not classified — manual review needed',
            nmInfo: nmPackages.find(p => p.name === dep) || null,
        };
    }

    // Calculate overall score
    let totalFiles = 0, highRiskFiles = 0, pqcFiles = 0;
    for (const [dep, info] of Object.entries(assessment)) {
        totalFiles += info.usageCount;
        if (info.risk === 'quantum_vulnerable') highRiskFiles += info.usageCount;
        if (info.type === 'PQC') pqcFiles += info.usageCount;
    }

    const score = Math.round(100 * (1 - highRiskFiles / Math.max(totalFiles, 1)));
    
    return {
        score,
        totalDeps: Object.keys(assessment).length,
        totalFiles,
        highRiskFiles,
        pqcFiles,
        assessment,
    };
}

// ═══ Run ═══
console.error('Scanning node_modules for crypto packages...');
const nmPackages = scanNodeModules();

console.error('Scanning source for dependency usage...');
const depUsage = scanSourceForDeps();

console.error('Assessing PQC readiness...');
const result = assessPqcReadiness(nmPackages, depUsage);

// Add node_modules crypto packages that aren't used by source
result.nmCryptoPackages = nmPackages.filter(p => !depUsage[p.name]);
result.nmCryptoPackagesUsed = nmPackages.filter(p => depUsage[p.name]);

writeFileSync(join(base, 'tools/pqc-ecosystem-scan.json'), JSON.stringify(result, null, 2), 'utf8');
console.error('Done. Written to tools/pqc-ecosystem-scan.json');
console.log(JSON.stringify(result, null, 2));
