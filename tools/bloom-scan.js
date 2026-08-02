const fs = require('fs');
const path = require('path');

function walk(dir, exts) {
    const results = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const d of list) {
        const full = path.join(dir, d.name);
        if (d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules' && d.name !== 'archive') {
            results.push(...walk(full, exts));
        } else if (d.isFile() && exts.some(e => d.name.endsWith(e))) {
            results.push(full);
        }
    }
    return results;
}

const base = 'C:/temp/fibemate-clone';
const files = walk(base, ['.js','.cjs','.mjs','.html','.vue']);
const algoNames = ['ML-KEM','ML-DSA/fml-dsa','SLH-DSA','SM2','SM3','SM4','P-256/ECDH','Double-Ratchet','SHA-256','AES','NTT','TLA+'];

// Normalize algorithm name
function norm(a) {
    if (/ml.?kem/i.test(a)) return 'ML-KEM';
    if (/ml.?dsa|fml.?dsa/i.test(a)) return 'ML-DSA/fml-dsa';
    if (/slh.?dsa/i.test(a)) return 'SLH-DSA';
    if (/SM2\b/.test(a)) return 'SM2';
    if (/SM3\b/.test(a)) return 'SM3';
    if (/SM4\b/.test(a)) return 'SM4';
    if (/P-256|ECDH|ECDSA|Ed25519/i.test(a)) return 'P-256/ECDH';
    if (/double.?ratchet/i.test(a)) return 'Double-Ratchet';
    if (/SHA.?256/i.test(a)) return 'SHA-256';
    if (/NTT\b/i.test(a)) return 'NTT';
    return a;
}

// Build: file -> algos
const fileAlgos = {};
for (const f of files) {
    try {
        const rel = path.relative(base, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        const algos = new Set();
        // Match algorithm names
        const terms = /\b(ML-KEM|MLKEM|ml-kem|mlkem|ML-DSA|fml-dsa|SLH-DSA|slh-dsa|SM2\b|SM3\b|SM4\b|P-256|ECDH|ECDSA|Ed25519|AES\b|SHA-256|SHA256|Double.Ratchet)\b/gi;
        let m;
        while ((m = terms.exec(content)) !== null) {
            const a = norm(m[1]);
            if (a) algos.add(a);
        }
        if (algos.size > 0) fileAlgos[rel] = [...algos];
    } catch(e) {}
}

// Build: file -> imports (target file paths)
const fileImports = {};
for (const f of files) {
    try {
        const rel = path.relative(base, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        const imports = new Set();
        // import ... from '...' or require('...')
        const re = /(?:from\s+|require\s*\()\s*'([^']+)'/g;
        let m;
        while ((m = re.exec(content)) !== null) {
            const imp = m[1];
            if (imp.startsWith('./') || imp.startsWith('../')) {
                const d = path.dirname(rel);
                const resolved = path.posix.normalize(d + '/' + imp);
                imports.add(resolved);
            }
        }
        // HTML <script src="...">
        const re2 = /<script[^>]*src="([^"]+)"/gi;
        while ((m = re2.exec(content)) !== null) {
            const imp = m[1];
            if (imp.startsWith('./') || imp.startsWith('../')) {
                const d = path.dirname(rel);
                const resolved = path.posix.normalize(d + '/' + imp);
                imports.add(resolved);
            }
        }
        if (imports.size > 0) fileImports[rel] = [...imports];
    } catch(e) {}
}

// Build edges: A imports B
const edges = [];
for (const [file, imps] of Object.entries(fileImports)) {
    for (const imp of imps) {
        // Try with and without .js extension
        const targets = [];
        if (fileAlgos[imp]) targets.push(imp);
        if (fileAlgos[imp + '.js']) targets.push(imp + '.js');
        for (const t of targets) {
            const transfer = [];
            for (const a of (fileAlgos[t] || [])) {
                if (!(fileAlgos[file] || []).includes(a)) {
                    transfer.push(a);
                }
            }
            edges.push({ source: file, target: t, sourceAlgos: fileAlgos[file] || [], targetAlgos: fileAlgos[t] || [], transfer });
        }
    }
}

// Blast radius: for each algorithm, what files are directly and transitively affected
const blastRadius = {};
for (const a of algoNames) {
    const direct = [];
    for (const [file, fa] of Object.entries(fileAlgos)) {
        if (fa.includes(a)) direct.push(file);
    }
    // BFS: files that depend on (import) direct files
    const indirect = new Set();
    const bfs = [...direct];
    const visited = new Set(direct);
    while (bfs.length > 0) {
        const node = bfs.shift();
        for (const e of edges) {
            if ((e.target === node || e.target + '.js' === node) && !visited.has(e.source)) {
                visited.add(e.source);
                bfs.push(e.source);
                indirect.add(e.source);
            }
        }
    }

    // Count how many downstream-algos are reached via edges
    const downstreamAlgos = new Set();
    for (const ind of indirect) {
        for (const e of edges) {
            if (e.source === ind) {
                for (const ta of e.transfer) downstreamAlgos.add(ta);
            }
        }
    }

    blastRadius[a] = {
        direct,
        indirect: [...indirect],
        totalFiles: direct.length + indirect.size,
        downstreamAlgos: [...downstreamAlgos]
    };
}

console.log(JSON.stringify({ totalFiles: files.length, cryptoFiles: Object.keys(fileAlgos).length, edgeCount: edges.length, blastRadius }, null, 2));
