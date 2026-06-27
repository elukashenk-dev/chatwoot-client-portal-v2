# Unified Email-Code Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate customer registration with one email-code access flow that provisions eligible Chatwoot contacts only after code verification and explicit legal consent.

**Architecture:** Keep `/api/auth/code-login/*` as the single public customer email-code boundary. Reuse `verification_records` for pending code and short legal continuation state, then create portal user/contact link/legal acceptance/session in one tenant-scoped transaction. Remove active registration routes/UI so customers never choose between login and registration.

**Tech Stack:** Fastify, Drizzle/Postgres, Vitest backend integration tests, React Router/Vitest frontend tests, Playwright local smoke.

---

### Task 1: Backend Unified Code-Login Authority

**Files:**
- Modify: `backend/src/modules/passwordless-login/repository.ts`
- Modify: `backend/src/modules/passwordless-login/service.ts`
- Modify: `backend/src/modules/passwordless-login/routes.ts`
- Test: `backend/src/app-passwordless-login.integration.test.ts`

- [ ] **Step 1: Write failing backend tests**

Add tests proving:

```ts
it('requires legal acceptance after code verification for an eligible Chatwoot contact without portal user', async () => {
  // request code for contact email -> sends email
  // verify code -> returns nextStep: 'accept_legal' and continuationToken
  // assert no portal user/session cookie exists yet
})

it('accepts legal continuation and creates passwordless portal user session', async () => {
  // request code, verify code, submit both legal checkboxes
  // assert portal user exists with password_hash null
  // assert contact link exists
  // assert legal acceptance is linked to portal user
  // assert portal_session cookie is set
})

it('does not create a portal user when legal documents are missing', async () => {
  // no active legal docs
  // submit accept-legal -> 503 LEGAL_DOCUMENTS_NOT_CONFIGURED
  // assert no portal user/contact link
})
```

Run:

```bash
pnpm --dir backend test -- app-passwordless-login.integration.test.ts
```

Expected: FAIL because `accept-legal` and Chatwoot-contact provisioning are not implemented.

- [ ] **Step 2: Extend repository**

Add repository methods on `createPasswordlessLoginRepository`:

```ts
createPendingLogin({ chatwootContactId, fullName, portalUserId, ... })
replacePendingLogin({ chatwootContactId, fullName, portalUserId, ... })
verifyPendingLoginForLegal({ recordId, continuationTokenHash, continuationTokenExpiresAt, verifiedAt, updatedAt })
findLatestVerifiedLoginByEmail(email)
consumeVerifiedLogin(recordId, at)
createPortalUser({ email, fullName, passwordHash: null })
createPortalUserContactLink({ userId, chatwootContactId })
createLegalAcceptance(input)
findLatestLegalAcceptanceForUser({ userId, termsVersion, privacyPolicyVersion })
```

Keep all queries tenant-scoped and purpose-scoped to `passwordless_login`.

- [ ] **Step 3: Extend service**

Update `createPasswordlessLoginService` dependencies to accept:

```ts
chatwootClient: Pick<ChatwootClient, 'findContactByEmail'>
legalDocumentsReader: { getActiveVersionsForRegistration(): Promise<RegistrationLegalDocumentVersions> }
```

Behavior:

- request: existing active portal user sends code without Chatwoot lookup;
- request: no portal user calls Chatwoot once and stores `chatwootContactId/fullName`;
- verify: existing user with current legal acceptance gets session;
- verify: missing legal acceptance or contact-only record returns `nextStep: 'accept_legal'`;
- accept legal: requires both booleans, creates/link/accepts/session in one transaction.

- [ ] **Step 4: Run backend targeted tests**

Run:

```bash
pnpm --dir backend test -- app-passwordless-login.integration.test.ts
```

Expected: PASS.

### Task 2: Remove Active Registration Contract

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/src/modules/auth/rateLimit.ts`
- Test: `backend/src/app.test.ts`

- [ ] **Step 1: Write failing route-removal tests**

Add/adjust tests:

```ts
it('does not expose legacy customer registration endpoints', async () => {
  for (const url of [
    '/api/auth/register/request',
    '/api/auth/register/verify',
    '/api/auth/register/set-password',
    '/api/auth/register/skip-password',
  ]) {
    const response = await app.inject({ method: 'POST', url, payload: {} })
    expect(response.statusCode).toBe(404)
  }
})
```

Run targeted backend app tests and verify FAIL while routes are still registered.

- [ ] **Step 2: Remove route registration**

Remove `registerRegistrationRoutes()` from `backend/src/app.ts` and remove registration endpoint entries from `backend/src/modules/auth/rateLimit.ts`.

- [ ] **Step 3: Run targeted backend tests**

Run:

```bash
pnpm --dir backend test -- app.test.ts app-passwordless-login.integration.test.ts
```

Expected: PASS.

### Task 3: Frontend Unified Auth UI

**Files:**
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/features/auth/api/authClient.ts`
- Modify: `frontend/src/features/auth/lib/passwordlessLoginFlow.ts`
- Modify: `frontend/src/features/auth/components/PasswordlessLoginRequestForm.tsx`
- Modify: `frontend/src/features/auth/components/PasswordlessLoginVerifyForm.tsx`
- Modify: `frontend/src/features/auth/components/AuthSecondaryLinks.tsx`
- Create: `frontend/src/features/auth/components/LegalConsentForm.tsx`
- Create: `frontend/src/features/auth/pages/LegalConsentPage.tsx`
- Test: `frontend/src/features/auth/pages/PasswordlessLoginPages.test.tsx`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add tests:

```ts
it('does not show registration or activation link on login', async () => {
  renderAuthRoutes(['/auth/login'])
  expect(screen.queryByText(/Активировать доступ|Регистрация/)).not.toBeInTheDocument()
})

it('routes verified first-access code login to legal consent', async () => {
  // mock /api/auth/code-login/verify returning nextStep: 'accept_legal'
  // assert navigate to /auth/login/legal and continuation is stored
})

it('requires both legal checkboxes before continuing to chat', async () => {
  // render /auth/login/legal with stored continuation
  // assert submit disabled until both checkboxes checked
})
```

Run:

```bash
pnpm --dir frontend test -- PasswordlessLoginPages.test.tsx LoginPage.test.tsx
```

Expected: FAIL before implementation.

- [ ] **Step 2: Implement frontend**

Use `/auth/login` for request, `/auth/login/verify` for code verification,
`/auth/login/legal` for legal consent, `/auth/login/password` for password login.

Client contract additions:

```ts
type CodeLoginVerifyResponse =
  | { nextStep: 'chat'; session: AuthSession; user: AuthUser; result: 'passwordless_login_completed' }
  | { nextStep: 'accept_legal'; email: string; continuationToken: string; continuationExpiresInSeconds: number; result: 'legal_acceptance_required' }

function acceptCodeLoginLegal(input: {
  continuationToken: string
  email: string
  termsAccepted: true
  personalDataConsentAccepted: true
})
```

Remove active registration links/routes from routing and secondary links.

- [ ] **Step 3: Run targeted frontend tests**

Run:

```bash
pnpm --dir frontend test -- PasswordlessLoginPages.test.tsx LoginPage.test.tsx PortalPreviewFrame.test.tsx
```

Expected: PASS.

### Task 4: Local Closure

**Files:**
- Modify stable docs only after tests pass:
  - `docs/architecture/overview.md`
  - `docs/architecture/decisions.md`
  - `docs/roadmap/work-log.md`

- [ ] **Step 1: Targeted local checks**

Run:

```bash
pnpm --dir backend test -- app-passwordless-login.integration.test.ts app.test.ts
pnpm --dir frontend test -- PasswordlessLoginPages.test.tsx LoginPage.test.tsx PortalPreviewFrame.test.tsx
pnpm lint
pnpm build
git diff --check
```

- [ ] **Step 2: Local browser smoke**

Use local dev server only. Verify:

- first-time Chatwoot contact: email -> code -> legal -> chat;
- returning passwordless user: email -> code -> chat;
- password user: password route -> chat.

- [ ] **Step 3: Stop before merge/deploy**

Do not merge into `main`. Do not deploy to production. Report local status, tests, and remaining review items.
