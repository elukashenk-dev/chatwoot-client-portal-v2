# Passwordless Registration Completion Design

Date: 2026-06-26
Status: ready for implementation planning, pending user approval
Scope: auth registration completion, customer rolling idle sessions, optional password setup, session handoff

## Goal

After a known user confirms their email by code during registration, the portal must let them skip password creation, immediately enter the chat app, and set a password later when convenient.

Customer portal sessions must also move from a fixed lifetime to a 30-day rolling idle timeout, so an active customer who opens the portal online at least once every 30 days keeps the normal customer session alive without a forced absolute timeout.

This is not anonymous signup. Eligibility remains the existing tenant-scoped Chatwoot contact check plus email-code verification. The portal backend remains the only authority for auth, session, profile, chat send, and realtime.

## Hard Decisions

1. No legacy or backward compatibility layer.
   - Portal-owned contracts and storage may change in place.
   - If local or production test data must be recreated, that is acceptable.
   - Do not add sentinel hashes, fake passwords, dual readers, or old UI fallbacks.

2. A portal user may exist without a password.
   - `portal_users.password_hash` becomes nullable.
   - `password_hash IS NULL` is the single source of truth for `passwordConfigured = false`.
   - No separate `registration_skipped_password` flag is needed.

3. Email-code registration completion should issue a normal session.
   - Both paths, "set password now" and "continue without password", consume the same short-lived continuation proof.
   - Both paths create the portal user, link the Chatwoot contact, link legal acceptance, create a portal session, set the existing signed httpOnly session cookie, and return the normal authenticated session payload.
   - The old "set password, then go to login" registration finish is removed.

4. Password login stays password-only.
   - Users with `password_hash IS NULL` cannot sign in with the password form.
   - Login returns the same generic invalid credentials error. It must not reveal whether the account exists or simply has no password.
   - A logged-out passwordless user can use the existing email-code password reset flow to set a first password.

5. Password can be set later from an authenticated session, but not by session alone.
   - Adding the first password is credential binding and must require a fresh email-code challenge for the current user.
   - The browser must not submit email or user id for this action; the backend derives both from the current session.
   - The successful set-password action rotates the portal session: delete existing sessions for the user, create a fresh one, set the normal signed httpOnly session cookie, and return the authenticated session payload.
   - If a password already exists, reject this first-password flow with a clear typed conflict and keep password change as a separate future slice or use the existing password reset flow.

6. Customer sessions use a 30-day rolling idle timeout.
   - `SESSION_TTL_DAYS` becomes `30` for customer portal sessions.
   - Login creates `portal_sessions.expires_at = now + 30 days`.
   - A successful online `/api/auth/me` check extends the same customer session to `now + 30 days`, updates `last_seen_at`, returns the refreshed `session.expiresAt`, and refreshes the same signed httpOnly `portal_session` cookie with a fresh `Max-Age`.
   - Do not add a renewal threshold in this slice. A threshold would reduce writes, but it would also weaken the exact idle-timeout promise because an early online check could fail to move the expiry forward.
   - Expired, revoked, missing-cookie, manually logged-out, or invalid sessions are not extended and must require login.
   - There is no forced absolute timeout for ordinary customer chat sessions.
   - Sensitive actions remain separate fresh re-auth flows and must not depend on the age of the ordinary customer session.
   - Tenant-admin sessions and `portal_admin_session` are not part of this change.

## External Guidance Applied

- OWASP Authentication Cheat Sheet: sensitive account changes such as password updates require reauthentication, and session identifiers should be rotated after authentication/risk changes.
- OWASP Session Management Cheat Sheet: create high-entropy server-side sessions, keep session ids meaningless, protect them through cookies, and renew sessions after authentication or password changes.
- OWASP Forgot Password Cheat Sheet: recovery codes/tokens should be random, stored securely, short-lived, single-use, and responses should avoid account enumeration.
- NIST SP 800-63B guidance used as a control model: OTP-style proofs need replay resistance, and stronger future passwordless login should use phishing-resistant verifier-bound authenticators such as WebAuthn/passkeys.
- Current portal password policy remains 8 characters plus letter and digit for this slice. Aligning password policy itself to NIST guidance is a separate auth-hardening decision unless the user explicitly expands this scope.

Sources:

- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- https://pages.nist.gov/800-63-4/sp800-63b.html

## Current System Facts

Backend facts from the current codebase:

- Registration code verification already creates a one-time continuation token in `verification_records` with a short TTL.
- `registrationService.setPassword` currently consumes that continuation token, creates a `portal_users` row with a non-null password hash, creates `portal_user_contact_links`, links latest legal acceptance, consumes verification, and returns `nextStep: "login"`.
- `authService.login` verifies email/password and then creates a session row and returns a session token for the route to set as a signed httpOnly cookie.
- Customer session TTL is currently fixed from login time. `resolveCurrentSession` touches `last_seen_at`, but does not extend `portal_sessions.expires_at`.
- `/api/auth/me` currently returns the authenticated user and session metadata from the cookie-backed session, but does not refresh the cookie.
- Password reset already uses email-code verification and can be reused for logged-out users who skipped password setup.

Frontend facts from the current codebase:

- The registration flow stores email and continuation token in session storage.
- `RegisterSetPasswordForm` is the current required final registration step.
- `AuthSessionProvider.signIn` can hydrate auth state after normal login, but there is no generic method to accept an already-authenticated backend session returned by registration.
- `AuthSessionProvider` already saves `session.expiresAt` from successful online session checks into the offline auth snapshot.
- Offline/PWA startup cache already refuses cached auth snapshots after their stored `sessionExpiresAt`.
- The profile page currently has no password/security section.

## User Flow

### Registration With Skip

1. User enters email.
2. Backend confirms the email is eligible for the current tenant through Chatwoot contact lookup.
3. User enters email code.
4. Backend returns a short-lived continuation token and `nextStep: "set_password"` for the completion screen.
5. Completion screen shows two clear actions:
   - `Continue to chats` - skip password now.
   - `Create password and continue` - optional immediate password setup.
6. If user skips:
   - Frontend calls `POST /api/auth/register/skip-password` with email and continuation token.
   - Backend creates user with `password_hash = NULL`, links contact/legal acceptance, consumes continuation, creates session, sets session cookie.
   - Frontend clears registration flow storage, hydrates auth state, and navigates to the chat app.

### Registration With Password Now

Same first four steps. On password submit:

- Frontend calls the existing `POST /api/auth/register/set-password` contract updated to complete registration and issue a session.
- Backend creates user with a password hash, links contact/legal acceptance, consumes continuation, creates session, sets cookie.
- Frontend clears registration flow storage, hydrates auth state, and navigates to the chat app.

### Set Password Later While Logged In

1. User opens profile/security.
2. If `passwordConfigured = false`, UI shows a first-password setup action.
3. Frontend calls protected `POST /api/auth/password-setup/request`.
4. Backend verifies the current portal session and sends a code to the current user's email.
5. User enters the email code.
6. Frontend calls protected `POST /api/auth/password-setup/verify`.
7. Backend validates the code and returns a short-lived continuation token scoped to the current tenant/user.
8. User enters the new password.
9. Frontend calls protected `POST /api/auth/password-setup/set` with continuation token and password.
10. Backend validates password strength, confirms the user still has no password, stores the hash, consumes continuation, deletes old sessions for that user, creates a fresh session, sets the signed session cookie, and returns the authenticated session payload.
11. UI updates to `passwordConfigured = true`.

### Set Password Later After Logout

1. User opens login.
2. Password form cannot authenticate a user with no password.
3. User uses existing password reset flow.
4. Email-code verification proves control of the known email.
5. Reset set-password stores the first password.
6. User logs in with the new password.

## API Contract

### Existing: `POST /api/auth/register/verify`

No behavior change. It remains the only way to obtain the short-lived registration continuation token.

Response remains:

```json
{
  "email": "user@example.com",
  "continuationToken": "...",
  "continuationExpiresInSeconds": 900,
  "nextStep": "set_password"
}
```

### Updated: `POST /api/auth/register/set-password`

Request remains:

```json
{
  "email": "user@example.com",
  "continuationToken": "...",
  "newPassword": "..."
}
```

New response sets the signed session cookie and returns an authenticated session payload:

```json
{
  "result": "registration_completed",
  "nextStep": "chat",
  "session": {
    "expiresAt": "2026-07-26T00:00:00.000Z"
  },
  "user": {
    "id": "...",
    "email": "user@example.com",
    "fullName": "User Name",
    "passwordConfigured": true
  }
}
```

### New: `POST /api/auth/register/skip-password`

Public auth endpoint. It must use the same origin guard and rate-limit family as registration completion.

Request:

```json
{
  "email": "user@example.com",
  "continuationToken": "..."
}
```

Response sets the signed session cookie and returns:

```json
{
  "result": "registration_completed",
  "nextStep": "chat",
  "session": {
    "expiresAt": "2026-07-26T00:00:00.000Z"
  },
  "user": {
    "id": "...",
    "email": "user@example.com",
    "fullName": "User Name",
    "passwordConfigured": false
  }
}
```

### Updated: `POST /api/auth/login`

No request shape change.

Behavior change:

- If the tenant-scoped user exists but `password_hash IS NULL`, return the existing generic invalid credentials error.
- Do not expose a separate `PASSWORD_NOT_SET` error from this public endpoint.

Authenticated response should include `passwordConfigured` in `user`.

### Updated: `GET /api/auth/me`

Successful response behavior:

- validate the signed `portal_session` cookie;
- resolve only a non-expired, non-revoked, current-tenant customer session;
- update `portal_sessions.last_seen_at` to the current backend time;
- update `portal_sessions.expires_at` to `now + SESSION_TTL_DAYS`, with `SESSION_TTL_DAYS = 30`;
- set the same `portal_session` cookie value again using the existing httpOnly, signed, SameSite, secure and path rules with a fresh `Max-Age`;
- return the refreshed `session.expiresAt`;
- add `passwordConfigured` to `user`.

Expired, revoked, invalid and missing-cookie sessions still return `401` and clear the cookie. They must not be extended.

### New: `POST /api/auth/password-setup/request`

Protected endpoint. Requires the current portal session cookie. No request body
is needed.

Response:

```json
{
  "email": "user@example.com",
  "expiresInSeconds": 900,
  "nextStep": "verify_code",
  "purpose": "password_setup",
  "resendAvailableInSeconds": 60,
  "result": "password_setup_requested"
}
```

### New: `POST /api/auth/password-setup/verify`

Protected endpoint. Requires the current portal session cookie.

Request:

```json
{
  "code": "123456"
}
```

Response:

```json
{
  "continuationToken": "...",
  "continuationExpiresInSeconds": 900,
  "email": "user@example.com",
  "nextStep": "set_password",
  "purpose": "password_setup",
  "result": "password_setup_verified"
}
```

### New: `POST /api/auth/password-setup/set`

Protected endpoint. Requires the current portal session cookie and a verified
password-setup continuation for the same tenant/user.

Request:

```json
{
  "continuationToken": "...",
  "newPassword": "..."
}
```

Success response sets a fresh signed session cookie and returns:

```json
{
  "result": "password_set",
  "nextStep": "chat",
  "session": {
    "expiresAt": "2026-07-26T00:00:00.000Z"
  },
  "user": {
    "id": "...",
    "email": "user@example.com",
    "fullName": "User Name",
    "passwordConfigured": true
  }
}
```

Errors:

- `401 UNAUTHENTICATED` if no valid session.
- `409 PASSWORD_ALREADY_SET` if `password_hash IS NOT NULL`.
- `409 PASSWORD_SETUP_VERIFICATION_REQUIRED` if the code proof is missing or expired.
- `409 PASSWORD_SETUP_CONTINUATION_INVALID` if the continuation token does not match.
- Validation errors use the existing password validation shape.

### Existing Password Reset Endpoints

Keep the current unauthenticated email-code reset flow. After nullable password is introduced, reset set-password must support both cases:

- existing password hash -> replace hash;
- null password hash -> set first hash.

## Data Model

Change:

```ts
passwordHash: text('password_hash')
```

instead of non-null.

Migration:

```sql
ALTER TABLE portal_users ALTER COLUMN password_hash DROP NOT NULL;
```

No portal legacy migration is required. Existing users keep their hashes. New skipped users store null. If a clean reinstall is preferred during deployment, the same schema shape is the target baseline.

The 30-day rolling idle timeout does not require a schema migration because `portal_sessions` already has `expires_at` and `last_seen_at`. It does require changing the customer `SESSION_TTL_DAYS` default and runtime config from `14` to `30`.

## Backend Architecture

### Customer Rolling Idle Session

Customer session resolution must become the single rolling-idle refresh boundary.

After `findUserBySessionTokenHash` confirms `portal_sessions.expires_at > now`, the auth service calculates:

```ts
const refreshedExpiresAt = new Date(
  resolvedAt.getTime() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
)
```

Then it updates the current customer session row with:

- `last_seen_at = resolvedAt`;
- `expires_at = refreshedExpiresAt`.

The service returns `refreshedExpiresAt`, not the stale DB value read before the refresh. `/api/auth/me` must then re-set the same `portal_session` cookie with the existing cookie options so the browser cookie lifetime tracks the refreshed backend session lifetime.

Do not add a renewal threshold such as "refresh only when fewer than N days remain" in this implementation. That optimization changes behavior: if a user opens the app soon after login and then returns just under 30 days after that activity, the session could expire earlier than the user's last online activity plus 30 days. The exact product contract is worth the extra write because `/api/auth/me` is an online session check, not a high-frequency heartbeat.

Do not add browser auth tokens, localStorage tokens or a separate browser-side renewal marker. The backend session row and signed httpOnly cookie remain the only customer auth authority.

Do not change tenant-admin auth. `portal_admin_sessions`, `/api/admin/auth/me` and `portal_admin_session` keep their current semantics.

### Session Issuance

Do not duplicate session creation logic inside registration.

Preferred implementation:

- Extract or expose a backend-only auth service method such as `issueSessionForUser({ tenantId, userId, requestIp, userAgent })`.
- Reuse the same token generation, hash storage, TTL, and session response mapping used by password login.
- Routes that receive this session token continue to set cookies through `getSessionCookieOptions(env)`.

### Registration Completion

Refactor registration completion into one shared internal function:

```ts
completeRegistration({
  tenantId,
  email,
  continuationToken,
  passwordHash: string | null,
  sessionContext,
})
```

The function must:

1. normalize email under the current tenant;
2. lock and validate the latest verified registration record;
3. verify continuation token hash and TTL;
4. reject if portal user already exists;
5. create portal user with nullable password hash;
6. create contact link;
7. link latest legal acceptance;
8. consume verified record;
9. issue session;
10. return authenticated session payload with `passwordConfigured`.

User creation, contact/legal linking, verification consumption and session row
creation must share one defensible atomic boundary. A failure must not leave a
new passwordless user unable to receive the completion session or recover
through the tested password-reset path.

### Password-Setup Flow

Create a protected password-setup flow, not a direct session-only password
setter. It should use `verification_records` with purpose `password_setup`,
`portal_user_id`, email from the current user row, 6-digit code, max attempts,
resend cooldown, verified continuation token and consume/expire semantics
matching registration/password reset.

The setup endpoints must update only the current tenant/user row and must not
accept email or user id from the browser.

Use the same password validation and hashing helper as registration/password
reset. On successful password setup, rotate the portal session by deleting
existing sessions for the user and issuing a fresh session for the current
response. The password update, setup-record consumption, old-session deletion
and fresh-session insertion should be completed under one transaction boundary
where the repository allows it.

### Rate Limits

Add `POST /api/auth/register/skip-password` to the same rate-limit group as
registration set-password. Add rate limits for password-setup request/verify/set
to prevent code brute force, repeated email sends and repeated expensive hash
work.

### Tenant Isolation

Every query must remain scoped by `tenantId`. Continuation records, user lookup, password updates, legal acceptance linking, and contact links must never be resolved by email alone.

## Frontend Architecture

### Auth Session Provider

Add a generic method for backend-authenticated responses, for example:

```ts
completeAuthenticatedSession(session: AuthenticatedPortalSession): void
```

It should:

- store user/session in auth state;
- save the online auth snapshot with the returned session expiration, including the refreshed expiration from `/api/auth/me`;
- mark auth status as authenticated;
- avoid re-posting credentials.

### Offline Auth Snapshot

Offline/PWA cache must continue to treat backend `sessionExpiresAt` as the source of truth. After any successful online `/api/auth/me`, login, registration completion or password-setup completion, the frontend saves the returned `session.expiresAt`. If the user is offline after that, cached auth remains usable only until that stored timestamp.

If cookies are cleared, the next online `/api/auth/me` returns `401` and login is required. If only offline storage is cleared but the signed httpOnly cookie remains valid, the next online `/api/auth/me` may restore the authenticated runtime and save a fresh offline snapshot.

### Registration Completion UI

Replace required-password completion behavior with an optional completion step.

Required UI behavior:

- Continue without password calls `skipRegistrationPassword`.
- Create password and continue calls the updated `completeRegistrationSetPassword`.
- Both success paths clear registration session storage and navigate to the chat app.
- Expired/invalid continuation clears stored verification and returns the user to registration verification.
- Copy must be explicit that password can be set later from profile or through email-code recovery after logout.

### Profile/Security UI

Expose password status from auth state or profile fetch.

Minimum production-ready UI:

- If `passwordConfigured = false`, show a first-password setup flow in profile/security: request code, verify code, set password.
- On success, accept the rotated authenticated session, update auth user state to `passwordConfigured = true`, and show saved state.
- If `passwordConfigured = true`, show a non-editing status and direct password changes to existing reset flow or a future explicit change-password slice.

## Security Review Points

- The skip endpoint must not reduce proof strength. It must require the same verified email continuation token as password creation.
- The continuation token remains one-time and short-lived.
- Session creation remains backend-only and cookie-backed.
- Customer `/api/auth/me` extends only valid, non-expired customer sessions and refreshes the existing cookie. It must not revive expired or revoked sessions.
- No absolute timeout is added for ordinary customer chat sessions.
- Tenant-admin session behavior is not changed.
- Login does not reveal passwordless account state.
- Browser does not receive Chatwoot authority.
- Public skip endpoint is rate-limited and origin-guarded.
- Password setup later requires current session identity plus fresh email-code reauthentication, never browser-submitted email/user id.
- Password setup later rotates session after the new credential is bound.
- Password reset remains email-code based and works for passwordless users after logout.
- No legacy fallbacks are added.

## Production Acceptance Criteria

1. A known tenant contact can register, confirm email code, skip password, and land in chats as an authenticated user.
2. The created user has `password_hash = NULL` and a valid tenant-scoped contact link.
3. The same continuation token cannot be reused to create another account or set a password.
4. Password login for that user fails generically until a password is set.
5. Logged-in first-password setup requires email code, stores a hash, rotates session, and updates UI state.
6. After logout, login with the newly set password works.
7. Password reset can set a password for a passwordless user who logged out before setting one.
8. Existing password users can still log in normally.
9. All changed auth/session contracts are covered by backend and frontend tests.
10. Playwright covers registration skip to chat and later password setup to password login.
11. Customer login creates a 30-day session, successful `/api/auth/me` extends it another 30 days from the check time, refreshes the same cookie, and updates the offline auth snapshot with the refreshed `sessionExpiresAt`.
12. Expired, revoked, logged-out, missing-cookie and invalid customer sessions require login and are not extended.
13. Tenant-admin session behavior remains unchanged.
