#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// The runtime path set, defined once.
//
// "Runtime paths" = the paths whose content can change what production serves or executes.
// `scripts/deploy-release.sh` verifies exactly these trees with `--tree` before it links a
// new release, so that script — not this file — is the real definition. Everything else that
// needs the set reads it from here, and `scripts/deploy-evidence-selftest.cjs` fails if this
// list and the `--tree` arguments in deploy-release.sh ever disagree.
//
// Why a shared constant instead of two literals: check-deploy-alignment.cjs (the gate) and
// deploy-evidence.cjs (the record) used to state the set separately. If the set is wrong,
// both go wrong together and then agree with each other — the same shape as three numbers
// that add up to 364 while all three are false. One definition, one place to fix, and a
// check that notices when the definition stops matching the deploy script.
//
// Adding a runtime path: change deploy-release.sh's `--tree` arguments and this list in the
// same commit. The self-test will tell you if you forgot one of them.

'use strict';

const RUNTIME_PATHS = Object.freeze(['src', 'packages', 'www']);

module.exports = { RUNTIME_PATHS };
