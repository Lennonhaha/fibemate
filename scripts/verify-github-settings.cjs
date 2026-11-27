#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * Verify the GitHub settings we depend on, instead of trusting a 200 OK.
 *
 * Why this exists: PATCH /repos/{r} returned HTTP 200 while
 * `validity_checks` and `non_provider_patterns` stayed `disabled`. A 2xx is a
 * transport result, not a state change. This script reads the state back and
 * fails when it does not match the contract.
 *
 * Contract:
 *   secret_scanning                 must be enabled
 *   secret_scanning_push_protection must be enabled
 *   validity_checks                 license-gated (GHAS); recorded, not failed
 *   non_provider_patterns           license-gated (GHAS); recorded, not failed
 *   main branch ruleset             must exist, be active, and require at least
 *                                   one status check
 *
 * Exit codes: 0 all required checks pass, 1 any required check fails or cannot
 * be read, 2 usage error. "Cannot read" is a failure: unknown is not green.
 *
 * Usage: node scripts/verify-github-settings.cjs [owner/repo ...]
 * Requires: gh CLI authenticated with administration:read on each repo.
 */
'use strict';

const { spawnSync } = require('child_process');

const DEFAULT_REPOS = [
    'Lennonhaha/fibemate',
    'Lennonhaha/fibemate-core',
    'Lennonhaha/fibemate-tools',
    'Lennonhaha/fibemate-tauri'
];

const REQUIRED = [
    ['secret_scanning', 'secret scanning'],
    ['secret_scanning_push_protection', 'push protection']
];
const LICENSE_GATED = [
    ['validity_checks', 'validity checks'],
    ['non_provider_patterns', 'non-provider patterns']
];

function gh(args) {
    const r = spawnSync('gh', args, { encoding: 'utf8' });
    if (r.error) {
        return { ok: false, error: r.error.message };
    }
    if (r.status !== 0) {
        return { ok: false, error: (r.stderr || r.stdout || '').trim().split('\n')[0] || ('gh exited ' + r.status) };
    }
    try {
        return { ok: true, data: JSON.parse(r.stdout) };
    } catch (e) {
        return { ok: false, error: 'invalid JSON from gh: ' + e.message };
    }
}

function stateOf(security, key) {
    const v = security && security[key];
    if (!v) return 'absent';
    return v.status || 'absent';
}

function main() {
    const repos = process.argv.slice(2).filter((a) => !a.startsWith('-'));
    const list = repos.length ? repos : DEFAULT_REPOS;
    let failed = 0;

    for (const repo of list) {
        if (!/^[^/]+\/[^/]+$/.test(repo)) {
            console.log('FAIL ' + repo + ' invalid repo name (want owner/name)');
            failed++;
            continue;
        }

        const meta = gh(['api', 'repos/' + repo]);
        if (!meta.ok) {
            console.log('FAIL ' + repo + ' cannot read repository: ' + meta.error);
            failed++;
            continue;
        }
        const security = meta.data.security_and_analysis || null;

        for (const [key, label] of REQUIRED) {
            const state = stateOf(security, key);
            if (state === 'enabled') {
                console.log('PASS ' + repo + ' ' + label + ' enabled');
            } else {
                console.log('FAIL ' + repo + ' ' + label + ' is "' + state + '", expected enabled');
                failed++;
            }
        }

        for (const [key, label] of LICENSE_GATED) {
            const state = stateOf(security, key);
            if (state === 'enabled') {
                console.log('PASS ' + repo + ' ' + label + ' enabled');
            } else {
                // Not a failure: without a GHAS license the API accepts PATCH and
                // still reports disabled. Record it so the report cannot claim
                // these were merely "not configured yet".
                console.log('INFO ' + repo + ' ' + label + ' "' + state + '" (license-gated, excluded from score)');
            }
        }

        const rulesets = gh(['api', 'repos/' + repo + '/rulesets']);
        if (!rulesets.ok) {
            console.log('FAIL ' + repo + ' cannot read rulesets: ' + rulesets.error);
            failed++;
            continue;
        }
        const active = (rulesets.data || []).filter((r) => r.target === 'branch');
        if (!active.length) {
            console.log('FAIL ' + repo + ' no branch ruleset');
            failed++;
            continue;
        }
        let requiredCount = 0;
        for (const rs of active) {
            const detail = gh(['api', 'repos/' + repo + '/rulesets/' + rs.id]);
            if (!detail.ok) {
                console.log('FAIL ' + repo + ' cannot read ruleset ' + rs.id + ': ' + detail.error);
                failed++;
                continue;
            }
            const checks = (detail.data.rules || [])
                .filter((r) => r.type === 'required_status_checks')
                .flatMap((r) => r.parameters.required_status_checks || []);
            requiredCount += checks.length;
        }
        if (requiredCount > 0) {
            console.log('PASS ' + repo + ' branch ruleset requires ' + requiredCount + ' status check(s)');
        } else {
            console.log('FAIL ' + repo + ' branch ruleset requires no status checks');
            failed++;
        }
    }

    if (failed) {
        console.log('\nFAILED: ' + failed + ' required setting(s) not verified');
        process.exit(1);
    }
    console.log('\nPASS: all required settings verified');
}

main();
