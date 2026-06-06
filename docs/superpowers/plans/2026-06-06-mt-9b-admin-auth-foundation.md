# MT-9B Admin Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped admin login foundation: admin email challenge,
email-code verification, separate admin sessions and audit event baseline.

**Architecture:** This slice is backend-first and does not add branding UI. The
browser receives only admin auth API responses and a signed httpOnly admin
session cookie. Chatwoot administrator eligibility is delegated to the existing
MT-9A `tenant-admin/adminVerification` service, while challenge/session/audit
state is stored only in tenant-scoped portal DB tables.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PGlite migrations, Vitest,
existing SMTP email adapter, existing Fastify signed cookies.

---

## Scope

Implement this slice:

- `POST /api/admin/auth/request` - request an admin login code by email;
- `POST /api/admin/auth/verify` - verify the code and create admin session;
- `GET /api/admin/auth/me` - resolve current admin session;
- `POST /api/admin/auth/logout` - delete current admin session and clear admin
  cookie;
- tenant-scoped audit rows for request/verify/logout outcomes;
- no frontend admin page yet;
- no branding settings or asset storage yet.

Do not implement in this slice:

- `/admin/login` React UI;
- `/admin/branding`;
- object storage;
- platform/operator admin;
- customer session changes;
- global/shared-store rate limiting.

## API Contract

### Request Admin Code

```http
POST /api/admin/auth/request
Content-Type: application/json
Origin: <tenant public origin>

{ "email": "Admin@Example.test" }
```

Success:

```json
{
  "delivery": "sent",
  "email": "admin@example.test",
  "expiresInSeconds": 900,
  "nextStep": "verify_code",
  "purpose": "tenant_admin_login",
  "resendAvailableInSeconds": 60,
  "result": "admin_login_challenge_requested"
}
```

Controlled errors:

- `403 TENANT_ADMIN_NOT_ELIGIBLE` - email is not a confirmed administrator in
  the current tenant Chatwoot account;
- `503 TENANT_ADMIN_VERIFICATION_UNAVAILABLE` - missing/invalid/insufficient
  admin-verification token or Chatwoot request failure;
- `503 TENANT_ADMIN_DELIVERY_UNAVAILABLE` - SMTP unavailable;
- `409 TENANT_ADMIN_DELIVERY_IN_PROGRESS` - existing challenge is in `sending`.

### Verify Admin Code

```http
POST /api/admin/auth/verify
Content-Type: application/json
Origin: <tenant public origin>

{ "email": "admin@example.test", "code": "123456" }
```

Success sets signed httpOnly admin cookie and returns:

```json
{
  "admin": {
    "chatwootAgentId": 11,
    "email": "admin@example.test",
    "role": "administrator"
  },
  "session": {
    "expiresAt": "2026-06-06T20:00:00.000Z"
  }
}
```

Controlled errors:

- `400 TENANT_ADMIN_INVALID_CODE`;
- `410 TENANT_ADMIN_CODE_EXPIRED`;
- `409 TENANT_ADMIN_TOO_MANY_ATTEMPTS`;
- `409 TENANT_ADMIN_CHALLENGE_NOT_FOUND_OR_INVALIDATED`.

### Current Admin

```http
GET /api/admin/auth/me
Cookie: portal_admin_session=<signed token>
```

Success:

```json
{
  "admin": {
    "chatwootAgentId": 11,
    "email": "admin@example.test",
    "role": "administrator"
  },
  "session": {
    "expiresAt": "2026-06-06T20:00:00.000Z"
  }
}
```

Unauthorized clears only the admin cookie:

```json
{
  "error": {
    "code": "TENANT_ADMIN_UNAUTHORIZED",
    "message": "Требуется вход администратора."
  }
}
```

### Logout

```http
POST /api/admin/auth/logout
Origin: <tenant public origin>
Cookie: portal_admin_session=<signed token>
```

Returns `204` and clears only the admin cookie.

## Persistence Contract

Add three tables:

```text
portal_admin_login_challenges
portal_admin_sessions
portal_admin_audit_events
```

`portal_admin_login_challenges`:

```text
id serial primary key
tenant_id integer not null references portal_tenants(id) on delete restrict
email text not null
chatwoot_agent_id integer not null
role text not null
code_hash text not null
status text not null default 'pending'
attempts_count integer not null default 0
max_attempts integer not null default 5
resend_count integer not null default 0
resend_not_before timestamptz not null
expires_at timestamptz not null
last_sent_at timestamptz not null
verified_at timestamptz null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Indexes:

```text
portal_admin_login_challenges_tenant_email_status_idx
portal_admin_login_challenges_expires_at_idx
```

`portal_admin_sessions`:

```text
id serial primary key
tenant_id integer not null references portal_tenants(id) on delete restrict
token_hash text not null
email text not null
chatwoot_agent_id integer not null
role text not null
expires_at timestamptz not null
last_seen_at timestamptz not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Indexes:

```text
portal_admin_sessions_token_hash_unique
portal_admin_sessions_tenant_email_idx
portal_admin_sessions_expires_at_idx
```

`portal_admin_audit_events`:

```text
id serial primary key
tenant_id integer not null references portal_tenants(id) on delete restrict
actor_email text null
actor_chatwoot_agent_id integer null
action text not null
outcome text not null
subject_email text null
request_ip text null
user_agent text null
metadata jsonb not null default '{}'
created_at timestamptz not null default now()
```

Indexes:

```text
portal_admin_audit_events_tenant_created_at_idx
portal_admin_audit_events_tenant_action_idx
```

Audit metadata must never include:

- plaintext code;
- code hash;
- session token;
- session token hash;
- Chatwoot runtime token;
- Chatwoot admin-verification token.

## Runtime Constants

Use local constants in `tenant-admin/adminAuthService.ts`:

```ts
const ADMIN_LOGIN_CODE_LENGTH = 6
const ADMIN_LOGIN_CHALLENGE_TTL_SECONDS = 15 * 60
const ADMIN_LOGIN_RESEND_COOLDOWN_SECONDS = 60
const ADMIN_SESSION_TTL_HOURS = 12
const ADMIN_LOGIN_PURPOSE = 'tenant_admin_login'
```

Add env:

```ts
ADMIN_SESSION_COOKIE_NAME: z.string().min(1).default('portal_admin_session')
```

Use existing `SESSION_SECRET` to sign cookies. Do not add a second signing
secret in this slice.

## File Map

- Modify: `backend/src/db/schema.ts`
- Create: generated migration `backend/drizzle/0009_*.sql`
- Modify: generated `backend/drizzle/meta/_journal.json`
- Create: generated `backend/drizzle/meta/0009_snapshot.json`
- Modify: `backend/src/config/env.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `backend/src/test/appTestHelpers.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthRepository.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthRepository.test.ts`
- Create: `backend/src/modules/tenant-admin/adminSessionCookie.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthService.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthService.test.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthRoutes.ts`
- Create: `backend/src/app-admin-auth.integration.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/modules/auth/rateLimit.ts`
- Modify: `docs/roadmap/work-log.md`
- Modify: `docs/roadmap/implementation-plan.md`
- Modify: `docs/architecture/overview.md`

## Task 1: Schema And Repository

**Files:**

- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0009_*.sql`
- Modify: `backend/drizzle/meta/_journal.json`
- Create: `backend/drizzle/meta/0009_snapshot.json`
- Create: `backend/src/modules/tenant-admin/adminAuthRepository.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthRepository.test.ts`

- [x] **Step 1: Write failing repository tests**

Create `backend/src/modules/tenant-admin/adminAuthRepository.test.ts`.

Test cases:

```ts
it('creates and loads the latest tenant-scoped admin challenge by normalized email', async () => {
  const challenge = await repository.createPendingChallenge({
    chatwootAgentId: 11,
    codeHash: 'code-hash',
    email: ' Admin@Example.test ',
    expiresAt,
    lastSentAt: now,
    resendNotBefore,
    role: 'administrator',
  })

  expect(challenge).toMatchObject({
    attemptsCount: 0,
    chatwootAgentId: 11,
    codeHash: 'code-hash',
    email: 'admin@example.test',
    maxAttempts: 5,
    role: 'administrator',
    status: 'pending',
  })
  await expect(
    repository.findLatestPendingChallengeByEmail('ADMIN@example.test'),
  ).resolves.toMatchObject({
    id: challenge.id,
    email: 'admin@example.test',
  })
})
```

```ts
it('creates a tenant-scoped admin session and does not resolve it for another tenant', async () => {
  await repository.createSession({
    chatwootAgentId: 11,
    email: 'admin@example.test',
    expiresAt,
    lastSeenAt: now,
    role: 'administrator',
    tokenHash: 'session-token-hash',
  })

  await expect(
    repository.findSessionByTokenHash({
      now,
      tokenHash: 'session-token-hash',
    }),
  ).resolves.toMatchObject({
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
  })

  const otherTenantRepository = createTenantAdminAuthRepository(database.db, {
    tenantId: otherTenantId,
  })

  await expect(
    otherTenantRepository.findSessionByTokenHash({
      now,
      tokenHash: 'session-token-hash',
    }),
  ).resolves.toBeNull()
})
```

```ts
it('writes audit events without secret-bearing metadata', async () => {
  await expect(
    repository.createAuditEvent({
      action: 'admin_login_verified',
      actorChatwootAgentId: 11,
      actorEmail: 'admin@example.test',
      metadata: {
        reason: 'ok',
        sessionToken: 'secret',
      },
      outcome: 'success',
      requestIp: '127.0.0.1',
      subjectEmail: 'admin@example.test',
      userAgent: 'vitest',
    }),
  ).rejects.toThrow(TenantAdminAuditMetadataError)
})
```

- [x] **Step 2: Run repository tests and verify RED**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenant-admin/adminAuthRepository.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because schema/repository do not exist.

- [x] **Step 3: Implement schema and generate migration**

Add the three tables to `backend/src/db/schema.ts`. Import `jsonb` and `desc`
helpers only where needed. Use `timestampWithTimezone` for all timestamps.

Generate migration:

```bash
pnpm --dir backend db:generate
```

Expected generated SQL includes the three `CREATE TABLE` statements and the
indexes listed in this plan.

- [x] **Step 4: Implement repository**

Create `backend/src/modules/tenant-admin/adminAuthRepository.ts` with:

```ts
export class TenantAdminAuditMetadataError extends Error {}

export function createTenantAdminAuthRepository(
  db: AppDatabase,
  { tenantId }: { tenantId: number },
) {
  return {
    transactionWithScopedLock<T>(
      email: string,
      handler: (executor: AppDatabase) => Promise<T>,
    ): Promise<T>,
    createPendingChallenge(input, executor = db),
    findLatestActiveChallengeByEmail(email, executor = db),
    findLatestPendingChallengeByEmail(email, executor = db),
    replacePendingChallenge(input, executor = db),
    markChallengeVerified(input, executor = db),
    incrementChallengeAttempts(input, executor = db),
    expireChallenge(recordId, at, executor = db),
    createSession(input, executor = db),
    findSessionByTokenHash(input),
    touchSession(input),
    deleteSessionByTokenHash(input),
    createAuditEvent(input, executor = db),
  }
}
```

Repository rules:

- all lookup/update/delete methods include `tenant_id`;
- email is normalized through `normalizeEmail`;
- scoped advisory lock key uses
  `tenant_admin_login:${tenantId}:${normalizeEmail(email)}`;
- active challenge statuses are `pending` and `sending`;
- audit metadata accepts only JSON object values and rejects keys matching:
  `code`, `codeHash`, `sessionToken`, `token`, `tokenHash`, `apiAccessToken`,
  `adminVerificationToken`, `runtimeToken`.

- [x] **Step 5: Run repository tests and verify GREEN**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenant-admin/adminAuthRepository.test.ts --no-file-parallelism --reporter verbose
```

Expected: PASS.

## Task 2: Admin Auth Service

**Files:**

- Create: `backend/src/modules/tenant-admin/adminAuthService.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthService.test.ts`

- [x] **Step 1: Write failing service tests**

Create `backend/src/modules/tenant-admin/adminAuthService.test.ts`.

Cover:

```ts
it('requests a challenge only after current tenant admin verification succeeds', async () => {
  tenantAdminVerificationService.verifyTenantAdminEmail.mockResolvedValue({
    agent: {
      accountId: 3,
      email: 'admin@example.test',
      id: 11,
      role: 'administrator',
    },
    result: 'eligible',
  })

  await expect(
    service.requestAdminLoginChallenge({
      email: ' Admin@Example.test ',
      requestIp: '127.0.0.1',
      userAgent: 'vitest',
    }),
  ).resolves.toMatchObject({
    delivery: 'sent',
    email: 'admin@example.test',
    nextStep: 'verify_code',
    purpose: 'tenant_admin_login',
    result: 'admin_login_challenge_requested',
  })

  expect(emailDelivery.send).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: 'Код входа администратора Client Portal',
      to: 'admin@example.test',
    }),
  )
})
```

```ts
it('does not send a code when the email is not a confirmed Chatwoot administrator', async () => {
  tenantAdminVerificationService.verifyTenantAdminEmail.mockResolvedValue({
    result: 'not_eligible',
  })

  await expect(
    service.requestAdminLoginChallenge({
      email: 'agent@example.test',
      requestIp: null,
      userAgent: null,
    }),
  ).rejects.toMatchObject({
    code: 'TENANT_ADMIN_NOT_ELIGIBLE',
    statusCode: 403,
  })
  expect(emailDelivery.send).not.toHaveBeenCalled()
})
```

```ts
it('verifies a valid code and creates an admin session separate from customer sessions', async () => {
  await service.requestAdminLoginChallenge({
    email: 'admin@example.test',
    requestIp: null,
    userAgent: null,
  })

  const sentText = emailDelivery.send.mock.calls[0]?.[0].text ?? ''
  const code = sentText.match(/\b\d{6}\b/)?.[0] ?? ''

  await expect(
    service.verifyAdminLoginCode({
      code,
      email: 'admin@example.test',
      requestIp: null,
      userAgent: null,
    }),
  ).resolves.toMatchObject({
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
    sessionToken: expect.any(String),
  })
})
```

```ts
it('rejects cross-tenant verification by using the repository tenant scope', async () => {
  await tenantAService.requestAdminLoginChallenge({
    email: 'admin@example.test',
    requestIp: null,
    userAgent: null,
  })

  const sentText = emailDelivery.send.mock.calls[0]?.[0].text ?? ''
  const code = sentText.match(/\b\d{6}\b/)?.[0] ?? ''

  await expect(
    tenantBService.verifyAdminLoginCode({
      code,
      email: 'admin@example.test',
      requestIp: null,
      userAgent: null,
    }),
  ).rejects.toMatchObject({
    code: 'TENANT_ADMIN_CHALLENGE_NOT_FOUND_OR_INVALIDATED',
  })
})
```

- [x] **Step 2: Run service tests and verify RED**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenant-admin/adminAuthService.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because service does not exist.

- [x] **Step 3: Implement service**

Create `backend/src/modules/tenant-admin/adminAuthService.ts`.

Export:

```ts
export type PublicTenantAdmin = {
  chatwootAgentId: number
  email: string
  role: 'administrator'
}

export type PublicTenantAdminSession = {
  admin: PublicTenantAdmin
  expiresAt: Date
}

export function createTenantAdminAuthService(options) {
  return {
    getCurrentAdminSession(input),
    requestAdminLoginChallenge(input),
    verifyAdminLoginCode(input),
    logout(input),
  }
}
```

Implementation rules:

- `requestAdminLoginChallenge` calls
  `tenantAdminVerificationService.verifyTenantAdminEmail`;
- `eligible` creates/sends a code;
- `not_eligible`, `tenant_not_found`, `tenant_not_active` map to
  `403 TENANT_ADMIN_NOT_ELIGIBLE`;
- `not_configured`, `invalid_token_secret`, `chatwoot_permission_denied` map to
  `503 TENANT_ADMIN_VERIFICATION_UNAVAILABLE`;
- SMTP configuration/send errors map to
  `503 TENANT_ADMIN_DELIVERY_UNAVAILABLE`;
- failed delivery restores previous pending challenge or deletes the new one,
  matching registration/password-reset cleanup patterns;
- challenge code is 6 digits and is stored with the same slow password-hash
  boundary used by registration/password-reset codes;
- max invalid attempts is 5;
- `verifyAdminLoginCode` creates a 32-byte base64url session token and stores
  only `sha256` token hash;
- `getCurrentAdminSession` touches `last_seen_at`;
- `logout` deletes by tenant-scoped token hash;
- every request/verify/logout path writes an audit event with safe metadata.

- [x] **Step 4: Run service tests and verify GREEN**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/tenant-admin/adminAuthService.test.ts --no-file-parallelism --reporter verbose
```

Expected: PASS.

## Task 3: Admin Cookie, Routes And App Wiring

**Files:**

- Modify: `backend/src/config/env.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `backend/src/modules/auth/rateLimit.ts`
- Create: `backend/src/modules/tenant-admin/adminSessionCookie.ts`
- Create: `backend/src/modules/tenant-admin/adminAuthRoutes.ts`
- Create: `backend/src/app-admin-auth.integration.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/test/appTestHelpers.ts`

- [x] **Step 1: Write failing route integration tests**

Create `backend/src/app-admin-auth.integration.test.ts`.

Test success flow:

```ts
it('requests an admin code, verifies it, resolves /api/admin/auth/me, and logs out without customer session', async () => {
  const requestResponse = await app.inject({
    headers: { origin: testEnv.APP_ORIGIN },
    method: 'POST',
    payload: { email: 'admin@example.test' },
    url: '/api/admin/auth/request',
  })

  expect(requestResponse.statusCode).toBe(200)
  expect(sentEmails).toHaveLength(1)

  const code = sentEmails[0].text.match(/\b\d{6}\b/)?.[0] ?? ''
  const verifyResponse = await app.inject({
    headers: { origin: testEnv.APP_ORIGIN },
    method: 'POST',
    payload: { code, email: 'admin@example.test' },
    url: '/api/admin/auth/verify',
  })

  expect(verifyResponse.statusCode).toBe(200)
  const adminCookie = verifyResponse.cookies.find(
    (cookie) => cookie.name === testEnv.ADMIN_SESSION_COOKIE_NAME,
  )
  expect(adminCookie?.httpOnly).toBe(true)
  expect(
    verifyResponse.cookies.find(
      (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
    ),
  ).toBeUndefined()

  const meResponse = await app.inject({
    headers: {
      cookie: `${testEnv.ADMIN_SESSION_COOKIE_NAME}=${adminCookie?.value ?? ''}`,
    },
    method: 'GET',
    url: '/api/admin/auth/me',
  })

  expect(meResponse.statusCode).toBe(200)
  expect(meResponse.json()).toMatchObject({
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
  })
})
```

Test negative flows:

```ts
it('rejects an agent email and does not send a code', async () => {
  chatwootAgents = [
    {
      account_id: 1,
      confirmed: true,
      email: 'agent@example.test',
      id: 12,
      role: 'agent',
    },
  ]

  const response = await app.inject({
    headers: { origin: testEnv.APP_ORIGIN },
    method: 'POST',
    payload: { email: 'agent@example.test' },
    url: '/api/admin/auth/request',
  })

  expect(response.statusCode).toBe(403)
  expect(response.json()).toEqual({
    error: {
      code: 'TENANT_ADMIN_NOT_ELIGIBLE',
      message: 'Нет прав администратора для этого портала.',
    },
  })
  expect(sentEmails).toHaveLength(0)
})
```

```ts
it('does not resolve tenant A admin cookie on tenant B host', async () => {
  // Seed tenant A and tenant B, request/verify on tenant A, then call
  // /api/admin/auth/me with the same cookie and Host for tenant B.
  expect(meOnTenantB.statusCode).toBe(401)
})
```

- [x] **Step 2: Run app integration tests and verify RED**

Run:

```bash
pnpm --dir backend exec vitest run src/app-admin-auth.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: FAIL because routes/env/schema are missing.

- [x] **Step 3: Add admin session cookie helper**

Create `backend/src/modules/tenant-admin/adminSessionCookie.ts`:

```ts
export function getAdminSessionCookieOptions(
  env: AppEnv,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    maxAge: ADMIN_SESSION_TTL_HOURS * 60 * 60,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    signed: true,
  }
}

export function clearAdminSessionCookie(reply: FastifyReply, env: AppEnv) {
  reply.clearCookie(env.ADMIN_SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  })
}
```

Also export `getAdminSessionToken(request, env)`.

- [x] **Step 4: Add env and examples**

Modify `backend/src/config/env.ts`:

```ts
ADMIN_SESSION_COOKIE_NAME: z.string().min(1).default('portal_admin_session')
```

Add to `.env.example` and `.env.production.example`:

```text
ADMIN_SESSION_COOKIE_NAME=portal_admin_session
```

Update `backend/src/test/appTestHelpers.ts` test env with:

```ts
ADMIN_SESSION_COOKIE_NAME: 'portal_admin_session'
```

- [x] **Step 5: Add rate-limit groups**

Modify `backend/src/modules/auth/rateLimit.ts`:

```ts
['POST /api/admin/auth/request', 'tenant-admin-login-request'],
['POST /api/admin/auth/verify', 'tenant-admin-login-verify'],
['POST /api/admin/auth/logout', 'tenant-admin-logout'],
```

Do not add shared Redis/store in this slice. `F-AUTH-001` remains deferred for
multi-instance deployment.

- [x] **Step 6: Add routes**

Create `backend/src/modules/tenant-admin/adminAuthRoutes.ts`.

Route rules:

- mutating routes call `assertAllowedTenantOrigin(request)`;
- all routes use `requireTenantContext(request)`;
- `/request` and `/verify` parse Zod body schemas;
- `/verify` sets only `env.ADMIN_SESSION_COOKIE_NAME`;
- `/logout` clears only admin cookie;
- `/me` clears only admin cookie on unauthorized;
- response copy is Russian:
  - unauthorized: `Требуется вход администратора.`;
  - not eligible: `Нет прав администратора для этого портала.`;
  - unavailable: `Админ-вход сейчас недоступен. Попробуйте позже.`;
  - delivery unavailable: `Мы не смогли отправить код входа. Попробуйте чуть позже.`

- [x] **Step 7: Wire routes in app**

Modify `backend/src/app.ts`:

- import `createChatwootAdminAgentsClient`;
- import `createTenantAdminVerificationService`;
- import `createTenantAdminAuthRepository`;
- import `createTenantAdminAuthService`;
- import `registerTenantAdminAuthRoutes`;
- create a request-scoped tenant admin auth service:

```ts
const createTenantAdminAuthServiceForRequest = (request: FastifyRequest) => {
  const tenant = requireTenantContext(request)

  return createTenantAdminAuthService({
    emailDelivery: createSmtpEmailDelivery({ env }),
    repository: createTenantAdminAuthRepository(database.db, {
      tenantId: tenant.id,
    }),
    tenantAdminVerificationService: createTenantAdminVerificationService({
      chatwootAdminAgentsClientFactory: {
        forTenant: (config) =>
          createChatwootAdminAgentsClient({
            config,
            fetchFn: chatwootFetchFn ?? fetch,
            requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
          }),
      },
      tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
      tenantsRepository: createTenantsRepository(database.db),
    }),
    tenantId: tenant.id,
    ...(now ? { now } : {}),
  })
}
```

Register before chat routes:

```ts
registerTenantAdminAuthRoutes(app, {
  createTenantAdminAuthService: createTenantAdminAuthServiceForRequest,
  env,
})
```

- [x] **Step 8: Run app integration tests and verify GREEN**

Run:

```bash
pnpm --dir backend exec vitest run src/app-admin-auth.integration.test.ts --no-file-parallelism --reporter verbose
```

Expected: PASS.

## Task 4: Docs And Full Verification

**Files:**

- Modify: `docs/roadmap/work-log.md`
- Modify: `docs/roadmap/implementation-plan.md`
- Modify: `docs/architecture/overview.md`
- Optional modify: `docs/architecture/multi-tenant-reference.md` only if the
  implemented contract differs from this reference.

- [x] **Step 1: Update stable docs**

After implementation and tests pass, update docs:

- `work-log.md`: add `MT-9B` baseline and set Recommended Next Step to
  `MT-9C tenant admin UI login screen` or `MT-9C branding settings foundation`,
  depending on the implementation outcome;
- `implementation-plan.md`: mark MT-9B foundation as completed gate;
- `overview.md`: mention separate tenant admin sessions and audit events;
- keep `docs/superpowers/` plan as execution artifact.

- [x] **Step 2: Run targeted backend checks**

Run:

```bash
pnpm --dir backend exec vitest run \
  src/modules/tenant-admin/adminAuthRepository.test.ts \
  src/modules/tenant-admin/adminAuthService.test.ts \
  src/modules/tenant-admin/adminVerification.test.ts \
  src/app-admin-auth.integration.test.ts \
  --no-file-parallelism --reporter verbose
pnpm --dir backend lint
pnpm --dir backend build
```

Expected: all pass.

- [x] **Step 3: Run changed-file formatting and diff checks**

Run:

```bash
mapfile -t changed < <((git diff --name-only --diff-filter=ACM; git ls-files --others --exclude-standard) | rg '\.(ts|tsx|md|json|yaml|yml)$' | sort -u)
pnpm exec prettier --check "${changed[@]}"
git diff --check
```

Expected: all pass.

Diagnostic note: full `pnpm exec prettier --check .` currently reports
pre-existing unrelated baseline formatting warnings outside MT-9B scope.

- [x] **Step 4: Review**

Review checklist:

- admin cookie and customer cookie are separate;
- customer `/api/auth/me` cannot resolve admin cookie;
- admin `/api/admin/auth/me` cannot resolve customer cookie;
- tenant A admin session does not resolve on tenant B;
- no plaintext codes/tokens in DB audit metadata, logs or response payloads;
- not eligible/not configured/insufficient token paths do not send email codes;
- mutating routes enforce origin checks;
- all challenge/session repository operations include `tenant_id`;
- audit events are tenant-scoped.

- [x] **Step 5: Commit**

After implementation, review fixes and checks:

```bash
git add .
git commit -m "feat: add mt-9 tenant admin auth foundation"
```

## Acceptance Criteria

Closed by this plan when implemented:

- tenant admin login challenge is tenant-scoped;
- admin email is verified through MT-9A Chatwoot admin verification service;
- agent/non-admin email cannot request a usable admin login code;
- missing/invalid/insufficient admin-verification token fails closed;
- admin code verification creates a separate admin session cookie;
- customer session cookie is not accepted as admin session;
- admin session cookie is not accepted as customer session;
- tenant A admin session cannot access tenant B admin route;
- logout clears only admin session;
- audit events are tenant-scoped and do not include secrets;
- browser never receives Chatwoot authority.

Not closed by this plan:

- React `/admin/login` page;
- branding settings;
- branding asset storage;
- admin branding UI;
- Playwright browser admin flow. Until UI exists, backend integration tests are
  the required automated coverage for MT-9B.
