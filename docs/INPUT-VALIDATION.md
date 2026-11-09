# Input validation

Every request handler validates its inputs before touching storage or crypto.
The checks are written by hand, per route: there is no schema library in the
dependency tree. This document lists, per area, what is accepted, what is
rejected, where the check lives, and which test asserts the rejection. It is
the evidence behind the `input_validation` criterion; the assurance case
(§8, gap G-5) remains the authoritative statement of residual risk.

Line numbers refer to `src/index.js` unless stated otherwise. A rejection test
means a test that sends the invalid value and asserts a 4xx response.

## Authentication

| Endpoint | Accepted (allowlist) | Rejected | Code | Test |
|:---|:---|:---|:---|:---|
| `POST /api/auth/register` | `username`, `password`, `publicKey` present; `publicKey` a hex string of the expected length; username unique; registration cap not reached | missing field → 400, duplicate → 409, cap → 403, bad key length → 400 | L1005–1030 | `test/http-integration.test.js` registration block |
| `POST /api/auth/login` | `username` and `password` strings; account not locked | missing → 400, wrong credentials → 401, lockout → 429 | L1087–1105 | login + lockout blocks |
| `GET /api/auth/verify` | `Authorization: Bearer <jwt>` | malformed or expired token → 401 | L459–464 | L127, L178 of the HTTP suite |
| `POST /api/auth/refresh` | `refreshToken` with `type === 'refresh'` | missing → 400, wrong type → 401 | L466–475 | refresh block |
| `POST /api/auth/update-keys` | authenticated; key fields of the expected shape | unauthenticated → 401 | L1165 | 401 sweep |

## Second factor

| Endpoint | Accepted | Rejected | Code | Test |
|:---|:---|:---|:---|:---|
| `POST /api/auth/2fa/enable` | authenticated, 2FA not already on | already enabled → 409 | L1231–1240 | 2FA block |
| `POST /api/auth/2fa/confirm-enable` | 6-digit `code` matching the pending secret | missing code → 400, no pending secret → 400, already on → 409 | L1246–1260 | 2FA block |
| `POST /api/auth/2fa/disable` | valid `code` or `recoveryCode` | 2FA off → 400, wrong code → 401 | L1267–1285 | 2FA block |
| `POST /api/auth/2fa/verify-login` | `ticket` plus `code` or `recoveryCode`; ticket younger than 60 s | missing parts → 400, expired ticket → 401, wrong code → 401 | L1291–1310 | 2FA block |

## Users, contacts, conversations

| Endpoint | Accepted | Rejected | Code | Test |
|:---|:---|:---|:---|:---|
| `GET /api/users/search` | `q` at least 2 characters | shorter → 400 | L1354–1360 | search block |
| `GET /api/users/:userId` | existing id | unknown → 404 through `timingSafe404` | L1375 | lookup block |
| `POST /api/conversations/find-or-create` | `userId` of another existing user | missing → 400, self → 400, unknown → 404 | L988–1000 | conversation block |
| `GET /api/contacts`, `POST /api/contacts` | `userId` of another existing user | missing or self → 400, duplicate → 409 | L1436–1455 | contacts block |
| `PUT /api/contacts/:userId` | `status` in `accepted` / `rejected` | anything else → 400, unknown contact → 404 | L1460–1470 | contacts block |
| `GET /api/conversations/:id/messages` | caller is a participant | outsider → 403 | L1495–1500 | 403 block |
| `POST /api/messages` | caller is a participant; payload fields present | outsider → 403 | L1531–1545 | message block |

## Media, privacy, account

| Endpoint | Accepted | Rejected | Code | Test |
|:---|:---|:---|:---|:---|
| `POST /api/upload/voice` | base64 audio matching the accepted MIME allowlist | missing → 400, wrong format → 400 | L1509–1525 | voice upload block |
| `GET /voice/:fileId` | resolved path stays inside the voice directory | `..` traversal → 403 | L495–500 | traversal block |
| `PUT /api/privacy` | known privacy flags | unauthenticated → 401 | L1590–1605 | privacy block |
| `DELETE /api/account` | valid password | wrong password → 401 | L1634–1645 | delete block |

## Post-quantum key material

| Endpoint | Accepted | Rejected | Code | Test |
|:---|:---|:---|:---|:---|
| `POST /api/mlkem/keygen` | authenticated | unauthenticated → 401 | L1743 | 401 sweep |
| `POST /api/mlkem/encaps` | `publicKey` present | missing → 400 | L1752–1760 | ML-KEM block |
| `POST /api/mlkem/decaps` | `ciphertext` and `secretKey` present | missing either → 400 | L1764–1775 | ML-KEM block |
| `POST /api/mlkem/register` | `pk` exactly 2368 hex characters | any other length → 400 | L1778–1786 | ML-KEM block |
| `POST /api/keys/opk/upload`, `/consume` | `peerUserId` present, key material of the expected shape | missing → 400, empty pool → 409 | L1648–1690 | OPK block |

## Service-to-service and SMS

| Endpoint | Accepted | Rejected | Code | Test |
|:---|:---|:---|:---|:---|
| `POST /a2a/handshake` | base64 public keys of the expected size | malformed body → 4xx | a2a module | HTTP suite, a2a block |
| `GET /a2a/peers`, `POST /a2a/message` | known session id | unknown session → 404 | a2a module | HTTP suite, a2a block |
| `POST /api/sms/send` | E.164-shaped number | malformed number → 400 | sms routes | SMS block |
| `POST /api/sms/verify`, `/bind-phone` | 6-digit code tied to the pending number | wrong shape → 400, wrong code → 400 | sms routes | SMS block |

## Transport and framing

| Surface | Accepted | Rejected | Code | Test |
|:---|:---|:---|:---|:---|
| WebSocket padding | frames with a valid 2-byte or 5-byte header | malformed frame → `malformed: true`, never a throw | `src/crypto/ws-padding.js` | `test/ws-padding.test.js`, `test/server-lib-boundaries.test.js` |
| JSON bodies | bodies under the Express parser limit | oversized body → 413 | `express.json` configuration | covered by the parser, not by a dedicated test |

## Known gaps

1. **No single schema layer.** Checks are per handler. A new route can be added
   without a validation block and no global test fails. Mitigation: the review
   checklist and `CONTRIBUTING.md` require a rejection test for every new
   endpoint; the coverage floor makes an untested handler visible.
2. **Shape, not semantics, in places.** A value can be the right type and
   length and still be meaningless (for example a well-formed public key that
   is not on the curve). The crypto layers reject those, not the HTTP layer.
3. **No upload size cap of its own.** The voice endpoint relies on the body
   parser limit and the base64 decode.

Any new route is expected to land with: an allowlist of what it accepts, an
explicit rejection path, and a test that sends the invalid value.
