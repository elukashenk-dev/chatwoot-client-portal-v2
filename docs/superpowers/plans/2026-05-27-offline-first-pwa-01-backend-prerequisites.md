# Offline-first PWA Slice 01: Backend Prerequisites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose bounded session metadata and user-bound push payload data needed by offline startup and push stale markers.

**Architecture:** Portal backend remains the only authority for auth, session and push delivery. Browser receives only portal-safe user/session metadata and a non-secret `portalUserId` in push payloads; no Chatwoot token or message body is exposed.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 01 of 9

**Depends On:** Accepted Offline-first PWA spec and current backend auth/push baseline.

**Unlocks:** Slice 02 IndexedDB foundation and Slice 08 push stale marker persistence.

---

## Task 1: Backend Session Expiry And Push User Binding

**Goal:** Make backend return explicit session expiry metadata required by
`offlineAccessUntil`, and include non-secret portal user binding in push payloads.

**Files:**

- Modify: `backend/src/modules/auth/repository.ts`
- Modify: `backend/src/modules/auth/service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/modules/auth/routes.ts`
- Review: `backend/src/modules/auth/currentUser.ts`
- Modify: `backend/src/modules/auth/service.test.ts`
- Modify: `backend/src/app-auth.integration.test.ts`
- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.ts`
- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`

- [ ] **Step 1: Write failing service tests for session expiry**

In `backend/src/modules/auth/service.test.ts`, extend login/current-session
assertions:

```ts
expect(tenantASession.expiresAt.toISOString()).toBe('2026-05-05T12:00:00.000Z')

await expect(
  authService.getCurrentSession({
    sessionToken: tenantASession.sessionToken,
    tenantId: tenantA.id,
  }),
).resolves.toMatchObject({
  expiresAt: new Date('2026-05-05T12:00:00.000Z'),
  user: {
    email: 'name@company.ru',
    fullName: 'Tenant A User',
  },
})
```

- [ ] **Step 2: Write failing integration assertions for auth response shape**

In `backend/src/app-auth.integration.test.ts`, change login and `/api/auth/me`
expected JSON:

```ts
const fixedNow = new Date('2026-04-21T12:00:00.000Z')

beforeEach(async () => {
  database = await createTestDatabase()
  tenantId = await seedDefaultTenant(database)
  app = buildApp({
    database,
    env: testEnv,
    now: () => fixedNow,
  })
  await app.ready()
})
```

```ts
expect(loginResponse.json()).toEqual({
  session: {
    expiresAt: '2026-05-05T12:00:00.000Z',
  },
  user: {
    email: 'name@company.ru',
    fullName: 'Portal User',
    id: 1,
  },
})

expect(meResponse.json()).toEqual({
  session: {
    expiresAt: '2026-05-05T12:00:00.000Z',
  },
  user: {
    email: 'name@company.ru',
    fullName: 'Portal User',
    id: 1,
  },
})
```

- [ ] **Step 3: Run tests and verify failure**

```bash
pnpm --dir backend test -- src/modules/auth/service.test.ts src/app-auth.integration.test.ts --run
```

Expected: FAIL because `getCurrentSession` and `session.expiresAt` are not
implemented yet.

- [ ] **Step 4: Return `expiresAt` from auth repository**

In `backend/src/modules/auth/repository.ts`, extend `SessionUserRecord` and
select:

```ts
type SessionUserRecord = {
  expiresAt: Date
  sessionId: number
  user: {
    email: string
    fullName: string | null
    id: number
  }
}
```

```ts
const [session] = await db.select({
  email: portalUsers.email,
  expiresAt: portalSessions.expiresAt,
  fullName: portalUsers.fullName,
  id: portalUsers.id,
  sessionId: portalSessions.id,
})
```

Return:

```ts
return {
  expiresAt: session.expiresAt,
  sessionId: session.sessionId,
  user: {
    email: session.email,
    fullName: session.fullName,
    id: session.id,
  },
}
```

- [ ] **Step 5: Add `getCurrentSession` without breaking existing route helpers**

In `backend/src/modules/auth/service.ts`, add:

```ts
export type PublicPortalSession = {
  expiresAt: Date
  user: PublicPortalUser
}
```

Inside `createAuthService`, replace current `getCurrentUser` internals with:

```ts
async function resolveCurrentSession({
  sessionToken,
  tenantId,
}: {
  sessionToken: string
  tenantId: number
}): Promise<PublicPortalSession | null> {
  const resolvedAt = now()
  const session = await repository.findUserBySessionTokenHash({
    now: resolvedAt,
    tenantId,
    tokenHash: hashSessionToken(sessionToken),
  })

  if (!session) {
    return null
  }

  await repository.touchSession({
    at: resolvedAt,
    sessionId: session.sessionId,
    tenantId,
  })

  return {
    expiresAt: session.expiresAt,
    user: {
      ...session.user,
      email: normalizeEmail(session.user.email),
    },
  }
}
```

Return both methods with explicit input types:

```ts
async getCurrentSession(input: {
  sessionToken: string
  tenantId: number
}) {
  return resolveCurrentSession(input)
},

async getCurrentUser(input: {
  sessionToken: string
  tenantId: number
}) {
  return (await resolveCurrentSession(input))?.user ?? null
},
```

- [ ] **Step 6: Add fixed clock injection to `buildApp`**

In `backend/src/app.ts`, extend options:

```ts
type BuildAppOptions = {
  chatwootFetchFn?: typeof fetch
  database: DatabaseClient
  env: AppEnv
  now?: () => Date
}
```

Change the `buildApp` signature:

```ts
export function buildApp({
  chatwootFetchFn,
  database,
  env,
  now,
}: BuildAppOptions) {
```

Then pass the optional clock only to auth service:

```ts
const authService = createAuthService({
  db: database.db,
  env,
  ...(now ? { now } : {}),
})
```

Do not thread this test clock into chat, tenant or push services in this slice.

- [ ] **Step 7: Return public session metadata from auth routes**

In `backend/src/modules/auth/routes.ts`, login response:

```ts
return {
  session: {
    expiresAt: session.expiresAt.toISOString(),
  },
  user: session.user,
}
```

For `/api/auth/me`, use:

```ts
const session = await authService.getCurrentSession({
  sessionToken,
  tenantId: tenant.id,
})

if (!session) {
  clearSessionCookie(reply, env)
  throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход.')
}

return {
  session: {
    expiresAt: session.expiresAt.toISOString(),
  },
  user: session.user,
}
```

Keep `backend/src/modules/auth/currentUser.ts` returning only user through
`getCurrentUser`, so chat routes do not need to change.

- [ ] **Step 8: Write failing push payload assertion for `portalUserId`**

In `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`, extend
expected JSON:

```ts
JSON.stringify({
  chatwootMessageId: 9001,
  notificationTag: 'portal-chat-message-default-9001',
  portalUserId: 7,
  tenantSlug: 'default',
  threadId: 'private:me',
  threadTitle: 'Личный чат',
  threadType: 'private',
  type: 'chat_message',
  url: '/',
})
```

Also assert the payload still excludes sensitive fields:

```ts
expect(parsedPayload).not.toHaveProperty('content')
expect(parsedPayload).not.toHaveProperty('text')
expect(parsedPayload).not.toHaveProperty('authorName')
expect(parsedPayload).not.toHaveProperty('attachments')
expect(parsedPayload).not.toHaveProperty('chatwootBaseUrl')
```

- [ ] **Step 9: Implement `portalUserId` in push payload**

In `backend/src/modules/chat-notifications/pushDeliveryService.ts`, extend
`buildPayload`:

```ts
function buildPayload({
  chatwootMessageId,
  portalUserId,
  tenantSlug,
  threadId,
  threadTitle,
  threadType,
}: {
  chatwootMessageId: number
  portalUserId: number
  tenantSlug: string
  threadId: string
  threadTitle: string | null
  threadType: 'group' | 'private' | null
}) {
  return JSON.stringify({
    chatwootMessageId,
    notificationTag: `portal-chat-message-${tenantSlug}-${chatwootMessageId}`,
    portalUserId,
    tenantSlug,
    threadId,
    threadTitle,
    threadType,
    type: 'chat_message',
    url: '/',
  })
}
```

Pass `portalUserId: recipient.portalUserId` at the call site.

- [ ] **Step 10: Run targeted backend tests**

```bash
pnpm --dir backend test -- src/modules/auth/service.test.ts src/app-auth.integration.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts --run
pnpm --dir backend build
```

Expected: PASS.
