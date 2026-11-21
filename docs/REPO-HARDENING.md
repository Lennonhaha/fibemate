# Repository hardening — what is on, what is off, and why

Last reviewed: 2026-11-21. Everything below was applied through the API and then read back;
nothing here is "configured in the UI and assumed".

## 1. What is enforced on `main` right now

Two mechanisms are active at the same time — a legacy branch protection rule *and* a
repository ruleset (#24591608). GitHub applies both, most restrictive wins, so this table
lists the union.

| setting | value | where |
|---|---|---|
| pull request required | yes | ruleset |
| required approvals | **0** | ruleset + protection |
| dismiss stale reviews on push | **yes** | both |
| require review thread resolution | yes | both |
| require up-to-date branch before merge | yes (strict) | both |
| required status checks | **10**: lint, bom-check, bench, sbom, docs-check, dco, interop, ten checks, KAT-Regression, codeql-gate | ruleset |
| allowed merge methods | **squash only** | ruleset |
| linear history required | **yes** | protection |
| force push | blocked | both |
| branch deletion | blocked | both |
| enforced for admins | yes | protection |
| signed commits | **no** | — |
| code owner review | **no** | — |
| approval after last push | **no** | — |

## 2. What is deliberately off, and the exact cost of turning it on

This is a single-maintainer repository. GitHub does not let an author approve their own
PR, so the three settings below convert "merge when green" into "cannot merge at all":

| setting | what it would take | what breaks first |
|---|---|---|
| required approvals >= 1 | a second account with write access | every PR, immediately |
| require code owner review | `CODEOWNERS` + a second reviewer | every PR touching owned paths |
| require approval after last push | a second reviewer per push | every rebase |
| required signed commits | a signing key in every workflow and on the laptop | dependabot branches and `gh api` merges |

A high branch-protection score bought by settings that make merging impossible is not
hardening, it is a locked door with the key inside. The honest position: **the score
stops short of 10/10 on purpose, and the gap is "there is no second reviewer yet"** — not
"we forgot".

## 3. Turning the rest on, once there is a second reviewer

```bash
# 1. add the reviewer, then require one approval
gh api -X PUT repos/Lennonhaha/fibemate/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {"strict": true,
    "contexts": ["lint","bom-check","bench","sbom","docs-check"]},
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

# 2. mirror it in the ruleset (rulesets are separate from the legacy rule)
gh api repos/Lennonhaha/fibemate/rulesets/24591608 > /tmp/rs.json
# edit .rules[type=pull_request].parameters:
#   required_approving_review_count = 1, require_code_owner_review = true,
#   require_last_push_approval = true
gh api -X PUT repos/Lennonhaha/fibemate/rulesets/24591608 --input /tmp/rs.json
```

## 4. Verify what is actually on (do not trust this file)

```bash
gh api repos/Lennonhaha/fibemate/branches/main/protection | jq '{
  linear: .required_linear_history.enabled,
  dismiss: .required_pull_request_reviews.dismiss_stale_reviews,
  approvals: .required_pull_request_reviews.required_approving_review_count,
  admins: .enforce_admins.enabled }'

gh api repos/Lennonhaha/fibemate/rulesets/24591608 | jq '.rules[] | {type, parameters}'
```

## 5. Operational note that cost a failed merge

Once `allowed_merge_methods` is `["squash"]`, the merge API **defaults to `merge`** and
fails with:

```
HTTP 405 — Merge commits are not allowed on this repository.
```

The method has to be explicit:

```bash
gh api -X PUT repos/Lennonhaha/fibemate/pulls/<n>/merge \
  -f merge_method=squash -f commit_title='...'
```

This is the same class of mistake as the ones in `AUDIT.md`: the change was real, the
verification was missing, and the failure only showed up on the next attempt to use it.
