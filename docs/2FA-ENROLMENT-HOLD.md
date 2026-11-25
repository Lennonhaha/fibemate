# 2FA enrolment hold — resolved

Status: **resolved** by the commit that adds `test/2fa-device-id.test.js`.
`POST /api/auth/2fa/enable` and `POST /api/auth/2fa/confirm-enable` answer normally
again, and the Settings card offers "Enable 2FA" instead of "coming soon".

This file is kept as the record of the hold, because the same failure mode can come
back through any new token-issuing path that forgets the device claim.

## What was wrong

`POST /api/auth/2fa/verify-login` finished the login like this:

```js
const token = genToken({ id: user.id, username: user.username, deviceId: '' });
```

The device id was hard-coded empty because the ticket never carried it: `POST
/api/auth/login` performed device registration, then returned `{ twoFARequired,
ticket }` without a token, and the ticket was stored as `{ userId, expiresAt,
attempts }`.

Consequences for any account that enabled 2FA:

- every session token had `deviceId: ''`, so the account never appeared in `readBy`;
- `isRead` never flipped for messages it received, because `isRead` is set when all
  active devices of the recipient have acknowledged (`db.markMessageRead`);
- with more than one device, unread counters diverged and could not be reconciled.

v3.3.14 shipped with the button enabled, so a user who clicked it walked into that
state with no way to tell why read receipts stopped.

## What the fix does

1. The password step stores the validated `deviceId` on the ticket:
   `{ userId, deviceId, expiresAt, attempts }`.
2. `verify-login` re-checks ownership of that id (the row can change hands or
   disappear between the two steps), accepts an optional `deviceId` in the body with
   the same `E_DEVICE_ID` / `E_DEVICE_OWNED` rejections as the password step, and
   mints one only if neither step supplied a device — so a 2FA login can no longer
   produce a device-less token.
3. Both the access token and the refresh token carry the resolved id, and the
   response body returns it so a client can persist it.
4. `logSecurity('2fa_login', …)` records the device id for audit.

## Evidence

`test/2fa-device-id.test.js` boots a real server against a throwaway SQLite file and
proves, in one run:

| case | assertion |
|---|---|
| enrolment | `enable` 200 + secret, `confirm-enable` 200, `status` enabled |
| response + tokens | body `deviceId`, JWT payload `deviceId`, refresh payload `deviceId` all equal the registered id |
| ticket only | second factor called without a body `deviceId` still returns the ticket's id |
| foreign device | 400 `E_DEVICE_OWNED` |
| malformed id | 400 `E_DEVICE_ID` |
| end to end | a 2FA token acks a message; `readBy` on disk holds the real device id, `isRead` true, `readAt` set |

## Regression guard

Any new endpoint that signs a session token must resolve a non-empty `deviceId`.
The cheap check is a test that decodes the token and asserts the claim; the durable
check is the end-to-end ack above, because an empty claim only shows up when
`readBy` stays empty.
