#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// Escaping for values that end up inside a Markdown table cell.
//
// This exists because the same two-line mistake was written twice in one day, in two files
// (deploy-evidence.cjs, then deploy-evidence-selftest.cjs): `.replace(/\|/g, '\\|')` without
// first doubling the backslashes. CodeQL flagged it both times as "incomplete string
// escaping". A rule remembered by a person is not a fix; a function both callers share is.
//
// Order matters: backslashes are doubled first, otherwise the backslash introduced by the
// pipe escape would itself get doubled on the way out.
//
//   escapeMdTable('a\\b|c') === 'a\\\\b\\|c'
//
// Newlines are replaced with a space because a newline ends the table row no matter how well
// the pipe is escaped.

'use strict';

function escapeMdTable(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, ' ');
}

module.exports = { escapeMdTable };
