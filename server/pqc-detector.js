/**
 * PQC Deployment Detector — Phase 1: TLS Endpoint Probe (pure Node.js)
 * 
 * Detects PQC readiness on TLS 1.3 endpoints using only Node.js built-in `tls`.
 * No external dependency. FIBEMATE © 2026.
 */
'use strict';

const tls = require('tls');

// ─── PQC NamedGroup registry ────────────────────────────────────────────────
// IANA TLS Supported Groups registry — PQC hybrid KEM entries
const PQC_GROUPS = {
  4584: 'X25519MLKEM512',    4585: 'SecP256r1MLKEM512',
  4586: 'MLKEM512',          4587: 'MLKEM768',
  4588: 'X25519MLKEM768',    4589: 'MLKEM1024',
  4590: 'X25519MLKEM1024',   4591: 'SecP384r1MLKEM768',
};

// ─── Core Probe ──────────────────────────────────────────────────────────────

/**
 * Probe an endpoint and return structured PQC readiness report.
 * @param {string} hostname
 * @param {number} port
 * @returns {Promise<object>}
 */
function probe(hostname, port = 443) {
  return new Promise((resolve) => {
    const report = {
      endpoint: `${hostname}:${port}`,
      timestamp: new Date().toISOString(),
      reachable: false,
      tlsVersion: null,
      cipher: null,
      keyExchange: null,
      cert: null,
      compliance: { score: 0, maxScore: 100, grade: 'F', checks: [] },
    };

    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(report); } };

    const sock = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      // codeql[js/disabling-certificate-validation] Intentionally disabled: this is a PQC deployment probe tool that must probe arbitrary TLS servers, not a production app. False certs are expected for self-signed/internal CA servers. The probe result is never used for secure connections.
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ALPNProtocols: ['h2', 'http/1.1'],
    }, () => {
      report.reachable = true;
      report.tlsVersion = sock.getProtocol();

      const cipher = sock.getCipher();
      report.cipher = cipher ? { name: cipher.name, version: cipher.version } : null;

      const eph = sock.getEphemeralKeyInfo ? sock.getEphemeralKeyInfo() : null;
      if (eph) {
        report.keyExchange = { type: eph.type, name: eph.name, size: eph.size };
      }

      const rawCert = sock.getPeerCertificate(false);
      report.cert = {
        subject: rawCert.subject ? Object.fromEntries(
          Object.entries(rawCert.subject).filter(([,v]) => v)
        ) : {},
        issuer: rawCert.issuer ? Object.fromEntries(
          Object.entries(rawCert.issuer).filter(([,v]) => v)
        ) : {},
        validFrom: rawCert.valid_from,
        validTo: rawCert.valid_to,
        serialNumber: rawCert.serialNumber,
        publicKey: { type: rawCert.asn1Curve || 'RSA', bits: rawCert.bits || 2048 },
        sigAlgorithm: rawCert.sigalg || 'unknown',
        isSelfSigned: rawCert.issuer?.CN === rawCert.subject?.CN,
      };

      report.compliance = score(report);
      sock.end();
      done();
    });

    sock.on('error', (err) => {
      report.errors = [err.message];
      done();
    });

    sock.setTimeout(6000, () => { sock.destroy(); done(); });
  });
}

// ─── Batch Probe ─────────────────────────────────────────────────────────────

async function probeMany(endpoints) {
  const results = [];
  for (const ep of endpoints) {
    const [host, portStr = '443'] = ep.split(':');
    const port = parseInt(portStr, 10);
    process.stderr.write(`[PQC-DETECT] Probing ${host}:${port} ...`);
    const start = Date.now();
    const r = await probe(host, port);
    const ms = Date.now() - start;
    process.stderr.write(` ${r.reachable ? 'OK' : 'FAIL'} (${ms}ms)\n`);
    results.push(r);
  }
  return results;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function score(r) {
  const checks = [];
  let pts = 0;

  // Check 1: TLS 1.3 (30 pts)
  if (r.tlsVersion === 'TLSv1.3') {
    pts += 30; checks.push({ check: 'TLS 1.3', status: 'PASS', weight: 30, value: r.tlsVersion });
  } else {
    checks.push({ check: 'TLS 1.3', status: 'FAIL', weight: 30,
      detail: `Got ${r.tlsVersion || 'N/A'}. TLS 1.3 required for PQC hybrid KEM.` });
  }

  // Check 2: Key exchange (25 pts) — look for PQC in ephemeralKeyInfo
  if (r.keyExchange && r.keyExchange.name) {
    const keName = r.keyExchange.name.toLowerCase();
    if (keName.includes('mlkem') || keName.includes('kem') || keName.includes('pqc')) {
      pts += 25; checks.push({ check: 'PQC key exchange', status: 'PASS', weight: 25, value: r.keyExchange.name });
    } else if (keName.includes('x25519') || keName.includes('p-256') || keName.includes('p-384')) {
      pts += 12; checks.push({ check: 'PQC key exchange', status: 'WARN', weight: 25,
        detail: `Using classic ${r.keyExchange.name}. No PQC KEM. Add X25519MLKEM768.` });
    } else {
      pts += 5; checks.push({ check: 'PQC key exchange', status: 'FAIL', weight: 25, detail: 'No PQC KEM detected.' });
    }
  } else {
    checks.push({ check: 'PQC key exchange', status: 'WARN', weight: 25,
      detail: 'EphemeralKeyInfo not available; check server config.' });
  }

  // Check 3: Cipher (15 pts)
  if (r.cipher && r.cipher.name) {
    const cn = r.cipher.name;
    if (/TLS_AES_256_GCM/i.test(cn)) pts += 15;
    else if (/TLS_AES_128_GCM/i.test(cn)) pts += 12;
    else if (/TLS_CHACHA20/i.test(cn)) pts += 10;
    else pts += 6;
    checks.push({ check: 'Cipher suite', status: 'PASS', weight: 15, value: cn });
  } else {
    checks.push({ check: 'Cipher suite', status: 'WARN', weight: 15 });
  }

  // Check 4: Certificate (15 pts)
  if (r.cert) {
    if (r.cert.publicKey.type === 'ML-KEM' || r.cert.publicKey.type === 'ML-DSA') {
      pts += 15; checks.push({ check: 'PQC certificate', status: 'PASS', weight: 15 });
    } else if (r.cert.publicKey.type === 'RSA' && r.cert.publicKey.bits < 2048) {
      checks.push({ check: 'Certificate', status: 'FAIL', weight: 15, detail: 'Weak RSA key.' });
    } else {
      pts += 10; checks.push({ check: 'Certificate', status: 'PASS', weight: 15,
        detail: `${r.cert.publicKey.type} ${r.cert.publicKey.bits}bit ok. No PQC cert yet.` });
    }
  }

  // Check 5: Migration readiness (15 pts)
  if (r.tlsVersion === 'TLSv1.3') {
    pts += 15; checks.push({ check: 'Migration readiness', status: 'PASS', weight: 15,
      detail: 'TLS 1.3 path clear. PQC hybrid KEM deployable via server update.' });
  } else {
    checks.push({ check: 'Migration readiness', status: 'FAIL', weight: 15,
      detail: 'Upgrade to TLS 1.3 before adding PQC.' });
  }

  const score = Math.min(pts, 100);
  let grade = 'F';
  if (score >= 85) grade = 'A'; else if (score >= 70) grade = 'B'; else if (score >= 50) grade = 'C'; else if (score >= 30) grade = 'D';

  return { score, maxScore: 100, grade, checks };
}

// ─── Report Formatting ───────────────────────────────────────────────────────

function formatReport(results) {
  const L = [];
  L.push('╔══════════════════════════════════════════════════════════════════════╗');
  L.push('║  FIBEMATE PQC Deployment Checker — Report                          ║');
  L.push('║  Model 2: Deployment Verification Framework                        ║');
  L.push('╠══════════════════════════════════════════════════════════════════════╣');
  L.push('');
  for (const r of results) {
    L.push(`  📡 ${r.endpoint}`);
    L.push(`     Reachable:     ${r.reachable ? '✅ YES' : '❌ NO'}`);
    L.push(`     TLS Version:   ${r.tlsVersion || 'N/A'}`);
    if (r.cipher) L.push(`     Cipher:        ${r.cipher.name}`);
    if (r.keyExchange) L.push(`     Key Exchange:  ${r.keyExchange.name || r.keyExchange.type} (${r.keyExchange.size || '?'} bit)`);
    if (r.cert) {
      L.push(`     Certificate:   CN=${r.cert.subject.CN || '?'} | ${r.cert.publicKey.type}-${r.cert.publicKey.bits}`);
      L.push(`     Valid until:   ${r.cert.validTo || '?'}`);
    }
    L.push(`     PQC Grade:     ${r.compliance.grade}  (${r.compliance.score}/100)`);
    L.push('');
    for (const c of r.compliance.checks) {
      const icon = c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
      L.push(`     ${icon} [${c.status.padEnd(4)}] ${c.check}${c.detail ? ' — ' + c.detail : ''}${c.value ? ' (' + c.value + ')' : ''}`);
    }
    L.push('');
  }
  L.push('──────────────────────────────────────────────────────────────────────');
  for (const r of results) {
    L.push(`  ${r.endpoint.padEnd(28)} Grade: ${r.compliance.grade} | Score: ${r.compliance.score}%`);
  }
  return L.join('\n');
}

module.exports = { probe, probeMany, formatReport, PQC_GROUPS };
