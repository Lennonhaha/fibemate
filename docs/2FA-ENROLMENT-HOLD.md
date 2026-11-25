# 2FA enrolment is on hold

Status: **closed**. `POST /api/auth/2fa/enable` and `POST /api/auth/2fa/confirm-enable`
answer `403` with code `E_2FA_DEVICE_IDENTITY_PENDING`, and the Settings card renders
the button disabled as "Enable 2FA (coming soon)".

## Why

`POST /api/auth/2fa/verify-login` finishes the login like this:

```js
const token = genToken({ id: user.id, username: user.username, deviceId: '' });
```

The device id is hard-coded empty because the 2FA ticket never carries it: `POST
/api/auth/login` performs the device registration, then returns `{ twoFARequired,
ticket }` without a token, and the ticket is stored as `{ userId, expiresAt, attempts }`.

Consequences for any account that enables 2FA:

- every session token has `deviceId: ''`, so the account never appears in `readBy`;
- `isRead` never flips for messages it receives, because `isRead` is set when all
  active devices of the recipient have acknowledged (`db.markMessageRead`);
- with more than one device, unread counters diverge and cannot be reconciled.

v3.3.14 was published with the button enabled, so a stranger who clicks it walks
into that state without any way to tell why their read receipts stopped.

## What still works

- `GET /api/auth/2fa/status` — unchanged, so the UI can render the current state.
- `POST /api/auth/2fa/disable` — unchanged, so anyone already in the broken state can
  turn 2FA off again.
- Accounts that already have 2FA enabled keep logging in; this hold only refuses new
  enrolment.

## Exit criteria

1. `twoFATickets` stores the `deviceId` registered during the password step.
2. `verify-login` returns that id in the token and in the response body.
3. A test proves, end to end, that a 2FA account can acknowledge a message: send,
   open the conversation, and observe `readBy` containing the device id with
   `isRead` flipping to 1.
4. `TWO_FA_ENROLMENT_BLOCKED` is set to `false` in the same commit that adds that test,
   and the UI flag `ENROLMENT_AVAILABLE` is set back to `true`.

Until all four hold, the button stays disabled and the endpoint stays 403.
