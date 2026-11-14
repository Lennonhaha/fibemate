// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/core/selftest-log.js
//
// Self-tests run when a core module is imported, and they throw when they fail.
// What they should not do is write to stdout for a library consumer who only
// wanted to sign something.
//
//   FML_DSA_SELFTEST=1   or   NODE_ENV=test   -> print the full transcript
//   otherwise                                 -> print only failure lines
//
// Failure lines are printed in every environment. Quiet-by-default is a
// convenience for consumers; suppressing the one line that says a self-test
// failed would turn a hard error into a mystery. The modules still throw, so a
// failure is fatal regardless of what reaches stdout.

const verbose = () =>
  process.env.FML_DSA_SELFTEST === '1' || process.env.NODE_ENV === 'test';

// Failure markers used across the modules: the word FAIL, "failed", and the two
// cross marks the parameter-set tables use (U+2717, U+274C).
const LOOKS_LIKE_FAILURE = /FAIL|failed|\u2717|\u274C/i;

export function selftestConsole() {
  return {
    log: (...args) => {
      if (verbose() || LOOKS_LIKE_FAILURE.test(String(args[0] ?? ''))) {
        console.log(...args);
      }
    },
    // Not used by the self-tests today, but a shadowed console with no warn/error
    // would turn a future debug line into a TypeError.
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };
}
