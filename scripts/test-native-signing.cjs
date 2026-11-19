#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Structural check: the workflow that publishes the native addon must also publish a
// signature that a third party can verify. OpenSSF Scorecard reads release assets whose
// name ends in .asc/.minisig/.sig/.sign/.sigstore/.sigstore.json (probes/releasesAreSigned),
// so a signature that only exists in the runner's temp dir scores zero.
//
// This is a static check, so it is cheap enough to run on every pull request -- and it is
// the only thing standing between "we sign" and "someone deleted the signing step in a
// refactor". Each rule it enforces has been observed to matter:
//   - id-token: write          keyless cosign cannot get a Fulcio cert without it
//   - sign-blob step           the actual signature
//   - upload .sig              a signature nobody can download is not evidence
//   - verify-blob + identity   an unpinned identity accepts any valid cert
//   - tampered-copy control    without it, "verified" only proves cosign exits 0
//   - publish after the KATs   a signed release for a build that failed its checks is worse than no release
//   - attestation wired up     attestations: write + a pinned attest-build-provenance step
'use strict';

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', '.github', 'workflows', 'native-build.yml');

const RULES = [
  {
    id: 'job-id-token',
    why: 'keyless cosign needs an OIDC token; without id-token: write the signing step fails or is skipped',
    test: (s) => /permissions:\s*\n\s*contents:\s*write[^\n]*\n\s*id-token:\s*write/.test(s),
    expect: 'permissions: contents: write + id-token: write on the build job',
  },
  {
    id: 'sign-blob',
    why: 'no cosign sign-blob means no signature',
    test: (s) => /cosign sign-blob\b/.test(s),
    expect: 'a cosign sign-blob invocation',
  },
  {
    id: 'not-on-pr',
    why: 'pull requests from forks must never reach a signing step with a write scope',
    test: (s) => {
      const idx = s.indexOf('Sign the published assets');
      if (idx < 0) return false;
      const next = s.slice(idx, idx + 600);
      return /if:\s*github\.event_name\s*!=\s*'pull_request'/.test(next);
    },
    expect: "the signing step gated on github.event_name != 'pull_request'",
  },
  {
    id: 'upload-sig-assets',
    why: 'Scorecard reads release assets; a signature left on the runner is invisible',
    test: (s) => /gh release upload[^\n]*\.sig/.test(s),
    expect: 'gh release upload of .sig (and .pem) to the release',
  },
  {
    id: 'verify-with-pinned-identity',
    why: 'cosign verify-blob without an identity predicate accepts any certificate Fulcio ever issued',
    test: (s) => /cosign verify-blob[\s\S]{0,600}--certificate-identity-regexp/.test(s),
    expect: 'cosign verify-blob pinned by --certificate-identity-regexp',
  },
  {
    id: 'tampered-copy-must-fail',
    why: 'a verification that cannot fail is a log line, not a gate',
    test: (s) => /tampered\.node/.test(s) && /signature verified a modified copy/.test(s),
    expect: 'a negative control that expects a modified copy to be rejected',
  },
  {
    id: 'kat-before-publish',
    why: 'publish/sign before the KATs leaves a signed release behind for a build that failed its checks (#586)',
    test: (s) => {
      const kat = s.indexOf('Self-KAT (100 rounds)');
      const pub = s.indexOf('Publish the addon as a release asset');
      return kat >= 0 && pub >= 0 && kat < pub;
    },
    expect: 'the Self-KAT step to run before the publish step',
  },
  {
    id: 'attestations-permission',
    why: 'actions/attest-build-provenance cannot write an attestation without attestations: write',
    test: (s) => /attestations:\s*write/.test(s),
    expect: 'attestations: write on the build job',
  },
  {
    id: 'attest-provenance-pinned',
    why: 'the published artifact must carry provenance, and the action must be pinned to a commit',
    test: (s) => /actions\/attest-build-provenance@[0-9a-f]{40}\b/.test(s),
    expect: 'actions/attest-build-provenance pinned by a 40-hex commit SHA',
  },
];

function findings(text) {
  return RULES.filter((r) => !r.test(text));
}

function report(text, label) {
  const bad = findings(text);
  for (const r of bad) {
    console.log('MISSING ' + r.id + ': expected ' + r.expect);
    console.log('  reason: ' + r.why);
  }
  console.log(
    (bad.length ? 'FAIL' : 'OK') +
      ': ' + (RULES.length - bad.length) + '/' + RULES.length +
      ' signing rules hold' + (label ? ' (' + label + ')' : '')
  );
  return bad.length;
}

function selfTest() {
  const real = fs.readFileSync(WORKFLOW, 'utf8');
  const cases = [
    ['baseline', real, 0],
    ['no id-token', real.replace(/\n\s*id-token: write[^\n]*/, ''), 1],
    ['no sign-blob', real.replace(/cosign sign-blob/g, 'echo skip-signing'), 1],
    ['no upload of .sig', real.replace(/gh release upload "\$tag" \.\/\*\.sig \.\/\*\.pem --clobber/, 'echo not-uploaded'), 1],
    ['no identity pin', real.replace(/--certificate-identity-regexp/g, '--accept-anything'), 1],
    ['no negative control', real.replace(/tampered\.node/g, 'untouched.node'), 1],
    ['kat after publish', real.replace('Self-KAT (100 rounds)', 'Self-KAT (somewhere later)'), 1],
    ['no attestations permission', real.replace(/\n\s*attestations: write[^\n]*/, ''), 1],
    ['no attest step', real.replace(/actions\/attest-build-provenance@/g, 'actions/attest-placeholder@'), 1],
  ];
  let pass = 0;
  for (const [name, text, want] of cases) {
    const got = findings(text).length;
    const ok = got === want;
    if (ok) pass += 1;
    console.log((ok ? 'PASS' : 'FAIL') + ' self-test ' + name + ': expected ' + want + ' missing, got ' + got);
  }
  console.log(pass + '/' + cases.length + ' self-test cases behaved as expected');
  return pass === cases.length ? 0 : 1;
}

const arg = process.argv[2];
if (arg === '--self-test') {
  process.exit(selfTest());
}
if (arg && arg !== '--check') {
  console.log('usage: node scripts/test-native-signing.cjs [--check|--self-test]');
  process.exit(2);
}
if (!fs.existsSync(WORKFLOW)) {
  console.log('FAIL: workflow not found at ' + WORKFLOW + ' -- refusing to report success');
  process.exit(2);
}
process.exit(report(fs.readFileSync(WORKFLOW, 'utf8'), 'native-build.yml') ? 1 : 0);
