#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// GitHub patrol: a report that is stale is worse than no report.
//
// Three rules this tool exists to enforce (see docs/ENGINEERING-DISCIPLINE.md 20.14):
//   1. Every status field is pulled live. Nothing is read from a cached snapshot.
//   2. Windows are half-open: [start, end). An event at exactly `end` belongs to the
//      next window, not this one.
//   3. Repositories are enumerated from the org, never from a hand-written list.
//      Archived repos are reported in their own section instead of being silently ok.
//
// Usage:
//   node scripts/gh-patrol.cjs [--hours 10] [--end 2026-11-20T12:00:06Z] [--org Lennonhaha]
//                              [--format md|json] [--out report.md]
//   node scripts/gh-patrol.cjs --self-test
//
// Exit codes: 0 healthy, 1 findings that need a human, 2 usage/network error.

'use strict';

const { execFileSync } = require('child_process');

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_ERROR = 2;

// ---------------------------------------------------------------- pure helpers

function inWindow(ts, startMs, endMs) {
  if (!ts) return false;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return false;
  return t >= startMs && t < endMs; // half-open on both ends: [start, end)
}

function classifyRepo(repo) {
  const name = repo.name || '';
  if (repo.archived) return 'archived';
  if (repo.fork) return 'fork';
  if (/^(Liu|game-sever|psychic-octo-lamp)$/i.test(name)) return 'unrelated';
  return 'product';
}

function countUnassigned(issues) {
  // Deliberately reads issue.assignees (plural, array). `issue.assignee` is a
  // legacy single-user field and is null on issues that do have assignees.
  return issues.filter((i) => !Array.isArray(i.assignees) || i.assignees.length === 0).length;
}

function countUnlabeled(issues) {
  return issues.filter((i) => !Array.isArray(i.labels) || i.labels.length === 0).length;
}

function shortSha(s) {
  return (s || '').slice(0, 8);
}

function mdEscape(s) {
  // Backslashes first, then pipes: escaping only the pipe leaves a trailing
  // backslash in the cell, which re-opens the pipe it was meant to protect.
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

// ---------------------------------------------------------------- gh access

function gh(args) {
  let out;
  try {
    out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().trim().split('\n')[0];
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${msg}`);
  }
  return out.trim();
}

function ghJson(args) {
  const raw = gh(args);
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------- collection

function listOrgRepos(org) {
  // Three enumeration paths, in order of completeness:
  //   user/repos?affiliation=owner  -> every repo the token owns, private included (23 here)
  //   orgs/{org}/repos              -> organizations only (404 for a user account)
  //   users/{org}/repos             -> public repos of a user; silently omits private ones
  const jq = '.[] | {name,archived,fork,private,pushed_at,default_branch}';
  const attempts = [
    { url: 'user/repos?affiliation=owner&per_page=100&visibility=all', source: 'authenticated-user' },
    { url: `orgs/${org}/repos?per_page=100&type=all`, source: 'org' },
    { url: `users/${org}/repos?per_page=100&type=owner`, source: 'public-user' },
  ];
  let lastErr = null;
  for (const a of attempts) {
    try {
      const raw = gh(['api', a.url, '--paginate', '--jq', jq]);
      const repos = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      return { repos, source: a.source };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Independent cross-check: if the enumeration misses a repo the CLI can see, say so.
function crossCheckCount(org, enumerated) {
  try {
    const listed = JSON.parse(gh(['repo', 'list', org, '--limit', '200', '--json', 'name']));
    const have = new Set(enumerated.map((r) => r.name));
    const missing = listed.map((r) => r.name).filter((n) => !have.has(n));
    return { cliCount: listed.length, missing };
  } catch (e) {
    return { cliCount: null, missing: [], error: e.message };
  }
}

function repoWindow(repo, startISO, endISO) {
  const full = `Lennonhaha/${repo.name}`;
  const out = { name: repo.name, kind: classifyRepo(repo), error: null, commits: 0, mergedPRs: [], newIssues: [], openIssues: null, unassigned: null, unlabeled: null, failedRuns: [], headSha: null, releases: [] };

  try {
    const commits = ghJson(['api', `repos/${full}/commits?since=${startISO}&until=${endISO}&per_page=100`]);
    out.commits = Array.isArray(commits) ? commits.length : 0;
  } catch (e) {
    out.error = out.error || e.message;
  }

  try {
    const pulls = ghJson(['api', `repos/${full}/pulls?state=closed&sort=updated&direction=desc&per_page=100`]);
    const startMs = Date.parse(startISO);
    const endMs = Date.parse(endISO);
    out.mergedPRs = (pulls || [])
      .filter((p) => inWindow(p.merged_at, startMs, endMs))
      .map((p) => ({ number: p.number, title: p.title, mergedAt: p.merged_at, sha: p.merge_commit_sha }));
  } catch (e) {
    out.error = out.error || e.message;
  }

  try {
    // Live: the open-issue list is fetched now, with assignees and labels inline.
    const issues = ghJson(['api', `repos/${full}/issues?state=open&per_page=100`]);
    const realIssues = (issues || []).filter((i) => !i.pull_request);
    out.openIssues = realIssues.length;
    out.unassigned = countUnassigned(realIssues);
    out.unlabeled = countUnlabeled(realIssues);
    const startMs = Date.parse(startISO);
    const endMs = Date.parse(endISO);
    out.newIssues = realIssues
      .filter((i) => inWindow(i.created_at, startMs, endMs))
      .map((i) => ({ number: i.number, title: i.title }));
  } catch (e) {
    out.error = out.error || e.message;
  }

  try {
    const branch = repo.default_branch || 'main';
    const head = ghJson(['api', `repos/${full}/commits/${branch}`, '--jq', '{sha}']);
    out.headSha = head ? head.sha : null;
    if (out.headSha) {
      // Paginate: a busy repo has ~1k runs in 10h, so a single page (100) hides failures.
      const raw = gh(['api', `repos/${full}/actions/runs?created=${startISO}..${endISO}&status=completed&per_page=100`,
        '--paginate', '--jq',
        '.workflow_runs[] | select(.conclusion=="failure" or .conclusion=="cancelled" or .conclusion=="timed_out") | {name,head_sha,conclusion,created_at}']);
      out.failedRuns = raw.split('\n').filter(Boolean).map((l) => {
        const r = JSON.parse(l);
        return { name: r.name, sha: r.head_sha, conclusion: r.conclusion, createdAt: r.created_at };
      });
      const headRuns = ghJson(['api', `repos/${full}/actions/runs?head_sha=${out.headSha}&per_page=5`]);
      out.headRuns = (headRuns.workflow_runs || []).map((r) => ({ name: r.name, conclusion: r.conclusion || r.status }));
    }
  } catch (e) {
    out.error = out.error || e.message;
  }

  try {
    const rel = ghJson(['api', `repos/${full}/releases?per_page=5`]);
    const startMs = Date.parse(startISO);
    const endMs = Date.parse(endISO);
    out.releases = (rel || []).filter((r) => inWindow(r.published_at || r.created_at, startMs, endMs)).map((r) => r.tag_name);
  } catch (e) {
    out.error = out.error || e.message;
  }

  return out;
}

// ---------------------------------------------------------------- rendering

function renderMarkdown(state) {
  const L = [];
  const { org, asOf, startISO, endISO, repos, buckets, enumeration, crossCheck } = state;
  const products = repos.filter((r) => r.kind === 'product');
  const bad = products.filter((r) => r.error);
  const headRed = products.filter((r) => (r.headRuns || []).some((x) => ['failure', 'cancelled', 'timed_out'].includes(x.conclusion)));

  L.push(`# GitHub patrol - ${org}`);
  L.push('');
  L.push(`- as of **${asOf}** (window **${startISO} .. ${endISO}**, half-open [start, end))`);
  L.push(`- repositories: ${enumeration} enumeration returned **${repos.length}** (product ${buckets.product}, fork ${buckets.fork}, archived ${buckets.archived}, unrelated ${buckets.unrelated})`);
  if (crossCheck && crossCheck.cliCount != null) {
    const verdict = crossCheck.missing.length ? `MISSING ${crossCheck.missing.join(', ')}` : 'no repo visible to the CLI is missing';
    L.push(`- cross-check against \`gh repo list\`: ${crossCheck.cliCount} repos, ${verdict}`);
  }
  L.push(`- source: live API only. No cached snapshot is read by this tool.`);
  L.push('');

  const totals = {
    commits: products.reduce((a, r) => a + r.commits, 0),
    merged: products.reduce((a, r) => a + r.mergedPRs.length, 0),
    newIssues: products.reduce((a, r) => a + r.newIssues.length, 0),
    failed: products.reduce((a, r) => a + r.failedRuns.length, 0),
    releases: products.reduce((a, r) => a + r.releases.length, 0),
  };
  L.push('## Overview');
  L.push('');
  L.push(`- commits in window: ${totals.commits} | merged PRs: ${totals.merged} | new issues: ${totals.newIssues} | failed runs: ${totals.failed} | new releases: ${totals.releases}`);
  L.push(`- open issues (product repos): ${products.reduce((a, r) => a + (r.openIssues || 0), 0)} | unassigned: ${products.reduce((a, r) => a + (r.unassigned || 0), 0)} | unlabeled: ${products.reduce((a, r) => a + (r.unlabeled || 0), 0)}`);
  L.push('');

  L.push('## Product repositories');
  L.push('');
  L.push('| repo | head | commits | merged PRs | open issues | unassigned | window failures |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of products) {
    const flag = r.error ? ' (ERROR)' : '';
    L.push(`| ${mdEscape(r.name)} | ${shortSha(r.headSha) || '-'} | ${r.commits} | ${r.mergedPRs.length} | ${r.openIssues == null ? '?' : r.openIssues} | ${r.unassigned == null ? '?' : r.unassigned} | ${r.failedRuns.length} |${flag}`);
  }
  L.push('');

  const merged = products.flatMap((r) => r.mergedPRs.map((p) => ({ repo: r.name, ...p })));
  if (merged.length) {
    L.push('## Merged in window');
    L.push('');
    for (const m of merged.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))) {
      L.push(`- ${m.mergedAt} ${m.repo}#${m.number} ${m.title}`);
    }
    L.push('');
  }

  if (totals.newIssues) {
    L.push('## New issues in window');
    L.push('');
    for (const r of products) for (const i of r.newIssues) L.push(`- ${r.name}#${i.number} ${i.title}`);
    L.push('');
  }

  if (totals.failed) {
    L.push('## Failed runs in window');
    L.push('');
    for (const r of products) {
      for (const f of r.failedRuns) L.push(`- ${r.name} ${f.createdAt} ${f.name} ${f.conclusion} @${shortSha(f.sha)}`);
    }
    L.push('');
    if (headRed.length) L.push(`**HEAD is red on:** ${headRed.map((r) => r.name).join(', ')}`);
    else L.push('HEAD is green on every product repo; failures were on intermediate commits.');
    L.push('');
  }

  L.push('## Archived (reported, not counted as healthy)');
  L.push('');
  const arch = repos.filter((r) => r.kind === 'archived');
  if (!arch.length) L.push('- none');
  for (const r of arch) L.push(`- ${r.name} (last push ${r.pushed_at})`);
  L.push('');

  L.push('## Forks');
  L.push('');
  const forks = repos.filter((r) => r.kind === 'fork');
  if (!forks.length) L.push('- none');
  for (const r of forks) L.push(`- ${r.name} (last push ${r.pushed_at})`);
  L.push('');

  const stale = products.filter((r) => !r.headRuns || !r.headRuns.length);
  if (stale.length) {
    L.push('## No CI evidence at HEAD');
    L.push('');
    for (const r of stale) L.push(`- ${r.name}: no workflow run found for ${shortSha(r.headSha)}`);
    L.push('');
  }

  if (bad.length) {
    L.push('## Errors');
    L.push('');
    for (const r of bad) L.push(`- ${r.name}: ${r.error}`);
    L.push('');
  }

  return L.join('\n');
}

// ---------------------------------------------------------------- self-test

function selfTest() {
  const results = [];
  const check = (name, cond) => results.push({ name, ok: !!cond });
  const s = Date.parse('2026-11-20T02:00:00Z');
  const e = Date.parse('2026-11-20T12:00:00Z');

  // Half-open boundaries. These three are the whole reason the tool exists.
  check('event exactly at start is inside', inWindow('2026-11-20T02:00:00Z', s, e) === true);
  check('event 1ms before end is inside', inWindow('2026-11-20T11:59:59.999Z', s, e) === true);
  check('event exactly at end is outside', inWindow('2026-11-20T12:00:00Z', s, e) === false);
  check('event 1ms after end is outside', inWindow('2026-11-20T12:00:00.001Z', s, e) === false);
  check('event before start is outside', inWindow('2026-11-20T01:59:59Z', s, e) === false);
  check('unparseable timestamp is outside', inWindow('not-a-date', s, e) === false);
  check('null timestamp is outside', inWindow(null, s, e) === false);

  // assignees must come from the plural field.
  check('issue with assignees is not counted unassigned',
    countUnassigned([{ assignees: [{ login: 'Lennonhaha' }], assignee: null }]) === 0);
  check('issue without assignees is counted', countUnassigned([{ assignees: [], assignee: null }]) === 1);
  check('legacy single-assignee field alone does not count as assigned',
    countUnassigned([{ assignee: { login: 'Lennonhaha' } }]) === 1);

  // classification
  check('archived product goes to archived bucket', classifyRepo({ name: 'fibemate-react-native', archived: true }) === 'archived');
  check('fork goes to fork bucket', classifyRepo({ name: 'awesome-cbom', fork: true }) === 'fork');
  check('product detected', classifyRepo({ name: 'fibemate-tauri' }) === 'product');
  check('unrelated private detected', classifyRepo({ name: 'Liu', private: true }) === 'unrelated');

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('SELF-TEST FAILED');
    process.exit(EXIT_FINDINGS);
  }
  console.log('SELF-TEST OK (negative controls included: boundary, stale assignee, archived)');
  process.exit(EXIT_OK);
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const a = { hours: 10, end: null, org: 'Lennonhaha', format: 'md', out: null, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--self-test') a.selfTest = true;
    else if (k === '--hours') a.hours = Number(argv[++i]);
    else if (k === '--end') a.end = argv[++i];
    else if (k === '--org') a.org = argv[++i];
    else if (k === '--format') a.format = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '-h' || k === '--help') {
      console.log('usage: gh-patrol.cjs [--hours 10] [--end ISO] [--org NAME] [--format md|json] [--out FILE] [--self-test]');
      process.exit(EXIT_OK);
    } else {
      console.error(`unknown argument: ${k}`);
      process.exit(EXIT_ERROR);
    }
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();

  const endMs = args.end ? Date.parse(args.end) : Date.now();
  if (Number.isNaN(endMs)) {
    console.error('bad --end');
    process.exit(EXIT_ERROR);
  }
  const startMs = endMs - args.hours * 3600 * 1000;
  const startISO = new Date(startMs).toISOString().replace('.000Z', 'Z');
  const endISO = new Date(endMs).toISOString().replace('.000Z', 'Z');
  const asOf = new Date().toISOString().replace('.000Z', 'Z');

  let listed;
  try {
    listed = listOrgRepos(args.org);
  } catch (e) {
    console.error(e.message);
    process.exit(EXIT_ERROR);
  }
  const repos = listed.repos;
  const crossCheck = crossCheckCount(args.org, repos);

  const buckets = { product: 0, fork: 0, archived: 0, unrelated: 0 };
  for (const r of repos) buckets[classifyRepo(r)]++;

  const detailed = repos.map((r) => {
    if (classifyRepo(r) !== 'product') return { name: r.name, kind: classifyRepo(r), pushed_at: r.pushed_at, commits: 0, mergedPRs: [], newIssues: [], openIssues: null, unassigned: null, unlabeled: null, failedRuns: [], releases: [], headSha: null, error: null };
    return repoWindow(r, startISO, endISO);
  });

  const state = { org: args.org, enumeration: listed.source, crossCheck, asOf, startISO, endISO, repos: detailed, buckets };

  if (args.format === 'json') {
    console.log(JSON.stringify(state, null, 2));
  } else {
    const md = renderMarkdown(state);
    console.log(md);
    if (args.out) require('fs').writeFileSync(args.out, md + '\n', 'utf8');
  }

  const products = detailed.filter((r) => r.kind === 'product');
  const problems = [];
  if (crossCheck.missing.length) problems.push('repos missing from enumeration');
  if (products.some((r) => r.error)) problems.push('api error');
  if (products.some((r) => (r.headRuns || []).some((x) => ['failure', 'cancelled', 'timed_out'].includes(x.conclusion)))) problems.push('head red');
  if (products.some((r) => r.unassigned > 0)) problems.push('unassigned issues');
  process.exit(problems.length ? EXIT_FINDINGS : EXIT_OK);
}

if (require.main === module) main();

module.exports = { inWindow, classifyRepo, countUnassigned, countUnlabeled, renderMarkdown };
