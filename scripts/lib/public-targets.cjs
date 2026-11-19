// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * The public files whose sentences make claims about the TSR corpus.
 *
 * One list, two gates: check-tsr-copy.cjs compares the numbers in these files
 * against the counter, check-measured-date.cjs compares the date that qualifies
 * those numbers against docs/metrics.json. They must scan the same set or one of
 * them reports "all clear" over a file the other one never opened.
 */
module.exports = [
  'README.md',
  'PRINCIPLES.md',
  'docs/ENGINEERING-DISCIPLINE.md',
  'docs/tsr-count.md',
  'www/index.html',
  'www/blog.html',
  'www/security.html',
  'www/docs/index.html',
  'www/docs/architecture.html',
  'www/docs/crypto-time-ledger.html',
  'www/docs/nist-csf-gap.html',
  'www/docs/PQC_MIGRATION_PLAN.md',
  'www/docs/INCIDENT_RESPONSE_PLAN.md',
];
