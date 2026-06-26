# Passwordless Registration Completion Implementation Plan

Date: 2026-06-26
Status: ready for implementation after user approval
Design source: `docs/superpowers/specs/2026-06-26-passwordless-registration-design.md`
Target branch: `feature/passwordless-registration-completion`

## Overview

Implement optional password creation after email-code registration verification.

The target behavior is:

- email verification remains mandatory;
- password creation becomes optional at registration completion;
- skipping password creates the user, links contact/legal acceptance, creates a normal session, and enters chats;
- setting password during registration also creates a normal session and enters chats;
- users who skipped password can set the first password later while logged in or through the existing email-code password reset flow after logout;
- logged-in first-password setup requires a fresh email-code challenge and rotates the session after the password is stored;
- no legacy or backward compatibility layer is introduced;
- existing password policy is reused. Changing min length or composition rules is a separate auth-hardening scope unless explicitly added.

## Pre-Implementation Gate

- Start from current `main` and create `feature/passwordless-registration-completion`.
- Confirm `git status --short --branch` is clean before code work.
- Read open auth-related findings in `docs/findings/`. Current known finding `F-AUTH-001-rate-limit-shared-store.md` is related to distributed rate-limit storage but does not block this slice.
- Do not modify Chatwoot core.
- Do not use old portal project code or data.

## Task 1 - Backend Data Contract

Files:

- `backend/src/db/schema.ts`
- new Drizzle migration under the existing migrations directory
- backend user/session DTO tests or fixtures that assert user shape

Steps:

1. Change `portalUsers.passwordHash` from non-null text to nullable text.
2. Generate or write the migration:

```sql
ALTER TABLE portal_users ALTER COLUMN password_hash DROP NOT NULL;
```

3. Update TypeScript types that currently assume `passwordHash: string` for portal user rows to `string | null` only where the raw DB row is used.
4. Keep public API response free of password hashes. Expose only `passwordConfigured: boolean`.

Acceptance:

- TypeScript build does not force any unsafe cast around `passwordHash`.
- Existing users with hashes continue to type-check as configured users.
- New nullable state is represented directly, not through sentinel values.

## Task 2 - Backend Auth Session Issuer

Files:

- `backend/src/modules/auth/service.ts`
- `backend/src/modules/auth/repository.ts` if needed
- `backend/src/modules/auth/routes.ts`
- relevant auth tests

Steps:

1. Extract or expose an internal auth service method:

```ts
issueSessionForUser(input: {
  tenantId: number;
  userId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{
  sessionToken: string;
  session: { expiresAt: Date };
  user: AuthenticatedPortalUser;
}>;
```

2. Reuse existing session token generation, token hashing, session TTL, and session repository insert logic.
3. Change password login to call the same session issuer after password verification.
4. Update login to reject `passwordHash === null` with the existing generic invalid credentials error before calling `verifyPassword`.
5. Add `passwordConfigured` to authenticated user mapping for login and `/api/auth/me`.

Acceptance:

- Login response and `/api/auth/me` include `passwordConfigured`.
- Passwordless users cannot authenticate through the password login endpoint.
- The public login error does not reveal account existence or passwordless state.

## Task 3 - Backend Registration Completion

Files:

- `backend/src/modules/registration/service.ts`
- `backend/src/modules/registration/repository.ts`
- `backend/src/modules/registration/routes.ts`
- `backend/src/modules/auth/rateLimit.ts`
- registration tests

Steps:

1. Update repository create-user input:

```ts
passwordHash: string | null;
```

2. Refactor current `setPassword` registration completion into a shared internal function:

```ts
completeRegistration(input: {
  tenantId: number;
  email: string;
  continuationToken: string;
  passwordHash: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<RegistrationCompletedSession>;
```

3. Preserve the existing validation sequence:

- current tenant;
- normalized email;
- latest verified registration record;
- continuation token hash;
- continuation TTL;
- user-not-already-created check;
- contact link source from verification record;
- legal acceptance link;
- consume verification.

4. Update `setPassword` to hash the password, call `completeRegistration` with the hash, and return an authenticated session result.
5. Add `skipPassword` service method that calls `completeRegistration` with `passwordHash: null`.
6. Add `POST /api/auth/register/skip-password` route.
7. Both set-password and skip-password routes must set the signed session cookie with `getSessionCookieOptions(env)`.
8. Add skip endpoint to auth origin/rate-limit handling.
9. Keep user creation, contact/legal linking, verification consume and session row creation in one transaction where possible. If the shared session issuer cannot accept the transaction executor, consume the verification only after session insertion or make completion idempotently recoverable before merging.

Acceptance:

- `set-password` no longer returns `nextStep: "login"`; it authenticates and returns `nextStep: "chat"`.
- `skip-password` uses the same continuation proof and also authenticates.
- Reusing a continuation after either path fails.
- A failure cannot leave a newly created passwordless user unable to receive the completion session or recover through the tested password-reset path.
- User/contact/legal acceptance creation, verification consumption and session creation use one defensible atomic boundary.

## Task 4 - Backend Password-Later Email-Code Flow

Files:

- create a small module such as `backend/src/modules/password-setup/service.ts`
- create `backend/src/modules/password-setup/repository.ts`
- create `backend/src/modules/password-setup/routes.ts`
- wire the module in `backend/src/app.ts`
- `backend/src/modules/auth/service.ts` or shared session issuer for session rotation
- `backend/src/modules/auth/rateLimit.ts`
- auth tests

Steps:

1. Add protected endpoint `POST /api/auth/password-setup/request`.
2. Require current authenticated portal session.
3. Derive email and user id from the session-resolved user; do not accept email or user id in the request body.
4. If `passwordHash !== null`, return typed `409 PASSWORD_ALREADY_SET`.
5. Create or replace a pending `verification_records` row with purpose `password_setup`, current `portalUserId`, normalized email, hashed 6-digit code, 15-minute TTL, 60-second resend cooldown and max 5 attempts.
6. Send the code to the current user's email. Because this is an authenticated action, surface delivery failure instead of silently accepting it.
7. Add protected endpoint `POST /api/auth/password-setup/verify` with `{ code }`.
8. Verify pending record for the current tenant/user/email, enforce TTL and max attempts, then store a hashed continuation token and return it.
9. Add protected endpoint `POST /api/auth/password-setup/set` with `{ continuationToken, newPassword }`.
10. Validate `newPassword` with the same rules as registration/password reset.
11. Re-load the current tenant/user under lock. If `passwordHash !== null`, consume or invalidate the setup record and return `409 PASSWORD_ALREADY_SET`.
12. Verify continuation hash and TTL, store the new password hash, consume the setup record.
13. Delete existing sessions for the user, issue a fresh session, set the signed session cookie and return authenticated session metadata with `passwordConfigured: true`.
    Keep password update, setup-record consume, session deletion and fresh session insert in one transaction where the repository allows it.
14. Add rate limits for request/verify/set. Request limits protect email delivery; verify limits protect code brute force; set limits protect expensive hash work.

Acceptance:

- Browser cannot submit email or user id to choose whose password is changed.
- Cross-tenant update is impossible by query shape.
- Existing password users are not silently changed by this first-password endpoint.
- A stolen active session alone is not enough to bind a password; the email-code proof is also required.
- Successful first-password setup rotates the session and leaves the frontend authenticated with the new cookie.

## Task 5 - Password Reset Behavior With Nullable Hash

Files:

- `backend/src/modules/password-reset/service.ts`
- `backend/src/modules/password-reset/repository.ts` if raw user type assumes non-null hash
- password reset tests

Steps:

1. Ensure password reset request and set-password flows still work when `password_hash` is null.
2. The reset flow should update null to a hash exactly as it updates an existing hash.
3. Keep reset completion unauthenticated and keep the existing post-reset login requirement unless a separate approved slice changes it.

Acceptance:

- Logged-out users who skipped password can set one through email-code password reset.
- Existing users with passwords can still reset them.

## Task 6 - Frontend API Contracts

Files:

- `frontend/src/features/auth/api/authClient.ts`
- auth API tests
- shared auth types if present

Steps:

1. Add `passwordConfigured: boolean` to authenticated user types.
2. Update registration set-password response type to authenticated session result.
3. Add `skipRegistrationPassword(input)` client method for `POST /auth/register/skip-password`.
4. Add protected password-setup client methods:

```ts
requestPasswordSetup()
verifyPasswordSetupCode({ code })
completePasswordSetup({ continuationToken, newPassword })
```

5. Update password reset types only if backend response types require it.

Acceptance:

- Frontend has no stale `nextStep: "login"` assumption after registration set-password.
- Type checks force all authenticated user render paths to handle `passwordConfigured`.

## Task 7 - Frontend Auth State Handoff

Files:

- `frontend/src/features/auth/lib/AuthSessionProvider.tsx`
- related auth provider tests

Steps:

1. Add an auth context method such as:

```ts
completeAuthenticatedSession(session: AuthenticatedPortalSession): void;
```

2. Reuse existing online snapshot persistence logic used by `signIn`.
3. Ensure the method updates auth state without requiring password credentials.
4. Ensure logout and `/api/auth/me` refresh still clear/update the same state as before.

Acceptance:

- Registration completion can hydrate the app from the backend response after the cookie is set.
- Offline/session snapshot code uses the new user shape and does not preserve old storage assumptions.

## Task 8 - Frontend Registration Completion UI

Files:

- `frontend/src/features/auth/components/RegisterSetPasswordForm.tsx` or replacement component
- `frontend/src/features/auth/lib/registrationFlow.ts`
- route/page wiring for registration set-password
- component tests

Steps:

1. Convert the final registration step from required password to optional completion.
2. Keep password fields and validation for users who choose password now.
3. Add a visible `Continue without password` action.
4. On skip success:

- clear registration flow storage;
- call `completeAuthenticatedSession`;
- navigate to the chat route.

5. On set-password success do the same.
6. On invalid/expired continuation, clear stored verification and send the user back to registration verification/start according to existing flow behavior.
7. Use copy that states password can be set later from profile or by email-code recovery after logout.

Acceptance:

- No success screen tells the user to go login after registration.
- Both completion paths enter the protected app through the normal auth context.
- UI has loading and error states for both actions.

## Task 9 - Frontend Password Later UI

Files:

- `frontend/src/features/profile/pages/UserProfilePage.tsx` or a new profile/security component
- create `frontend/src/features/profile/lib/passwordSetupFlow.ts` if session storage is needed for the continuation token
- route config only if a new route is required
- component tests

Steps:

1. Surface password status from auth user state.
2. If `passwordConfigured = false`, render a profile/security password setup flow with three states: request code, verify code, set password.
3. Request code through protected `requestPasswordSetup()`.
4. Verify code through protected `verifyPasswordSetupCode({ code })` and store the short-lived continuation only in memory or session storage scoped to this flow.
5. Submit password through protected `completePasswordSetup({ continuationToken, newPassword })`.
6. On success, call the auth provider session handoff with the rotated authenticated session and show configured state.
7. If `passwordConfigured = true`, show a simple configured status and direct password changes to the existing reset flow or leave change-password for a future slice.

Acceptance:

- A skipped user can set the first password without logging out.
- The logged-in password setup UI requires email-code verification before password submission.
- Password setup success keeps the user authenticated through the rotated session response.
- Existing password users do not see a misleading first-password form.

## Task 10 - Backend Tests

Minimum backend test cases:

1. Registration skip creates a user with null password hash, contact link, legal acceptance link, consumes verification, creates session, and route sets cookie.
2. Registration set-password creates a password hash and now creates session/cookie.
3. Continuation token cannot be reused after skip.
4. Continuation token cannot be reused after set-password.
5. Invalid, expired, consumed, and tenant-mismatched continuation fail.
6. Password login for null hash returns generic invalid credentials.
7. `/api/auth/me` returns `passwordConfigured` true/false correctly.
8. Protected password-setup request rejects unauthenticated requests.
9. Protected password-setup request sends code only to the current user's email and does not accept browser-submitted email/user id.
10. Protected password-setup verify rejects wrong, expired, replayed and tenant-mismatched codes.
11. Protected password-setup set rejects missing, expired, wrong and tenant-mismatched continuation tokens.
12. Protected password-setup set stores a hash for the current passwordless user, consumes continuation, deletes old sessions and issues a fresh session/cookie.
13. Protected password-setup set rejects users who already have a hash.
14. Password reset can set a password for a null-hash user.
15. Existing password users can still log in and reset password.

Run targeted backend tests first, then full backend test command used by the repo if targeted tests pass.

## Task 11 - Frontend Tests

Minimum frontend test cases:

1. Auth client maps new registration set-password session response.
2. Auth client calls skip-password endpoint with email and continuation token.
3. Registration completion skip clears storage, hydrates auth, and navigates to chat.
4. Registration completion set-password clears storage, hydrates auth, and navigates to chat.
5. Expired continuation clears stored registration verification.
6. AuthSessionProvider accepts backend-authenticated session and persists online snapshot.
7. Profile/security shows first-password setup only when `passwordConfigured = false`.
8. Profile/security password setup requests code, verifies code, stores continuation, submits password and handles typed errors.
9. First-password success accepts the rotated authenticated session and updates user state to configured.

Run targeted frontend tests first, then `pnpm lint` and `pnpm build` before closure.

## Task 12 - Playwright E2E

Add or update Playwright coverage for browser/runtime behavior.

Required e2e flows:

1. Known contact registration -> email code -> skip password -> chat route opens authenticated.
2. From that session -> profile/security -> request code -> verify code -> set first password -> logout -> login with password -> chat route opens.
3. Known contact registration -> skip password -> logout -> password reset email-code -> set password -> login with password.

Acceptance:

- E2E validates real routing, cookie-backed session, storage cleanup, and auth provider state.
- If local email/Chatwoot fixtures block full E2E, document the blocker in the finding/work note before implementation closure. Do not silently skip browser coverage.

## Task 13 - Independent Review And Fixes

Review focus:

- tenant isolation in every new query;
- continuation token one-time semantics;
- session issuance reuse and cookie behavior;
- no passwordless state leak through login;
- nullable password hash handled deliberately;
- no legacy fallbacks or stale frontend storage assumptions;
- password setup later cannot update another user and requires email-code proof;
- password setup later rotates the session and old session tokens no longer work;
- rate-limit coverage for new public endpoint, code verification and expensive hash endpoint.

If findings are found:

1. Create finding files in `docs/findings/` for any active risk that is not fixed immediately.
2. Fix in-scope findings before moving to deploy readiness.
3. Rerun targeted checks after each fix.

## Task 14 - Final Verification Before Commit

Required local commands, adjusted to actual package scripts:

```bash
git diff --check
pnpm lint
pnpm build
```

Also run targeted backend, frontend, and Playwright tests from Tasks 10-12.

Before commit:

- confirm `git status --short --branch` contains only this slice;
- confirm no `.env`, secrets, generated output, `dist`, `node_modules`, Playwright report, or runtime artifacts are staged;
- update `docs/roadmap/work-log.md` only after implementation, tests, review, and fixes are complete because this changes auth/runtime baseline.

Suggested commit after closure:

```text
feat: allow registration password skip
```

## Task 15 - Merge And Production Deploy Plan

After implementation branch is green:

1. Merge into `main` with a non-fast-forward merge or the repo's current preferred merge flow.
2. Push `main`.
3. Deploy with the existing production archive deployment script.
4. Ensure production migration reaches the nullable password schema.
5. Verify production source commit in `DEPLOY_SOURCE.txt`.
6. Verify compose services are healthy.
7. Run production smoke checks:

- health endpoint returns ok;
- tenant endpoint returns expected tenant;
- new test known contact can register and skip password;
- chat opens after skip;
- profile/security can set first password;
- logout and password login work;
- password reset works for a passwordless test account if test data allows;
- login error remains generic for bad credentials.

Rollback note:

- This slice intentionally does not support rollback to old code after passwordless rows are created.
- Before any passwordless production account exists, reverting code is low risk because existing rows still have hashes.
- After passwordless rows exist, rollback requires forward fix, deleting passwordless test rows, restoring backup, or clean reinstall according to the no-legacy policy.

## Done Definition

The slice is ready for production only when:

- backend, frontend, and e2e acceptance criteria pass;
- independent review findings are fixed or explicitly deferred by user decision;
- docs/work-log reflects the new auth baseline after implementation closure;
- feature branch is committed and merged into main;
- production deploy and smoke checks pass.
