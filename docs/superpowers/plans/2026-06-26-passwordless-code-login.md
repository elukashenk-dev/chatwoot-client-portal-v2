# Passwordless Code Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeat login for passwordless customer users through an email-code flow and warn passwordless users before explicit logout.

**Architecture:** Customer passwordless login is a new backend auth module that reuses `verification_records` with purpose `passwordless_login`, tenant/email advisory locks, existing auth session issuance and generic anti-enumeration responses. The frontend adds a public auth flow at `/auth/code-login/*`, hydrates the existing customer auth context after successful verification, and keeps password login/password reset/register as separate flows.

**Tech Stack:** Fastify, Drizzle/Postgres, Vitest, React, React Router, existing portal auth/session/offline cache APIs.

---

## Files

- Create `backend/src/modules/passwordless-login/repository.ts`: tenant-scoped verification record persistence for request and verify.
- Create `backend/src/modules/passwordless-login/service.ts`: email-code request/verify/session issue logic.
- Create `backend/src/modules/passwordless-login/routes.ts`: `/api/auth/code-login/request` and `/api/auth/code-login/verify`.
- Create `backend/src/app-passwordless-login.integration.test.ts`: backend app-level coverage for request, verify, anti-enumeration, tenant isolation and rate limiting.
- Modify `backend/src/app.ts`: wire repository/service/routes.
- Modify `backend/src/modules/auth/rateLimit.ts`: add rate-limit groups for the two new public auth endpoints.
- Modify `frontend/src/features/auth/api/authClient.ts`: add request/verify client methods and response types.
- Create `frontend/src/features/auth/lib/passwordlessLoginFlow.ts`: sessionStorage handoff for the email-code flow, matching existing reset/register storage patterns.
- Create `frontend/src/features/auth/components/PasswordlessLoginRequestForm.tsx`: email request form.
- Create `frontend/src/features/auth/components/PasswordlessLoginVerifyForm.tsx`: 6-digit code verification form with authenticated session handoff.
- Create `frontend/src/features/auth/pages/PasswordlessLoginRequestPage.tsx` and `PasswordlessLoginVerifyPage.tsx`.
- Modify `frontend/src/app/routePaths.ts` and `frontend/src/app/AppRoutes.tsx`: add public auth routes.
- Modify `frontend/src/features/auth/components/LoginForm.tsx`: add `Уже есть аккаунт? Войти по коду из почты.` link below password field with `ShieldLockIcon`.
- Modify `frontend/src/features/chat/components/ChatHeader.tsx`: add confirmation modal for `user.passwordConfigured === false` before logout.
- Modify focused frontend tests under `frontend/src/features/auth/pages/LoginPage.test.tsx`, `frontend/src/features/auth/pages/RequestPages.test.tsx`, `frontend/src/features/auth/api/authClient.test.ts`, `frontend/src/features/chat/components/ChatHeader.test.tsx`, and CSS snapshot tests if class selectors change.
- Update stable docs only after implementation/review/checks if this becomes the accepted baseline.

## Load Model And Limits

- No email pre-check endpoint. The link is always visible and the backend keeps generic accepted responses, so the UI does not reveal account existence.
- New DB writes happen only after explicit user action on code-login request/verify, not on page load or every failed password login.
- Reuse existing `verification_records_tenant_email_purpose_status_idx`, bounded resend cooldown, TTL, max attempts and auth rate-limit hook.
- No browser auth tokens are added; successful verify creates the existing `portal_session` cookie and online auth snapshot.
- Same-origin origin checks stay mandatory on both public POST routes.
- `F-AUTH-001` remains a deployment scaling follow-up: the current limiter is process-local and acceptable for the current one-backend production shape, but shared limiter is required before multi-instance backend.

## Task 1: Backend Passwordless Login

- [x] Write failing app integration tests for:
  - active passwordless user can request code, verify code, receive `portal_session`, and `/api/auth/me` returns `passwordConfigured=false`;
  - configured-password user can also use code login;
  - unknown/inactive email request returns generic accepted response without sending email;
  - wrong code and too many attempts fail without issuing a session;
  - tenant A code cannot authenticate tenant B;
  - rate limit applies to request and verify routes.
- [x] Run:
  `pnpm --dir backend test src/app-passwordless-login.integration.test.ts`
  Expected: FAIL because routes/module do not exist.
- [x] Implement `passwordless-login` repository/service/routes using the same TTL/cooldown/attempt constants as password reset unless a local constant already exists to share.
- [x] Wire the module in `backend/src/app.ts` and add rate-limit route groups.
- [x] Re-run the same backend test until PASS.

## Task 2: Frontend Code Login Flow

- [x] Write failing frontend tests for:
  - login screen renders link `Уже есть аккаунт? Войти по коду из почты.` below password input and routes to `/auth/code-login/request`;
  - request page posts `/api/auth/code-login/request`, stores email/timers, and navigates to verify;
  - verify page posts `/api/auth/code-login/verify`, calls `completeAuthenticatedSession`, and navigates to `/app/chat`;
  - invalid/expired code shows controlled retry text and does not authenticate.
- [x] Run targeted frontend tests:
  `pnpm --dir frontend test src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx src/features/auth/api/authClient.test.ts`
  Expected: FAIL because client/routes/components do not exist.
- [x] Add API methods, flow storage, pages, route paths and route registration.
- [x] Add the login form link with `ShieldLockIcon`.
- [x] Re-run targeted frontend tests until PASS.

## Task 3: Logout Warning

- [x] Write failing `ChatHeader` tests for:
  - passwordless user clicking `Завершить диалог` sees modal and does not call `signOut`;
  - `Остаться` closes modal;
  - `Выйти` calls `signOut` and navigates to login;
  - configured-password user logs out without modal.
- [x] Run:
  `pnpm --dir frontend test src/features/chat/components/ChatHeader.test.tsx`
  Expected: FAIL until modal behavior exists.
- [x] Implement local confirmation modal in `ChatHeader.tsx`, scoped only to customer chat logout.
- [x] Re-run `ChatHeader` targeted test until PASS.

## Task 4: Closure

- [x] Review touched backend and frontend auth/session surfaces locally.
- [x] Request independent code review for the feature diff before merge.
- [x] Fix Critical/Important findings, repeat targeted tests.
- [x] Run required gates:
  - backend targeted passwordless/auth tests;
  - frontend targeted auth/chat-header tests;
  - `pnpm lint`;
  - `pnpm build`;
  - `git diff --check`.
- [x] Update `docs/architecture/overview.md`, `docs/architecture/decisions.md` and `docs/roadmap/work-log.md` if the implementation is accepted as baseline.
