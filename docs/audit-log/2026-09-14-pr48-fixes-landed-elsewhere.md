# PR #48 — Fixes Landed via Other Path

| Field         | Value                                                      |
|---------------|------------------------------------------------------------|
| Date          | 2026-09-14                                                 |
| Status        | Closed-without-merge; equivalent fixes verified in `main` |
| Related PR    | #48 (`fix/security-zk-auth-and-invite-code`)               |
| PR closed at  | 2026-09-11                                                 |
| Verified on   | `origin/main` @ `64092fb9` (post-PR #67 merge)             |
| Verifier      | Manual grep by maintainer, second-pass verification          |

## Summary

PR #48 proposed two security fixes:

1. **Anonymous auth fail-closed** — both `/api/auth/register-anonymous`
   and `/api/auth/login-anonymous` should reject with HTTP 501 unless
   `proofOfKnowledge` is cryptographically verified.
2. **Reserved-ID invite fail-closed** — `ADMIN_INVITE_CODE` must default
   to `null` (never a literal placeholder) and reserved-ID registration
   must be rejected when the env var is unset.

Both proposed forms are present in `origin/main` as of 2026-09-14. No
new code change is needed.

## Verification (`grep` against `origin/main`, 2026-09-14)

### Anonymous auth (backend/src/index.js)

- L688: `app.post('/api/auth/register-anonymous', authRateLimitMiddleware, async (req, res) => {`
  - L689: `// SECURITY: proofOfKnowledge 尚未做密码学验证，匿名注册暂时禁用（fail-closed）。`
  - L691: `return res.status(501).json({ error: '匿名注册暂不可用（ZK 证明校验未实现）' });`
- L695: `app.post('/api/auth/login-anonymous', authRateLimitMiddleware, async (req, res) => {`
  - L696: `// SECURITY: 原实现仅按 zkCommitment 匹配用户、未对 proofOfKnowledge 做任何密码学验证，`
  - L698: `return res.status(501).json({ error: '匿名登录暂不可用（ZK 证明校验未实现）' });`

Routes exist; the request body immediately returns 501 before any
commitment lookup. The previously described vulnerability ("anyone knowing
a target's commitment could log in as them") is not reachable: the
unverified lookup is preceded by the `return` statement.

### Reserved-ID invite (backend/src/index.js)

- L550: `const ADMIN_INVITE_CODE = process.env.ADMIN_INVITE_CODE || null;  // 无 env 时禁止保留ID注册（fail-closed）`
- L568: `if (!ADMIN_INVITE_CODE) {`
  - L569: `  return res.status(403).json({ error: '保留 ID 注册需要有效邀请码' });`
  - L571: `const inviteCode = req.body.inviteCode;`
  - L572: `if (inviteCode !== ADMIN_INVITE_CODE) {`

`CHANGE_ME_STRONG` (the placeholder default PR #48 wanted to remove) is
absent from `origin/main` — verified via `git grep CHANGE_ME origin/main`
returning no results.

## Why this matters (process note)

PR #48's head commit (`6ac1105`) was never merged:
`git merge-base --is-ancestor 6ac1105 origin/main` returns `NO`.

The fail-closed shapes above were merged via other commits whose SHAs are
not recorded in this note. A future audit could run
`git log -p -- backend/src/index.js` and isolate the exact commits that
introduced the `null` default and the 501 short-circuit returns.

## Also in PR #48 (de02e17, `mojibake regex fix`)

`scripts/health-check.js:79` on `origin/main`:

```
const hasGarbage = /锟斤拷|\uFFFD{2,}|\\u[0-9a-f]{4}/.test(r.body);
```

This form is broader than what `de02e17` proposed (which only normalized
to `\uFFFD{2,}`). The classic GBK `锟斤拷` marker is also detected. The
PR #48 fix is therefore superseded and no separate action is needed.

## Open follow-up (separate, low priority)

`src/index.js` (repo root, separate file from `backend/src/index.js`)
contains a parallel admin route at L943-971 that uses `console.error`
instead of an HTTP 403 when `ADMIN_INVITE_CODE` is unset. Semantically
equivalent for safety (env unset → `undefined` → `null` → no invite can
match), but the expression differs from `backend/src/index.js`. Tracked
as a code-consistency item, not a security gap.

## Limitation

- This note verifies the fail-closed forms are **present** in `origin/main`
  at `64092fb9`; it does **not** identify which commit(s) introduced them.
- PR #48's head commit `6ac1105` was never merged (`git merge-base
  --is-ancestor 6ac1105 origin/main` returns `NO`). The introduction commits
  for the fail-closed shapes remain TBD (future `git log -p -- backend/src/index.js` sweep).
