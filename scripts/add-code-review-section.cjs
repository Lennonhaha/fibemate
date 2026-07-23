// SPDX-License-Identifier: GPL-3.0-only
const fs = require('fs');
const path = '/opt/fibemate-repo/CONTRIBUTING.md';

let content = fs.readFileSync(path, 'utf8');

if (content.includes('## Code Review')) {
  console.log('[skip] Code Review section already exists');
  process.exit(0);
}

const section = [
'',
'## Code Review',
'',
'### Why Review Matters',
'',
'FIBEMATE handles cryptographic code. Even a one-line change to an NTT routine or a',
'masking strategy can affect security guarantees. Every change — regardless of author —',
'must be reviewed.',
'',
'### Review Process',
'',
'1. **Self-review** (required): The author must review their own diff before requesting',
'   external review. Run this checklist manually:',
'   - I have explained *why* this change is needed in the PR description.',
'   - I have run the relevant test suite (unit + KAT + smoke).',
'   - I have verified no KAT vector regressions.',
'   - If cryptographic code: I have explained the security reasoning.',
'   - If performance code: I have included benchmark numbers (before/after).',
'',
'2. **Automated review** (required): CI runs a standardised review pipeline on every PR:',
'   - ESLint / cargo clippy (code quality)',
'   - KAT regression check (correctness)',
'   - Security keyword scanner (catches unsafe patterns like `Math.random`, non-constant-time loops)',
'   - ShellCheck for shell scripts',
'   - `npm audit` / `cargo audit` for dependency vulnerabilities',
'',
'3. **Human review** (where available): At least one external reviewer must approve',
'   before merge. For cryptographic changes, the reviewer should verify:',
'   - Algorithm logic against the published standard (FIPS 203, GB/T 32918, etc.)',
'   - No new side-channel vectors introduced.',
'   - Test vectors match reference implementations.',
'',
'### Single-Maintainer Adaptation',
'',
'FIBEMATE is currently maintained by one person. This is a recognised limitation for',
'OpenSSF "Silver" badge eligibility. Until external contributors join:',
'',
'- **Automated review output serves as the de facto second-reviewer record.**',
'  Every merged PR must have a passing CI review run visible in the PR timeline.',
'- **Security-sensitive changes undergo a mandatory 24-hour cool-down**: the author',
'  must re-review their own change after at least 24 hours before merging.',
'- **Design reviews for cryptographic changes are archived** in',
'  [Discussions → Design Review](https://github.com/Lennonhaha/fibemate/discussions/categories/design-review)',
'  or captured in commit messages with reasoning.',
'',
'### Merge Criteria',
'',
'A PR may be merged when:',
'',
'| Criterion | Required? | Verified by |',
'|-----------|-----------|-------------|',
'| All CI checks pass (lint, test, KAT, audit) | Required | GitHub Actions |',
'| At least one approving review | Required | GitHub PR review |',
'| No unresolved review comments | Required | GitHub PR timeline |',
'| Breaking change: prior discussion in Discussions | Required | Link in PR |',
'| Cryptographic change: security reasoning documented | Required | PR description |',
'| Documentation updated (API, architecture, README) | If applicable | PR diff |',
'| Benchmarks not degraded | If performance change | Benchmark comment |',
'',
'### Review Records',
'',
'All review decisions are permanently archived in:',
'',
'1. **GitHub PR timeline** — automated review results + human review comments.',
'2. **Commit messages** — `Reviewed-by:` trailer where applicable.',
'3. **TSR timestamp chain** — major security milestone commits are timestamped',
'   (see `www/docs/tsa/` — TSR manifests link SHA256 of reviewed code versions).',
'',
'For audit purposes, every merged cryptographic change must be traceable:',
'`PR` → `CI review run` → `commit SHA` → `TSR timestamp`.',
'',
'### Exceptions',
'',
'- **Release tagging** (version bumps, changelog): self-merge allowed after CI passes.',
'- **Documentation-only fixes** (typos, formatting): one approving review or 24h cool-down.',
'- **Emergency security fixes**: documented in SECURITY.md, retroactive review required.',
''].join('\n') + '\n';

content += section;
fs.writeFileSync(path, content, 'utf8');

// Validate
const final = fs.readFileSync(path, 'utf8');
const lines = final.split('\n').length;
const checks = {
  'Code Review header': final.includes('## Code Review'),
  'Self-review checklist': final.includes('Self-review'),
  'Merge Criteria table': final.includes('Merge Criteria'),
  'Single-Maintainer note': final.includes('Single-Maintainer'),
  'Review Records section': final.includes('Review Records'),
};
console.log('CONTRIBUTING.md now ' + lines + ' lines');
for (const [k, v] of Object.entries(checks)) {
  console.log('  ' + (v ? '✅' : '❌') + ' ' + k);
}
