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

        // ─── Hash libraries (quantum safe — Grover only halves effective bits) ───
        '@noble/hashes': { type: 'hash', algorithm: 'SHA-2/SHA-3/HMAC/PBKDF2/scrypt', risk: 'quantum_safe', note: 'Grover halves effective bits but preimage/collision resistance intact' },
        'js-sha3': { type: 'hash', algorithm: 'SHA-3', risk: 'quantum_safe', note: 'SHA-3 implementation — Grover-only threat, no known quantum preimage attack' },
        'imurmurhash': { type: 'hash', algorithm: 'MurmurHash3', risk: 'none', note: 'Non-cryptographic hash — no quantum relevance' },

        // ─── Infrastructure / build tools (no crypto relevance) ───
        'minipass': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Stream utility' },
        'minimatch': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Glob matching' },
        'tar': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Archive tool' },
        'debug': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Logging utility' },
        'ansi-regex': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Terminal output' },
        'strip-ansi': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Terminal output' },
        'balanced-match': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'String matching' },
        'brace-expansion': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Glob expansion' },
        'concat-map': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Array utility' },
        'fs.realpath': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Filesystem utility' },
        'inflight': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Utility' },
        'inherits': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Prototype utility' },
        'once': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Function wrapper' },
        'path-is-absolute': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Path utility' },
        'wrappy': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Function wrapper' },
        'yallist': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Linked list' },
        'lru-cache': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Cache utility' },
        'semver': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Version parsing' },
        'ms': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Time conversion' },
        'has-flag': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'CLI utility' },
        'supports-color': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Terminal detection' },
        'color-convert': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Color utility' },
        'color-name': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Color utility' },
        'escape-string-regexp': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Regex utility' },
        'mime-db': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'MIME database' },
        'mime-types': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'MIME lookup' },
        'negotiator': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP content negotiation' },
        'accepts': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP accept header' },
        'array-flatten': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Array utility' },
        'body-parser': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP body parsing' },
        'bytes': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Byte conversion' },
        'content-disposition': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP header' },
        'content-type': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP header' },
        'cookie': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Cookie parsing' },
        'cookie-signature': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Cookie signing' },
        'depd': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Deprecation utility' },
        'destroy': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Stream destroy' },
        'ee-first': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Event utility' },
        'encodeurl': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'URL encoding' },
        'escape-html': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTML escaping' },
        'etag': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP ETag' },
        'finalhandler': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP final handler' },
        'forwarded': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Proxy header' },
        'fresh': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP cache' },
        'http-errors': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP error creation' },
        'ipaddr.js': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'IP address utility' },
        'media-typer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Media type parsing' },
        'merge-descriptors': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Object merge' },
        'methods': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP methods' },
        'on-finished': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP callback' },
        'parseurl': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'URL parsing' },
        'proxy-addr': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Proxy detection' },
        'qs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Query string' },
        'range-parser': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP range' },
        'raw-body': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP body' },
        'send': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP response' },
        'serve-static': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Static file serving' },
        'setprototypeof': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Prototype utility' },
        'statuses': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP status codes' },
        'toidentifier': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'String utility' },
        'type-is': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Content-Type check' },
        'unpipe': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Stream utility' },
        'utils-merge': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Object merge' },
        'vary': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP vary header' },
        'node-fetch': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP client' },
        'whatwg-url': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'URL parsing' },
        'tr46': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'IDNA utility' },
        'webidl-conversions': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'WebIDL utility' },
        'data-uri-to-buffer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Data URI conversion' },
        'fetch-blob': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Blob utility' },
        'formdata-polyfill': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'FormData polyfill' },
        'node-domexception': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'DOM exception polyfill' },
        'path-to-regexp': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'URL pattern matching' },
        'safer-buffer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Buffer safety' },
        'iconv-lite': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Character encoding' },
        'busboy': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Multipart parser' },
        'dicer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Multipart parser' },
        'streamsearch': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Stream search' },
        'object-assign': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Object.assign polyfill' },
        'side-channel': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Channel utility' },
        'es-errors': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Error types' },
        'es-define-property': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Property definition' },
        'call-bind-apply-helpers': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Function utility' },
        'dunder-proto': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Prototype utility' },
        'function-bind': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Function binding' },
        'get-intrinsic': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Intrinsic lookup' },
        'gopd': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Property descriptor' },
        'hasown': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'hasOwnProperty polyfill' },
        'has-symbols': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Symbol detection' },
        'has-proto': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Prototype detection' },
        'has-tostringtag': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Symbol.toStringTag detection' },
        'math-intrinsics': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Math intrinsics' },
        'object-inspect': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Object inspection' },
        'qs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Query string' },

        // ─── Node.js built-in wrappers (no quantum exposure) ───
        'fs': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js filesystem' },
        'path': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js path' },
        'crypto': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js crypto (OpenSSL wrapper, not a standalone library)' },
        'child_process': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js child process' },
        'os': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js OS' },
        'stream': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js stream' },
        'buffer': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js buffer' },
        'events': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js events' },
        'http': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js HTTP' },
        'https': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js HTTPS (TLS via OpenSSL, not a standalone library)' },
        'url': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js URL' },
        'net': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js net' },
        'tls': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js TLS' },
        'dns': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js DNS' },
        'querystring': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js querystring' },
        'assert': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js assert' },
        'util': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js util' },
        'zlib': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js zlib' },
        'timers': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js timers' },
        'punycode': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js punycode' },
        'readline': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js readline' },
        'repl': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js REPL' },
        'vm': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js VM' },
        'worker_threads': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js worker threads' },
        'cluster': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js cluster' },
        'perf_hooks': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js performance hooks' },
        // ─── node: prefixed ESM imports ───
        'node:fs': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js filesystem (ESM)' },
        'node:path': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js path (ESM)' },
        'node:crypto': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js crypto (ESM)' },
        'node:child_process': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js child process (ESM)' },
        'node:os': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js OS (ESM)' },
        'node:stream': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js stream (ESM)' },
        'node:buffer': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js buffer (ESM)' },
        'node:events': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js events (ESM)' },
        'node:http': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js HTTP (ESM)' },
        'node:https': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js HTTPS (ESM)' },
        'node:url': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js URL (ESM)' },
        'node:net': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js net (ESM)' },
        'node:tls': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js TLS (ESM)' },
        'node:dns': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js DNS (ESM)' },
        'node:querystring': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js querystring (ESM)' },
        'node:assert': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js assert (ESM)' },
        'node:util': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js util (ESM)' },
        'node:zlib': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js zlib (ESM)' },
        'node:timers': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js timers (ESM)' },
        'node:punycode': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js punycode (ESM)' },
        'node:readline': { type: 'builtin', algorithm: 'N/A', risk: 'none', note: 'Node.js readline (ESM)' },

        // ─── Remaining npm packages (manual review cleared, no crypto) ───
        '@noble/ciphers': { type: 'cipher', algorithm: 'AES/Salsa20/ChaCha', risk: 'quantum_safe', note: 'Symmetric ciphers — Grover halves effective key length only' },
        'minizlib': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'zlib wrapper' },
        '@isaacs/fs-minipass': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Stream utility' },
        'path-scurry': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Path traversal utility' },
        'graceful-fs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'fs wrapper' },
        'agent-base': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTTP agent base class' },
        'ssri': { type: 'infra', algorithm: 'SHA-512 SRI', risk: 'quantum_safe', note: 'Subresource integrity — hash-based' },
        'jackspeak': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Argument parser' },
        'dom-serializer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'DOM serialization' },
        'domelementtype': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'DOM types' },
        'domhandler': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'DOM handler' },
        'domutils': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'DOM utilities' },
        'htmlparser2': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTML parser' },
        'cheerio': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTML parser' },
        'boolbase': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Boolean utility' },
        'nth-check': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'CSS selector' },
        'entities': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTML entity encoder' },
        'parse5': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'HTML5 parser' },
        'parse5-htmlparser2-tree-adapter': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'parse5 adapter' },
        'underscore': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Utility library' },
        'whatwg-encoding': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Encoding detection' },
        'abab': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'atob/btoa' },
        'css-select': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'CSS selector engine' },
        'css-what': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'CSS selector parser' },
        'html-encoding-sniffer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Encoding detection' },
        'nwsapi': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'CSS selector matcher' },
        'symbol-tree': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Symbol tree' },
        'tough-cookie': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Cookie handling' },
        'w3c-xmlserializer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'XML serializer' },
        'webidl2': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'WebIDL parser' },
        'xml-name-validator': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'XML validator' },
        'xmlchars': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'XML utilities' },
        'rrweb-cssom': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'CSSOM' },
        'string_decoder': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'String decoder' },
        'readable-stream': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Stream polyfill' },
        'safe-buffer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Buffer polyfill' },
        'core-util-is': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'util.is polyfill' },
        'isarray': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Array detection' },
        'process-nextick-args': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'process.nextTick' },
        'util-deprecate': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Deprecation utility' },
        'retry': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Retry logic' },
        'unique-filename': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Filename generator' },
        'unique-slug': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Slug generator' },
        'promise-retry': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Promise retry' },
        'err-code': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Error code utility' },
        'sprintf-js': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'String formatting' },
        'argparse': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Argument parser' },
        'linkify-it': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Link detection' },
        'mdurl': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'URL utilities' },
        'uc.micro': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Unicode micro lib' },
        'punycode.js': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Punycode' },
        'markdown-it': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Markdown parser' },
        'markdown-it-anchor': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Markdown-it plugin' },
        'markdown-it-attrs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Markdown-it plugin' },
        'markdown-it-container': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Markdown-it plugin' },
        'markdown-it-emoji': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Markdown-it plugin' },
        'markdown-it-table-of-contents': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Markdown-it plugin' },
        'transliteration': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Text transliteration' },
        'chokidar': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'File watcher' },
        'anymatch': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Glob matcher' },
        'binary-extensions': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Extension list' },
        'braces': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Brace expansion' },
        'fill-range': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Range fill' },
        'glob-parent': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Glob path extract' },
        'is-binary-path': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Binary path detection' },
        'is-extglob': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Glob detection' },
        'is-glob': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Glob detection' },
        'is-number': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Number detection' },
        'normalize-path': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Path normalization' },
        'picomatch': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Glob matcher' },
        'readdirp': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Recursive readdir' },
        'to-regex-range': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Regex range' },
        'js-yaml': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'YAML parser' },
        'esprima': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'JS parser' },
        'estraverse': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'AST traversal' },
        'esutils': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'AST utilities' },
        'optionator': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Option parsing' },
        'prelude-ls': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Functional utility' },
        'type-check': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Type checking' },
        'word-wrap': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Word wrapping' },
        'levn': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Lexical value construction' },
        'fast-levenshtein': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'String distance' },
        'deep-is': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Deep equality' },

        'node:repl': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'node:vm': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'node:worker_threads': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'node:cluster': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'node:perf_hooks': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'node:string_decoder': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'node:constants': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'node:module': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'string-width': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        '@pkgjs/parseargs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'package-json-from-dist': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'minipass-pipeline': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'minipass-fetch': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'is-fullwidth-code-point': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'emoji-regex': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'minipass-flush': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        '@npmcli/fs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'fs-minipass': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'ansi-styles': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'wrap-ansi': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'isexe': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'fdir': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'chownr': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'socks': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'ip-address': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'shebang-regex': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'expect.js': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'path-key': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'which': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'proc-log': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'env-paths': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'tap': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        '@isaacs/cliui': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'cross-spawn': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'signal-exit': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'minipass-collect': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'minimist': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        '@eslint/js': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'tail': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'cypress': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'chalk': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'eastasianwidth': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'smart-buffer': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'tape': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'sleep-promise': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'p-map': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'got': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'abbrev': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'neostandard': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'tinyglobby': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'make-fetch-happen': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'exponential-backoff': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'nopt': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'minipass-sized': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'encoding': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        '@npmcli/agent': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'cacache': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'http-cache-semantics': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'foreground-child': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'mkdirp': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'rimraf': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'shebang-command': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'glob': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'http-proxy-agent': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'https-proxy-agent': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'socks-proxy-agent': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'string-width-cjs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'strip-ansi-cjs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'wrap-ansi-cjs': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        '@fibemate/pqc-kem': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'fake': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'x': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'tty': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'delay': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'module': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
        'constants': { type: 'none', algorithm: 'N/A', risk: 'none', note: 'Infrastructure utility — no crypto relevance' },
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
