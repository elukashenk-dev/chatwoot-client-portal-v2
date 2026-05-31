# Server Unread State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight server-owned unread system for portal chat: per-user, per-thread counts for private and group chats, exact app badge total, and read reset after a successful backend snapshot.

**Architecture:** Backend stores one unread row per `(tenant, user, thread, Chatwoot message)` and is the only source of truth. Webhooks write unread rows idempotently before push counts are built; `GET /api/chat/threads` exposes counts, and successful latest `GET /api/chat/messages` clears the opened thread fail-closed. Frontend removes local unread marker state and renders server counts from API/push payloads.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, Postgres/PGlite, React 19, Vite, Service Worker, Vitest, Testing Library, Playwright.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-06-01-server-unread-state-design.md`
- Repo rules: `AGENTS.md`
- Architecture overview: `docs/architecture/overview.md`
- Decisions: `docs/architecture/decisions.md`
- Roadmap baseline: `docs/roadmap/work-log.md`

## Execution Rules

- Implementation should use a new feature branch from the accepted docs baseline, for example `feature/phase-server-unread-state`.
- Do not change Chatwoot core. Chatwoot remains an external service.
- Do not read or write Chatwoot runtime DB directly.
- Use TDD for backend authority and frontend state changes.
- Keep unread independent from push subscription state. Push may be disabled, but unread rows still exist.
- Clear unread only after a successful latest message snapshot for a thread. Do not clear on offline cache, failed requests, denied access, or older-page pagination.
- Remove the old local unread implementation instead of keeping it beside the server model.
- After implementation, run targeted tests first, then required broader checks. Update `docs/roadmap/work-log.md` only after the slice is implemented, reviewed, and verified as a new baseline.

## File Structure

Backend files to create:

- `backend/src/modules/chat-unread/repository.ts` - Drizzle persistence for unread rows, counts, and clear operations.
- `backend/src/modules/chat-unread/repository.test.ts` - PGlite-backed repository invariants.
- `backend/src/modules/chat-unread/service.ts` - business logic that records unread rows from resolved recipients and clears opened threads.
- `backend/src/modules/chat-unread/service.test.ts` - recipient, duplicate, count, and clear behavior.

Backend files to modify:

- `backend/src/db/notificationSchema.ts` - add `portal_chat_unread_messages` table.
- `backend/src/db/schema.ts` - already exports `notificationSchema`; verify new table is exported through it.
- `backend/drizzle/0004_*.sql` and `backend/drizzle/meta/*` - generated Drizzle migration.
- `backend/src/app.ts` - wire `chat-unread` repository/service into webhooks, thread list, messages, and push delivery.
- `backend/src/modules/chatwoot-webhooks/service.ts` - record unread idempotently for accepted `message_created` events before the accepted duplicate return path can skip retries.
- `backend/src/modules/chatwoot-webhooks/service.test.ts` - ordering and event coverage.
- `backend/src/modules/chat-notifications/pushDeliveryService.ts` - include exact unread counts in push payload.
- `backend/src/modules/chat-notifications/pushDeliveryService.test.ts` - payload count assertions.
- `backend/src/modules/chat-threads/types.ts` - add `unreadCount` to thread summaries and `totalUnreadCount` to thread list response.
- `backend/src/modules/chat-threads/service.ts` - attach unread counts to visible threads.
- `backend/src/modules/chat-threads/service.test.ts` - private plus multiple group counts.
- `backend/src/modules/chat-messages/types.ts` - add message snapshot unread summary.
- `backend/src/modules/chat-messages/service.ts` - clear opened thread after successful latest snapshot.
- `backend/src/modules/chat-messages/service.test.ts` - clear success and fail-closed behavior.
- `backend/src/app.test.ts` - API response integration for `GET /api/chat/threads` and `GET /api/chat/messages`.

Frontend files to modify:

- `frontend/src/features/chat/types.ts` - add `unreadCount`, `totalUnreadCount`, and `ChatUnreadSummary`.
- `frontend/src/features/chat/api/chatClient.ts` - consume updated response types.
- `frontend/src/features/chat/pages/chatPageState.ts` - add small helpers for applying unread counts.
- `frontend/src/features/chat/pages/ChatPage.tsx` - remove old marker hook and update server counts on load/open/push.
- `frontend/src/features/chat/pages/useChatPageNotifications.ts` - replace `onOtherThreadPush` marker callback with server-count handling.
- `frontend/src/features/chat/pages/useChatThreadSelection.ts` - set exact app badge total after thread list and message snapshot.
- `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts` - apply unread summary after active thread refresh.
- `frontend/src/features/chat/components/ChatHeader.tsx` - render numeric unread badges.
- `frontend/src/pwa/serviceWorkerPushMessages.ts` - parse unread counts in foreground push messages.
- `frontend/src/pwa/serviceWorkerRuntime.ts` - add exact app badge setter and remove ChatPage reliance on unconditional clear.
- `frontend/public/sw.js` - parse push counts and set badge to exact total instead of local increment.

Frontend tests to modify:

- `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx` - convert from local dot tests to server-count tests.
- `frontend/src/features/chat/components/ChatHeader.test.tsx` - numeric badge rendering and accessibility.
- `frontend/src/pwa/serviceWorkerAsset.test.ts` - exact app badge behavior.
- `frontend/src/pwa/serviceWorkerRuntime.test.ts` - exact badge runtime helper.
- Existing chat tests with thread fixtures - add `unreadCount: 0` or use test builders that set it.

E2E tests to modify or add:

- `tests/e2e/chat-notifications.spec.ts` - browser-level menu badge and open-thread clear behavior with mocked API/push payloads.

## Task 0: Baseline And Inventory

**Files:**

- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-06-01-server-unread-state-design.md`
- Read: `frontend/src/features/chat/pages/useChatUnreadThreadMarkers.ts`
- Read: `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`
- Read: `backend/src/modules/chatwoot-webhooks/service.ts`
- Read: `backend/src/modules/chat-notifications/pushDeliveryService.ts`

- [ ] **Step 1: Create or verify implementation branch**

Run:

```bash
git status --short --branch
git switch main
git pull --ff-only
git switch -c feature/phase-server-unread-state
```

Expected status:

```text
## feature/phase-server-unread-state
```

If `main` already contains the docs commits, continue. If docs commits live on `docs/server-unread-state-spec`, merge or cherry-pick them intentionally before coding.

- [ ] **Step 2: Inventory old unread implementation**

Run:

```bash
rg -n "useChatUnreadThreadMarkers|unreadThreadIds|markUnreadThread|thread-unread-dot|clearAppIconBadge|incrementAppBadgeCount|setAppBadge" frontend/src frontend/public tests/e2e
```

Expected production inventory before changes:

```text
frontend/src/features/chat/pages/useChatUnreadThreadMarkers.ts
frontend/src/features/chat/pages/ChatPage.tsx
frontend/src/features/chat/components/ChatHeader.tsx
frontend/public/sw.js
frontend/src/pwa/serviceWorkerRuntime.ts
```

Expected test inventory before changes:

```text
frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx
frontend/src/pwa/serviceWorkerAsset.test.ts
frontend/src/pwa/serviceWorkerRuntime.test.ts
```

- [ ] **Step 3: Confirm backend authority points**

Read:

```text
backend/src/modules/chatwoot-webhooks/service.ts
backend/src/modules/chat-notifications/recipientResolver.ts
backend/src/modules/chat-threads/service.ts
backend/src/modules/chat-messages/service.ts
backend/src/app.ts
```

Expected architecture note:

```text
Webhook service maps Chatwoot conversation to portal thread.
Recipient resolver already excludes portal authors and resolves private/group recipients.
Thread and message APIs are backend-authoritative entrypoints for visible chat state.
```

Commit: do not commit after this task.

## Task 1: Add Unread Table And Repository

**Files:**

- Modify: `backend/src/db/notificationSchema.ts`
- Generated: `backend/drizzle/0004_*.sql`
- Generated: `backend/drizzle/meta/0004_snapshot.json`
- Generated: `backend/drizzle/meta/_journal.json`
- Create: `backend/src/modules/chat-unread/repository.ts`
- Create: `backend/src/modules/chat-unread/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `backend/src/modules/chat-unread/repository.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../test/testDatabase.js'
import { seedDefaultTenant } from '../../test/appTestHelpers.js'
import { portalChatThreads, portalUsers } from '../../db/schema.js'
import { createChatUnreadRepository } from './repository.js'

async function seedUserAndThreads() {
  const database = await createTestDatabase()
  const tenantId = await seedDefaultTenant(database)
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email: 'user@example.test',
      passwordHash: 'hash',
      tenantId,
    })
    .returning({ id: portalUsers.id })
  const [privateThread] = await database.db
    .insert(portalChatThreads)
    .values({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      portalUserId: user!.id,
      tenantId,
      threadType: 'private',
    })
    .returning({ id: portalChatThreads.id })
  const [groupThread] = await database.db
    .insert(portalChatThreads)
    .values({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      portalUserId: null,
      tenantId,
      threadType: 'group',
    })
    .returning({ id: portalChatThreads.id })

  return {
    database,
    groupThreadId: groupThread!.id,
    privateThreadId: privateThread!.id,
    tenantId,
    userId: user!.id,
  }
}

describe('createChatUnreadRepository', () => {
  it('deduplicates unread rows by user/thread/message and counts per thread', async () => {
    const seeded = await seedUserAndThreads()
    const repository = createChatUnreadRepository(seeded.database.db, {
      tenantId: seeded.tenantId,
    })

    try {
      await repository.insertUnreadMessages([
        {
          chatwootMessageId: 501,
          now: new Date('2026-06-01T09:00:00.000Z'),
          portalChatThreadId: seeded.privateThreadId,
          portalUserId: seeded.userId,
          threadId: 'private:me',
        },
        {
          chatwootMessageId: 501,
          now: new Date('2026-06-01T09:00:00.000Z'),
          portalChatThreadId: seeded.privateThreadId,
          portalUserId: seeded.userId,
          threadId: 'private:me',
        },
        {
          chatwootMessageId: 601,
          now: new Date('2026-06-01T09:01:00.000Z'),
          portalChatThreadId: seeded.groupThreadId,
          portalUserId: seeded.userId,
          threadId: 'group:154',
        },
      ])

      await expect(
        repository.countUnreadByThread({
          portalUserId: seeded.userId,
          threadIds: ['private:me', 'group:154', 'group:155'],
        }),
      ).resolves.toEqual(
        new Map([
          ['private:me', 1],
          ['group:154', 1],
          ['group:155', 0],
        ]),
      )
    } finally {
      await seeded.database.close()
    }
  })

  it('clears only the opened thread and returns the remaining total', async () => {
    const seeded = await seedUserAndThreads()
    const repository = createChatUnreadRepository(seeded.database.db, {
      tenantId: seeded.tenantId,
    })

    try {
      await repository.insertUnreadMessages([
        {
          chatwootMessageId: 501,
          now: new Date('2026-06-01T09:00:00.000Z'),
          portalChatThreadId: seeded.privateThreadId,
          portalUserId: seeded.userId,
          threadId: 'private:me',
        },
        {
          chatwootMessageId: 601,
          now: new Date('2026-06-01T09:01:00.000Z'),
          portalChatThreadId: seeded.groupThreadId,
          portalUserId: seeded.userId,
          threadId: 'group:154',
        },
      ])

      await expect(
        repository.clearThreadUnread({
          portalUserId: seeded.userId,
          threadId: 'group:154',
        }),
      ).resolves.toEqual({ totalUnreadCount: 1 })

      await expect(
        repository.countUnreadByThread({
          portalUserId: seeded.userId,
          threadIds: ['private:me', 'group:154'],
        }),
      ).resolves.toEqual(
        new Map([
          ['private:me', 1],
          ['group:154', 0],
        ]),
      )
    } finally {
      await seeded.database.close()
    }
  })
})
```

- [ ] **Step 2: Run repository tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-unread/repository.test.ts
```

Expected: FAIL because `chat-unread/repository.ts` and the DB table do not exist yet.

- [ ] **Step 3: Add Drizzle table**

In `backend/src/db/notificationSchema.ts`, add `portalChatUnreadMessages` near `portalPushDeliveries`:

```ts
export const portalChatUnreadMessages = pgTable(
  'portal_chat_unread_messages',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, { onDelete: 'restrict' }),
    portalUserId: integer('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, { onDelete: 'cascade' }),
    portalChatThreadId: integer('portal_chat_thread_id').references(
      () => portalChatThreads.id,
      { onDelete: 'set null' },
    ),
    threadId: text('thread_id').notNull(),
    chatwootMessageId: integer('chatwoot_message_id').notNull(),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_chat_unread_messages_message_unique').on(
      table.tenantId,
      table.portalUserId,
      table.threadId,
      table.chatwootMessageId,
    ),
    index('portal_chat_unread_messages_tenant_user_thread_idx').on(
      table.tenantId,
      table.portalUserId,
      table.threadId,
    ),
    index('portal_chat_unread_messages_tenant_user_created_at_idx').on(
      table.tenantId,
      table.portalUserId,
      table.createdAt,
    ),
  ],
)
```

Verify `backend/src/db/schema.ts` still exports `notificationSchema.js`.

- [ ] **Step 4: Generate migration**

Run:

```bash
pnpm --dir backend db:generate
```

Expected: a new `backend/drizzle/0004_*.sql` plus updated meta files. Inspect the SQL and verify it creates only `portal_chat_unread_messages` and its indexes.

- [ ] **Step 5: Implement repository**

Create `backend/src/modules/chat-unread/repository.ts`:

```ts
import { and, count, eq, inArray } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalChatUnreadMessages } from '../../db/schema.js'

type TenantRepositoryScope = {
  tenantId: number
}

export type InsertUnreadMessageInput = {
  chatwootMessageId: number
  now: Date
  portalChatThreadId: number | null
  portalUserId: number
  threadId: string
}

function toCount(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export function createChatUnreadRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  async function countUnreadByThread({
    portalUserId,
    threadIds,
  }: {
    portalUserId: number
    threadIds: string[]
  }) {
    const result = new Map(threadIds.map((threadId) => [threadId, 0]))

    if (threadIds.length === 0) {
      return result
    }

    const rows = await db
      .select({
        threadId: portalChatUnreadMessages.threadId,
        unreadCount: count(),
      })
      .from(portalChatUnreadMessages)
      .where(
        and(
          eq(portalChatUnreadMessages.tenantId, tenantId),
          eq(portalChatUnreadMessages.portalUserId, portalUserId),
          inArray(portalChatUnreadMessages.threadId, threadIds),
        ),
      )
      .groupBy(portalChatUnreadMessages.threadId)

    for (const row of rows) {
      result.set(row.threadId, toCount(row.unreadCount))
    }

    return result
  }

  async function countTotalUnreadForUser(portalUserId: number) {
    const [row] = await db
      .select({ unreadCount: count() })
      .from(portalChatUnreadMessages)
      .where(
        and(
          eq(portalChatUnreadMessages.tenantId, tenantId),
          eq(portalChatUnreadMessages.portalUserId, portalUserId),
        ),
      )

    return toCount(row?.unreadCount)
  }

  return {
    async insertUnreadMessages(rows: InsertUnreadMessageInput[]) {
      if (rows.length === 0) {
        return
      }

      await db
        .insert(portalChatUnreadMessages)
        .values(
          rows.map((row) => ({
            chatwootMessageId: row.chatwootMessageId,
            createdAt: row.now,
            portalChatThreadId: row.portalChatThreadId,
            portalUserId: row.portalUserId,
            tenantId,
            threadId: row.threadId,
          })),
        )
        .onConflictDoNothing()
    },

    countUnreadByThread,

    countTotalUnreadForUser,

    async countThreadUnreadForUser({
      portalUserId,
      threadId,
    }: {
      portalUserId: number
      threadId: string
    }) {
      const counts = await countUnreadByThread({
        portalUserId,
        threadIds: [threadId],
      })

      return counts.get(threadId) ?? 0
    },

    async clearThreadUnread({
      portalUserId,
      threadId,
    }: {
      portalUserId: number
      threadId: string
    }) {
      await db
        .delete(portalChatUnreadMessages)
        .where(
          and(
            eq(portalChatUnreadMessages.tenantId, tenantId),
            eq(portalChatUnreadMessages.portalUserId, portalUserId),
            eq(portalChatUnreadMessages.threadId, threadId),
          ),
        )

      return {
        totalUnreadCount: await countTotalUnreadForUser(portalUserId),
      }
    },
  }
}

export type ChatUnreadRepository = ReturnType<typeof createChatUnreadRepository>
```

- [ ] **Step 6: Run repository tests and migration-backed DB smoke**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-unread/repository.test.ts src/test/testDatabase.cache.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/notificationSchema.ts backend/drizzle backend/src/modules/chat-unread/repository.ts backend/src/modules/chat-unread/repository.test.ts
git commit -m "feat: add chat unread repository"
```

## Task 2: Add Unread Service

**Files:**

- Create: `backend/src/modules/chat-unread/service.ts`
- Create: `backend/src/modules/chat-unread/service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `backend/src/modules/chat-unread/service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { createChatUnreadService } from './service.js'

const threadMapping = {
  chatwootConversationId: 101,
  portalChatThreadId: 22,
  threadId: 'group:154',
  threadType: 'group',
  userId: null,
} as const

function createRepository() {
  return {
    clearThreadUnread: vi.fn(async () => ({ totalUnreadCount: 3 })),
    countThreadUnreadForUser: vi.fn(async () => 2),
    countTotalUnreadForUser: vi.fn(async () => 5),
    countUnreadByThread: vi.fn(async () => new Map([['group:154', 2]])),
    insertUnreadMessages: vi.fn(async () => undefined),
  }
}

function createRecipientResolver() {
  return {
    resolveRecipients: vi.fn(async () => [
      {
        portalChatThreadId: 22,
        portalUserId: 7,
        threadId: 'group:154',
        threadTitle: 'ООО Ромашка',
        threadType: 'group' as const,
      },
      {
        portalChatThreadId: 22,
        portalUserId: 8,
        threadId: 'group:154',
        threadTitle: 'ООО Ромашка',
        threadType: 'group' as const,
      },
    ]),
  }
}

describe('createChatUnreadService', () => {
  it('records unread rows for every resolved recipient', async () => {
    const repository = createRepository()
    const recipientResolver = createRecipientResolver()
    const service = createChatUnreadService({
      now: () => new Date('2026-06-01T09:00:00.000Z'),
      recipientResolver,
      repository,
    })

    await expect(
      service.recordMessageCreatedUnread({
        chatwootMessageId: 601,
        threadMapping,
      }),
    ).resolves.toEqual({
      recipients: 2,
    })
    expect(repository.insertUnreadMessages).toHaveBeenCalledWith([
      {
        chatwootMessageId: 601,
        now: new Date('2026-06-01T09:00:00.000Z'),
        portalChatThreadId: 22,
        portalUserId: 7,
        threadId: 'group:154',
      },
      {
        chatwootMessageId: 601,
        now: new Date('2026-06-01T09:00:00.000Z'),
        portalChatThreadId: 22,
        portalUserId: 8,
        threadId: 'group:154',
      },
    ])
  })

  it('does not record unread when Chatwoot message id is missing', async () => {
    const repository = createRepository()
    const recipientResolver = createRecipientResolver()
    const service = createChatUnreadService({
      recipientResolver,
      repository,
    })

    await expect(
      service.recordMessageCreatedUnread({
        chatwootMessageId: null,
        threadMapping,
      }),
    ).resolves.toEqual({ recipients: 0 })
    expect(recipientResolver.resolveRecipients).not.toHaveBeenCalled()
    expect(repository.insertUnreadMessages).not.toHaveBeenCalled()
  })

  it('clears a thread and returns the remaining total', async () => {
    const repository = createRepository()
    const service = createChatUnreadService({
      recipientResolver: createRecipientResolver(),
      repository,
    })

    await expect(
      service.clearOpenedThreadUnread({
        portalUserId: 7,
        threadId: 'group:154',
      }),
    ).resolves.toEqual({
      clearedThreadId: 'group:154',
      totalUnreadCount: 3,
    })
  })
})
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-unread/service.test.ts
```

Expected: FAIL because `service.ts` does not exist.

- [ ] **Step 3: Implement service**

Create `backend/src/modules/chat-unread/service.ts`:

```ts
import type { ChatNotificationRecipientResolver } from '../chat-notifications/recipientResolver.js'
import type { ChatUnreadRepository } from './repository.js'

type CreateChatUnreadServiceOptions = {
  now?: () => Date
  recipientResolver: Pick<
    ChatNotificationRecipientResolver,
    'resolveRecipients'
  >
  repository: Pick<
    ChatUnreadRepository,
    | 'clearThreadUnread'
    | 'countThreadUnreadForUser'
    | 'countTotalUnreadForUser'
    | 'countUnreadByThread'
    | 'insertUnreadMessages'
  >
}

export function createChatUnreadService({
  now = () => new Date(),
  recipientResolver,
  repository,
}: CreateChatUnreadServiceOptions) {
  return {
    async recordMessageCreatedUnread({
      chatwootMessageId,
      threadMapping,
    }: {
      chatwootMessageId: number | null
      threadMapping: Parameters<
        ChatNotificationRecipientResolver['resolveRecipients']
      >[0]['threadMapping']
    }) {
      if (chatwootMessageId === null) {
        return { recipients: 0 }
      }

      const recipients = await recipientResolver.resolveRecipients({
        chatwootMessageId,
        threadMapping,
      })
      const currentTime = now()

      await repository.insertUnreadMessages(
        recipients.map((recipient) => ({
          chatwootMessageId,
          now: currentTime,
          portalChatThreadId: recipient.portalChatThreadId,
          portalUserId: recipient.portalUserId,
          threadId: recipient.threadId,
        })),
      )

      return {
        recipients: recipients.length,
      }
    },

    async countUnreadByThread(input: {
      portalUserId: number
      threadIds: string[]
    }) {
      return repository.countUnreadByThread(input)
    },

    async countThreadUnreadForUser(input: {
      portalUserId: number
      threadId: string
    }) {
      return repository.countThreadUnreadForUser(input)
    },

    async countTotalUnreadForUser(portalUserId: number) {
      return repository.countTotalUnreadForUser(portalUserId)
    },

    async clearOpenedThreadUnread({
      portalUserId,
      threadId,
    }: {
      portalUserId: number
      threadId: string
    }) {
      const result = await repository.clearThreadUnread({
        portalUserId,
        threadId,
      })

      return {
        clearedThreadId: threadId,
        totalUnreadCount: result.totalUnreadCount,
      }
    },
  }
}

export type ChatUnreadService = ReturnType<typeof createChatUnreadService>
```

- [ ] **Step 4: Run service tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-unread/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/chat-unread/service.ts backend/src/modules/chat-unread/service.test.ts
git commit -m "feat: add chat unread service"
```

## Task 3: Integrate Unread Writes Into Webhooks

**Files:**

- Modify: `backend/src/modules/chatwoot-webhooks/service.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Add failing webhook tests**

In `backend/src/modules/chatwoot-webhooks/service.test.ts`, extend `createService` with an optional `chatUnreadService`:

```ts
type RecordMessageCreatedUnread = NonNullable<
  CreateChatwootWebhookServiceOptions['chatUnreadService']
>['recordMessageCreatedUnread']
```

Add tests:

```ts
it('records unread before push delivery for accepted message_created events', async () => {
  const recordMessageCreatedUnread = vi
    .fn<RecordMessageCreatedUnread>()
    .mockResolvedValue({ recipients: 1 })
  const deliverMessageCreated = vi
    .fn<DeliverMessageCreated>()
    .mockResolvedValue({
      expired: 0,
      failed: 0,
      recipients: 1,
      sent: 1,
      skipped: 0,
      subscriptions: 1,
    })
  const calls: string[] = []
  recordMessageCreatedUnread.mockImplementation(async () => {
    calls.push('unread')
    return { recipients: 1 }
  })
  deliverMessageCreated.mockImplementation(async () => {
    calls.push('push')
    return {
      expired: 0,
      failed: 0,
      recipients: 1,
      sent: 1,
      skipped: 0,
      subscriptions: 1,
    }
  })
  const { service } = createService({
    chatUnreadService: { recordMessageCreatedUnread },
    pushDeliveryService: { deliverMessageCreated },
  })

  await service.handleWebhook(
    createSignedWebhook({
      account: { id: 3 },
      conversation: { account_id: 3, id: 101, inbox_id: 9 },
      event: 'message_created',
      id: 501,
      inbox: { id: 9 },
      private: false,
    }),
  )

  expect(recordMessageCreatedUnread).toHaveBeenCalledWith({
    chatwootMessageId: 501,
    threadMapping: {
      chatwootConversationId: 101,
      portalChatThreadId: 1,
      threadId: 'private:me',
      threadType: 'private',
      userId: 7,
    },
  })
  expect(calls).toEqual(['unread', 'push'])
})

it('does not record unread for message_updated events', async () => {
  const recordMessageCreatedUnread = vi.fn<RecordMessageCreatedUnread>()
  const { service } = createService({
    chatUnreadService: { recordMessageCreatedUnread },
  })

  await service.handleWebhook(
    createSignedWebhook({
      account: { id: 3 },
      conversation: { account_id: 3, id: 101, inbox_id: 9 },
      event: 'message_updated',
      id: 501,
      inbox: { id: 9 },
      private: false,
    }),
  )

  expect(recordMessageCreatedUnread).not.toHaveBeenCalled()
})

it('does not mark a webhook accepted when unread write fails', async () => {
  const recordDelivery = vi.fn<RecordDelivery>().mockResolvedValue('recorded')
  const recordMessageCreatedUnread = vi
    .fn<RecordMessageCreatedUnread>()
    .mockRejectedValue(new Error('unread db unavailable'))
  const { service } = createService({
    chatUnreadService: { recordMessageCreatedUnread },
    recordDelivery,
  })

  await expect(
    service.handleWebhook(
      createSignedWebhook({
        account: { id: 3 },
        conversation: { account_id: 3, id: 101, inbox_id: 9 },
        event: 'message_created',
        id: 501,
        inbox: { id: 9 },
        private: false,
      }),
    ),
  ).rejects.toThrow('unread db unavailable')

  expect(recordDelivery).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: 'accepted' }),
  )
})
```

- [ ] **Step 2: Run webhook tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chatwoot-webhooks/service.test.ts
```

Expected: FAIL because `chatUnreadService` is not wired.

- [ ] **Step 3: Update webhook service options and ordering**

In `backend/src/modules/chatwoot-webhooks/service.ts`, add:

```ts
import type { ChatUnreadService } from '../chat-unread/service.js'
```

Extend `CreateChatwootWebhookServiceOptions`:

```ts
chatUnreadService?: Pick<ChatUnreadService, 'recordMessageCreatedUnread'>
```

After mapping is found and private/unmapped events have been filtered, but before recording accepted delivery as duplicate-safe accepted, call:

```ts
if (eventName === 'message_created' && chatUnreadService) {
  await chatUnreadService.recordMessageCreatedUnread({
    chatwootMessageId,
    threadMapping: mapping,
  })
}
```

Keep `message_updated` out of unread. Keep private Chatwoot messages out of unread. Keep realtime best-effort. Keep push best-effort.

The ordering must satisfy this invariant:

```text
If unread write fails, webhook is not recorded as accepted.
If Chatwoot retries, unread insert is idempotent by unique key.
```

- [ ] **Step 4: Wire service in app**

In `backend/src/app.ts`, import:

```ts
import { createChatUnreadRepository } from './modules/chat-unread/repository.js'
import { createChatUnreadService } from './modules/chat-unread/service.js'
```

Add a factory:

```ts
const createChatUnreadServiceForRequest = (request: FastifyRequest) => {
  const tenant = requireTenantContext(request)

  return createChatUnreadService({
    recipientResolver: createChatNotificationRecipientResolver({
      chatThreadsRepository: createChatThreadsRepository(database.db, {
        tenantId: tenant.id,
      }),
      chatwootClient: createChatwootClientForRequest(request),
      contactRepository: createChatThreadContactRepository(database.db, {
        tenantId: tenant.id,
      }),
    }),
    repository: createChatUnreadRepository(database.db, {
      tenantId: tenant.id,
    }),
  })
}
```

Pass `chatUnreadService: createChatUnreadServiceForRequest(request)` into `createChatwootWebhookService`.

- [ ] **Step 5: Run webhook tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chatwoot-webhooks/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.ts backend/src/modules/chatwoot-webhooks/service.ts backend/src/modules/chatwoot-webhooks/service.test.ts
git commit -m "feat: record chat unread from webhooks"
```

## Task 4: Expose Counts In Thread List And Clear On Message Snapshot

**Files:**

- Modify: `backend/src/modules/chat-threads/types.ts`
- Modify: `backend/src/modules/chat-threads/service.ts`
- Modify: `backend/src/modules/chat-threads/service.test.ts`
- Modify: `backend/src/modules/chat-messages/types.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/app.test.ts`

- [ ] **Step 1: Add failing thread-list service test**

In `backend/src/modules/chat-threads/service.test.ts`, add an unread service stub to `createService`:

```ts
const unreadService = {
  countUnreadByThread: vi.fn(
    async () =>
      new Map([
        ['private:me', 2],
        ['group:154', 5],
      ]),
  ),
}
```

Add test:

```ts
it('returns unread counts for private and group threads independently', async () => {
  const unreadService = {
    countUnreadByThread: vi.fn(
      async () =>
        new Map([
          ['private:me', 2],
          ['group:154', 5],
        ]),
    ),
  }
  const service = createService({ unreadService })

  await expect(
    service.listCurrentUserThreads({ userId: 7 }),
  ).resolves.toMatchObject({
    activeThreadId: 'private:me',
    totalUnreadCount: 7,
    threads: [
      {
        id: 'private:me',
        unreadCount: 2,
      },
      {
        id: 'group:154',
        unreadCount: 5,
      },
    ],
  })
  expect(unreadService.countUnreadByThread).toHaveBeenCalledWith({
    portalUserId: 7,
    threadIds: ['private:me', 'group:154'],
  })
})
```

- [ ] **Step 2: Add failing message clear service tests**

In `backend/src/modules/chat-messages/service.test.ts`, extend `createChatMessagesService` setup with:

```ts
const unreadService = {
  clearOpenedThreadUnread: vi.fn(async () => ({
    clearedThreadId: 'private:me',
    totalUnreadCount: 3,
  })),
}
```

Add tests:

```ts
it('clears unread after a successful latest snapshot', async () => {
  const unreadService = {
    clearOpenedThreadUnread: vi.fn(async () => ({
      clearedThreadId: 'private:me',
      totalUnreadCount: 3,
    })),
  }
  const chatwootClient = createChatwootClientStub({
    listConversationMessages: vi.fn().mockResolvedValue({
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
    }),
  })
  const service = createChatMessagesService({
    chatThreadsRepository: createChatThreadsRepositoryStub(),
    chatThreadsService: createChatThreadsServiceStub(),
    chatUnreadService: unreadService,
    chatwootClient,
  })

  await expect(
    service.getCurrentUserChatMessages({
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    unread: {
      clearedThreadId: 'private:me',
      totalUnreadCount: 3,
    },
  })
  expect(unreadService.clearOpenedThreadUnread).toHaveBeenCalledWith({
    portalUserId: 7,
    threadId: 'private:me',
  })
})

it('does not clear unread for older message pagination', async () => {
  const unreadService = {
    clearOpenedThreadUnread: vi.fn(async () => ({
      clearedThreadId: 'private:me',
      totalUnreadCount: 0,
    })),
  }
  const chatwootClient = createChatwootClientStub({
    listConversationMessages: vi.fn().mockResolvedValue({
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
    }),
  })
  const service = createChatMessagesService({
    chatThreadsRepository: createChatThreadsRepositoryStub(),
    chatThreadsService: createChatThreadsServiceStub(),
    chatUnreadService: unreadService,
    chatwootClient,
  })

  await service.getCurrentUserChatMessages({
    beforeMessageId: 205,
    threadId: 'private:me',
    userId: 7,
  })

  expect(unreadService.clearOpenedThreadUnread).not.toHaveBeenCalled()
})

it('fails closed when unread clear fails after a successful snapshot', async () => {
  const unreadService = {
    clearOpenedThreadUnread: vi
      .fn()
      .mockRejectedValue(new Error('clear failed')),
  }
  const chatwootClient = createChatwootClientStub({
    listConversationMessages: vi.fn().mockResolvedValue({
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
    }),
  })
  const service = createChatMessagesService({
    chatThreadsRepository: createChatThreadsRepositoryStub(),
    chatThreadsService: createChatThreadsServiceStub(),
    chatUnreadService: unreadService,
    chatwootClient,
  })

  await expect(
    service.getCurrentUserChatMessages({
      threadId: 'private:me',
      userId: 7,
    }),
  ).rejects.toThrow('clear failed')
})
```

- [ ] **Step 3: Run service tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/service.test.ts src/modules/chat-messages/service.test.ts
```

Expected: FAIL because response types do not contain unread metadata and services do not call unread service.

- [ ] **Step 4: Update backend public types**

In `backend/src/modules/chat-threads/types.ts`, add `unreadCount: number` to both `PublicChatThreadSummary` variants and `totalUnreadCount: number` to `CurrentUserChatThreads`.

Update builders:

```ts
export function buildPrivateThread(): PublicChatThreadSummary {
  return {
    avatarUrl: '/api/tenant/icons/icon-192.png',
    id: PRIVATE_CHAT_THREAD_ID,
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
    unreadCount: 0,
  }
}
```

```ts
export function buildGroupThread(
  contact: ChatwootContact,
): PublicChatThreadSummary {
  const threadId = `group:${contact.id}` as const

  return {
    avatarUrl: contact.avatarUrl ? buildPortalThreadAvatarUrl(threadId) : null,
    id: threadId,
    subtitle: 'Групповой чат',
    title: contact.name?.trim() || `Группа ${contact.id}`,
    type: 'group',
    unreadCount: 0,
  }
}
```

In `backend/src/modules/chat-messages/types.ts`, add:

```ts
export type ChatUnreadSummary = {
  clearedThreadId: string
  totalUnreadCount: number
}
```

And add `unread?: ChatUnreadSummary` to `ChatMessagesSnapshot`.

- [ ] **Step 5: Attach counts in thread service**

Extend `CreateChatThreadsServiceOptions` with:

```ts
chatUnreadService?: Pick<ChatUnreadService, 'countUnreadByThread'>
```

After building the `threads` array:

```ts
const unreadCounts =
  chatUnreadService === undefined
    ? new Map(threads.map((thread) => [thread.id, 0]))
    : await chatUnreadService.countUnreadByThread({
        portalUserId: userId,
        threadIds: threads.map((thread) => thread.id),
      })
const threadsWithUnread = threads.map((thread) => ({
  ...thread,
  unreadCount: unreadCounts.get(thread.id) ?? 0,
}))

return {
  activeThreadId: PRIVATE_CHAT_THREAD_ID,
  threads: threadsWithUnread,
  totalUnreadCount: threadsWithUnread.reduce(
    (total, thread) => total + thread.unreadCount,
    0,
  ),
}
```

This keeps stale DB rows for inaccessible groups out of the thread-list total.

- [ ] **Step 6: Clear unread in message service**

Extend `CreateChatMessagesServiceOptions` with:

```ts
chatUnreadService?: Pick<ChatUnreadService, 'clearOpenedThreadUnread'>
```

Add helper:

```ts
async function attachUnreadClearSummary({
  beforeMessageId,
  chatUnreadService,
  snapshot,
  threadId,
  userId,
}: {
  beforeMessageId: number | null
  chatUnreadService?: Pick<ChatUnreadService, 'clearOpenedThreadUnread'>
  snapshot: ChatMessagesSnapshot
  threadId: string
  userId: number
}): Promise<ChatMessagesSnapshot> {
  if (
    beforeMessageId !== null ||
    !chatUnreadService ||
    snapshot.result !== 'ready' ||
    snapshot.activeThread?.id !== threadId
  ) {
    return snapshot
  }

  const unread = await chatUnreadService.clearOpenedThreadUnread({
    portalUserId: userId,
    threadId,
  })

  return {
    ...snapshot,
    unread,
  }
}
```

Use it only for latest snapshot responses after Chatwoot messages have been fetched and mapped:

```ts
const snapshot = buildMessagesSnapshot(context, {
  hasMoreOlder: page.hasMoreOlder,
  messages: page.messages
    .map((message) => mapPortalMessage(message, messageMapperContext))
    .filter((message): message is PortalChatMessage => message !== null),
  nextOlderCursor: page.nextOlderCursor,
})

return attachUnreadClearSummary({
  beforeMessageId,
  chatUnreadService,
  snapshot,
  threadId,
  userId,
})
```

Do not call clear for `not_ready`, `unavailable`, failed Chatwoot requests, denied threads, or `beforeMessageId`.

- [ ] **Step 7: Wire unread service into app factories**

In `backend/src/app.ts`:

- pass `chatUnreadService: createChatUnreadServiceForRequest(request)` to `createChatThreadsService`;
- pass `chatUnreadService: createChatUnreadServiceForRequest(request)` to `createChatMessagesService`.

Avoid creating a new unread service more than needed inside a single request factory if the code becomes noisy; correctness matters more than micro-optimization.

- [ ] **Step 8: Add API integration assertions**

In `backend/src/app.test.ts` or focused route tests, add route-level assertions:

```ts
expect(threadListPayload).toMatchObject({
  totalUnreadCount: expect.any(Number),
  threads: expect.arrayContaining([
    expect.objectContaining({
      id: 'private:me',
      unreadCount: expect.any(Number),
    }),
  ]),
})
```

For message snapshot:

```ts
expect(messagesPayload).toMatchObject({
  unread: {
    clearedThreadId: 'private:me',
    totalUnreadCount: expect.any(Number),
  },
})
```

- [ ] **Step 9: Run backend API tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/service.test.ts src/modules/chat-messages/service.test.ts src/app.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/app.ts backend/src/modules/chat-threads backend/src/modules/chat-messages backend/src/app.test.ts
git commit -m "feat: expose chat unread counts"
```

## Task 5: Add Unread Counts To Push Payloads

**Files:**

- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.ts`
- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Add failing push payload tests**

In `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`, extend `createRepository` with:

```ts
countThreadUnreadForUser: vi.fn(async () => 6),
countTotalUnreadForUser: vi.fn(async () => 9),
```

Update the generic payload test to expect:

```ts
expect(transport.sendNotification).toHaveBeenCalledWith(
  expect.any(Object),
  JSON.stringify({
    chatwootMessageId: 9001,
    notificationTag: 'portal-chat-message-default-9001',
    portalUserId: 7,
    tenantSlug: 'default',
    threadId: 'private:me',
    threadTitle: 'Личный чат',
    threadType: 'private',
    threadUnreadCount: 6,
    totalUnreadCount: 9,
    type: 'chat_message',
    url: '/',
  }),
)
```

Add assertion that muted users do not need unread counts for payload:

```ts
expect(repository.countThreadUnreadForUser).not.toHaveBeenCalled()
expect(repository.countTotalUnreadForUser).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run push tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/pushDeliveryService.test.ts
```

Expected: FAIL because payload lacks count fields.

- [ ] **Step 3: Update push delivery repository contract**

In `backend/src/modules/chat-notifications/pushDeliveryService.ts`, keep `PushDeliveryRepository` focused on notification settings/delivery rows and add a separate unread dependency:

```ts
unreadRepository: Pick<
  ChatUnreadRepository,
  'countThreadUnreadForUser' | 'countTotalUnreadForUser'
>
```

The implementation must read counts from `portal_chat_unread_messages`, not from push delivery state.

- [ ] **Step 4: Build payload with exact counts**

Change `buildPayload` input:

```ts
threadUnreadCount: number
totalUnreadCount: number
```

Before calling `buildPayload`, after effective settings allow push:

```ts
const [threadUnreadCount, totalUnreadCount] = await Promise.all([
  unreadRepository.countThreadUnreadForUser({
    portalUserId: recipient.portalUserId,
    threadId: recipient.threadId,
  }),
  unreadRepository.countTotalUnreadForUser(recipient.portalUserId),
])
```

Then include both counts in the JSON payload.

- [ ] **Step 5: Wire repository methods in app**

Pass the separate unread repository into `createChatNotificationPushDeliveryService`:

```ts
unreadRepository: createChatUnreadRepository(database.db, {
  tenantId: tenant.id,
}),
```

This keeps notification preferences/push delivery bookkeeping separated from unread persistence.

- [ ] **Step 6: Run push tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/pushDeliveryService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run combined webhook + push tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chatwoot-webhooks/service.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/app.ts backend/src/modules/chat-notifications/pushDeliveryService.ts backend/src/modules/chat-notifications/pushDeliveryService.test.ts
git commit -m "feat: include chat unread counts in push"
```

## Task 6: Update Frontend Types And App Badge Runtime

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/pages/chatPageState.ts`
- Modify: `frontend/src/pwa/serviceWorkerPushMessages.ts`
- Modify: `frontend/src/pwa/serviceWorkerRuntime.ts`
- Modify: `frontend/src/pwa/serviceWorkerRuntime.test.ts`

- [ ] **Step 1: Add failing runtime tests**

In `frontend/src/pwa/serviceWorkerRuntime.test.ts`, add exact badge setter coverage:

```ts
it('sets an exact app icon badge count and mirrors it to the service worker', async () => {
  const controller = new MockServiceWorker('activated')
  const registration = new MockServiceWorkerRegistration()
  setServiceWorkerContainer(
    new MockServiceWorkerContainer({
      controller: controller as unknown as ServiceWorker,
      registration: registration as unknown as ServiceWorkerRegistration,
    }),
  )
  const setAppBadge = vi.fn(async () => undefined)
  Object.defineProperty(globalThis.navigator, 'setAppBadge', {
    configurable: true,
    value: setAppBadge,
  })
  const runtime = await import('./serviceWorkerRuntime')

  await expect(runtime.setAppIconBadgeCount(9)).resolves.toBe(true)

  expect(setAppBadge).toHaveBeenCalledWith(9)
  expect(controller.postMessage).toHaveBeenCalledWith({
    count: 9,
    type: 'PORTAL_APP_BADGE_SET',
  })
})

it('clears the app icon badge when exact count is zero', async () => {
  const controller = new MockServiceWorker('activated')
  const registration = new MockServiceWorkerRegistration()
  setServiceWorkerContainer(
    new MockServiceWorkerContainer({
      controller: controller as unknown as ServiceWorker,
      registration: registration as unknown as ServiceWorkerRegistration,
    }),
  )
  const clearAppBadge = vi.fn(async () => undefined)
  Object.defineProperty(globalThis.navigator, 'clearAppBadge', {
    configurable: true,
    value: clearAppBadge,
  })
  const runtime = await import('./serviceWorkerRuntime')

  await expect(runtime.setAppIconBadgeCount(0)).resolves.toBe(true)

  expect(clearAppBadge).toHaveBeenCalled()
  expect(controller.postMessage).toHaveBeenCalledWith({
    count: 0,
    type: 'PORTAL_APP_BADGE_SET',
  })
})
```

- [ ] **Step 2: Run runtime test and verify it fails**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerRuntime.test.ts
```

Expected: FAIL because `setAppIconBadgeCount` does not exist.

- [ ] **Step 3: Update frontend response types**

In `frontend/src/features/chat/types.ts`, add `unreadCount: number` to both `ChatThreadSummary` variants.

Change `ChatThreadsResponse`:

```ts
export type ChatThreadsResponse = {
  activeThreadId: typeof PRIVATE_CHAT_THREAD_ID
  threads: ChatThreadSummary[]
  totalUnreadCount: number
}
```

Add:

```ts
export type ChatUnreadSummary = {
  clearedThreadId: string
  totalUnreadCount: number
}
```

Add to `ChatMessagesSnapshot`:

```ts
unread?: ChatUnreadSummary
```

- [ ] **Step 4: Add unread state helpers**

In `frontend/src/features/chat/pages/chatPageState.ts`, add:

```ts
export function applyThreadUnreadCount(
  threads: ChatThreadSummary[],
  {
    threadId,
    unreadCount,
  }: {
    threadId: string
    unreadCount: number
  },
) {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          unreadCount,
        }
      : thread,
  )
}

export function clearThreadUnreadCount(
  threads: ChatThreadSummary[],
  threadId: string,
) {
  return applyThreadUnreadCount(threads, {
    threadId,
    unreadCount: 0,
  })
}

export function getTotalUnreadCount(threads: ChatThreadSummary[]) {
  return threads.reduce((total, thread) => total + thread.unreadCount, 0)
}
```

- [ ] **Step 5: Parse unread counts in foreground push messages**

In `frontend/src/pwa/serviceWorkerPushMessages.ts`, add fields:

```ts
threadUnreadCount: number | null
totalUnreadCount: number | null
```

Parse with safe non-negative integer checks:

```ts
threadUnreadCount: Number.isSafeInteger(event.data.payload?.threadUnreadCount)
  ? Math.max(0, event.data.payload.threadUnreadCount)
  : null,
totalUnreadCount: Number.isSafeInteger(event.data.payload?.totalUnreadCount)
  ? Math.max(0, event.data.payload.totalUnreadCount)
  : null,
```

- [ ] **Step 6: Add exact badge runtime helper**

In `frontend/src/pwa/serviceWorkerRuntime.ts`, add:

```ts
type AppBadgingNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>
  setAppBadge?: (contents?: number) => Promise<void>
}

export async function setAppIconBadgeCount(totalUnreadCount: number) {
  const normalizedCount = Math.max(0, Math.trunc(totalUnreadCount))

  if (normalizedCount === 0) {
    const didClearBrowserBadge = await clearAppIconBadge()
    const didRequestWorkerSet = await postSetAppBadgeMessage(0)

    return didClearBrowserBadge || didRequestWorkerSet
  }

  let didSetBrowserBadge = false
  const setAppBadge = (navigator as AppBadgingNavigator | undefined)
    ?.setAppBadge

  if (typeof navigator !== 'undefined' && typeof setAppBadge === 'function') {
    try {
      await setAppBadge.call(navigator, normalizedCount)
      didSetBrowserBadge = true
    } catch {
      didSetBrowserBadge = false
    }
  }

  const didRequestWorkerSet = await postSetAppBadgeMessage(normalizedCount)

  return didSetBrowserBadge || didRequestWorkerSet
}

async function postSetAppBadgeMessage(count: number) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  const message = {
    count,
    type: 'PORTAL_APP_BADGE_SET',
  }

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message)
    return true
  }

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS)
    }),
  ])

  if (!registration?.active) {
    return false
  }

  registration.active.postMessage(message)
  return true
}
```

If this duplicates logic from `postClearAppBadgeMessage`, refactor only enough to share worker message posting. Do not change unrelated service worker lifecycle behavior.

- [ ] **Step 7: Run frontend type/runtime tests**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerRuntime.test.ts
pnpm --dir frontend typecheck
```

Expected after fixture updates: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/chat/types.ts frontend/src/features/chat/pages/chatPageState.ts frontend/src/pwa/serviceWorkerPushMessages.ts frontend/src/pwa/serviceWorkerRuntime.ts frontend/src/pwa/serviceWorkerRuntime.test.ts
git commit -m "feat: add frontend unread count types"
```

## Task 7: Replace Local Chat Unread Markers With Server Counts

**Files:**

- Delete: `frontend/src/features/chat/pages/useChatUnreadThreadMarkers.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/useChatPageNotifications.ts`
- Modify: `frontend/src/features/chat/pages/useChatThreadSelection.ts`
- Modify: `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts`
- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/ChatHeader.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`

- [ ] **Step 1: Convert ChatHeader tests to numeric badges**

In `frontend/src/features/chat/components/ChatHeader.test.tsx`, add or update tests so threads have `unreadCount`.

Expected assertions:

```ts
expect(screen.getByText('5')).toBeInTheDocument()
expect(
  screen.getByLabelText('ООО Ромашка, 5 непрочитанных'),
).toBeInTheDocument()
expect(
  screen.queryByTestId('thread-unread-dot-group:154'),
).not.toBeInTheDocument()
```

For large counts:

```ts
expect(screen.getByText('99+')).toBeInTheDocument()
```

- [ ] **Step 2: Convert ChatPage unread tests**

In `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`:

- remove expectations for `clearAppIconBadge` on mount/visibility;
- mock `setAppIconBadgeCount`;
- update `createThreadsResponse()`:

```ts
function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    totalUnreadCount: 5,
    threads: [
      { ...privateThread, unreadCount: 0 },
      { ...groupThread, unreadCount: 5 },
    ],
  }
}
```

Add test cases:

```text
Thread menu shows numeric unread badge from /api/chat/threads.
Opening group:154 clears only group:154 after /api/chat/messages returns unread.totalUnreadCount.
private:me unread count remains when group:154 is opened.
Push for another thread applies threadUnreadCount and totalUnreadCount.
Push for active thread refreshes snapshot and does not create a local marker.
Offline cached chat does not clear unread or app badge.
```

- [ ] **Step 3: Run frontend tests and verify they fail**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatHeader.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx
```

Expected: FAIL because UI still uses local `unreadThreadIds` and `clearAppIconBadge`.

- [ ] **Step 4: Render numeric badges in ChatHeader**

In `frontend/src/features/chat/components/ChatHeader.tsx`:

- remove `unreadThreadIds` prop and `EMPTY_UNREAD_THREAD_IDS`;
- compute `const unreadCount = thread.unreadCount`;
- replace red dot with compact text badge:

```tsx
{
  unreadCount > 0 ? (
    <span
      aria-label={`${thread.title}, ${unreadCount} непрочитанных`}
      className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-white"
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  ) : null
}
```

Keep text inside the menu item from overflowing. The badge must not resize the menu unpredictably.

- [ ] **Step 5: Remove old local marker hook from ChatPage**

In `frontend/src/features/chat/pages/ChatPage.tsx`:

- remove `clearAppIconBadge` import;
- remove `useChatUnreadThreadMarkers` import;
- remove `void clearAppIconBadge()` on mount;
- remove visibility handler that clears badge;
- remove:

```ts
const { markUnreadThread, unreadThreadIds } =
  useChatUnreadThreadMarkers(pageState)
```

- stop passing `unreadThreadIds` to `ChatHeader`;
- delete `frontend/src/features/chat/pages/useChatUnreadThreadMarkers.ts`.

- [ ] **Step 6: Apply server counts on initial load and open**

In `frontend/src/features/chat/pages/useChatThreadSelection.ts`, import:

```ts
import { setAppIconBadgeCount } from '../../../pwa/serviceWorkerRuntime'
```

After `getChatThreads` succeeds:

```ts
void setAppIconBadgeCount(threadsResponse.totalUnreadCount)
```

After latest `getChatMessages` succeeds for selected/opened thread, if `snapshot.unread` exists:

```ts
void setAppIconBadgeCount(snapshot.unread.totalUnreadCount)
```

When setting page state after successful latest snapshot:

```ts
threads: snapshot.unread
  ? clearThreadUnreadCount(threadsResponse.threads, snapshot.unread.clearedThreadId)
  : threadsResponse.threads,
```

Do not do this for cached fallback.

- [ ] **Step 7: Apply server counts on snapshot refresh**

In `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts`, after `latestSnapshot` succeeds:

```ts
if (latestSnapshot.unread) {
  void setAppIconBadgeCount(latestSnapshot.unread.totalUnreadCount)
}
```

When updating state for the same selected thread:

```ts
const nextThreads = latestSnapshot.unread
  ? clearThreadUnreadCount(
      currentState.threads,
      latestSnapshot.unread.clearedThreadId,
    )
  : currentState.threads
```

Use `nextThreads` in both merge and replace branches.

- [ ] **Step 8: Apply push counts without local markers**

In `frontend/src/features/chat/pages/useChatPageNotifications.ts`, replace `onOtherThreadPush` with:

```ts
onUnreadPush: (payload: PortalPushMessagePayload) => void
```

For another thread:

```ts
onUnreadPush(payload)
return false
```

In `ChatPage.tsx`, pass a callback:

```ts
onUnreadPush: (payload) => {
  if (payload.threadId && payload.threadUnreadCount !== null) {
    setPageState((currentState) => ({
      ...currentState,
      threads: applyThreadUnreadCount(currentState.threads, {
        threadId: payload.threadId!,
        unreadCount: payload.threadUnreadCount!,
      }),
    }))
  }

  if (payload.totalUnreadCount !== null) {
    void setAppIconBadgeCount(payload.totalUnreadCount)
  }
}
```

If the pushed thread is not in the current thread list, `applyThreadUnreadCount` leaves the list unchanged and the app badge still uses `totalUnreadCount`.

- [ ] **Step 9: Run targeted frontend tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatHeader.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx src/features/chat/pages/useChatPageNotifications.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Verify old implementation is gone**

Run:

```bash
rg -n "useChatUnreadThreadMarkers|unreadThreadIds|markUnreadThread|thread-unread-dot|clearAppIconBadge\\(\\)" frontend/src/features/chat frontend/src/pwa
```

Expected: no production references. `clearAppIconBadge` may remain in `serviceWorkerRuntime.ts` and its tests because exact zero uses it internally, but `ChatPage` must not call it unconditionally.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/features/chat frontend/src/pwa/serviceWorkerRuntime.ts frontend/src/pwa/serviceWorkerRuntime.test.ts
git rm frontend/src/features/chat/pages/useChatUnreadThreadMarkers.ts
git commit -m "feat: replace chat unread markers with server counts"
```

## Task 8: Make Service Worker Badge Exact

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/src/pwa/serviceWorkerAsset.test.ts`

- [ ] **Step 1: Add failing service worker tests**

In `frontend/src/pwa/serviceWorkerAsset.test.ts`, replace local increment tests with exact count tests:

```ts
it('sets the app icon badge to the server total unread count', async () => {
  const setAppBadge = vi.fn(async () => undefined)
  const { listeners } = loadServiceWorker({
    appBadge: { setAppBadge },
  })
  const pushListener = listeners.get('push')?.[0]

  await dispatchPush(pushListener!, {
    notificationTag: 'portal-chat-message-default-9010',
    tenantSlug: 'default',
    totalUnreadCount: 9,
    type: 'chat_message',
    url: '/',
  })

  expect(setAppBadge).toHaveBeenCalledWith(9)
})

it('clears the app icon badge when server total unread count is zero', async () => {
  const clearAppBadge = vi.fn(async () => undefined)
  const { listeners } = loadServiceWorker({
    appBadge: { clearAppBadge },
  })
  const pushListener = listeners.get('push')?.[0]

  await dispatchPush(pushListener!, {
    notificationTag: 'portal-chat-message-default-9011',
    tenantSlug: 'default',
    totalUnreadCount: 0,
    type: 'chat_message',
    url: '/',
  })

  expect(clearAppBadge).toHaveBeenCalled()
})
```

Update active-client suppression test so a visible active client does not call local increment. If the client handles the push, the foreground app will refresh snapshot and set exact badge from the backend response.

- [ ] **Step 2: Run service worker tests and verify they fail**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerAsset.test.ts
```

Expected: FAIL because worker still increments locally.

- [ ] **Step 3: Parse count fields in `readPushPayload`**

In `frontend/public/sw.js`, add:

```js
threadUnreadCount: Number.isSafeInteger(payload.threadUnreadCount)
  ? Math.max(0, payload.threadUnreadCount)
  : null,
totalUnreadCount: Number.isSafeInteger(payload.totalUnreadCount)
  ? Math.max(0, payload.totalUnreadCount)
  : null,
```

Also add null defaults for the no-data payload branch.

- [ ] **Step 4: Replace local increment with exact setter**

Change `handlePushEvent`:

```js
await setAppIconBadge(payload)
```

Replace `setAppIconBadge()` implementation:

```js
async function setAppIconBadge(payload) {
  if (!Number.isSafeInteger(payload.totalUnreadCount)) {
    return
  }

  const totalUnreadCount = Math.max(0, payload.totalUnreadCount)

  try {
    await runAppBadgeMutation(async () => {
      fallbackAppBadgeCount = totalUnreadCount
      await writePersistedAppBadgeCount(totalUnreadCount)

      if (
        typeof navigator === 'undefined' ||
        typeof navigator.setAppBadge !== 'function'
      ) {
        return
      }

      if (totalUnreadCount === 0) {
        if (typeof navigator.clearAppBadge === 'function') {
          await navigator.clearAppBadge()
        } else {
          await navigator.setAppBadge(0)
        }
        return
      }

      await navigator.setAppBadge(totalUnreadCount)
    })
  } catch {
    // App badge support and permission behavior differs by browser/platform.
  }
}
```

Add message handling for foreground exact set:

```js
if (event.data?.type === 'PORTAL_APP_BADGE_SET') {
  const count = Number.isSafeInteger(event.data.count)
    ? Math.max(0, event.data.count)
    : 0
  event.waitUntil(setAppIconBadge({ totalUnreadCount: count }))
  return
}
```

Keep `PORTAL_APP_BADGE_CLEAR` as compatibility for `clearAppIconBadge`.

- [ ] **Step 5: Remove legacy increment dependency**

Run:

```bash
rg -n "incrementAppBadgeCount|sets an app icon badge when a system notification is shown|increments the local app icon badge count" frontend/public/sw.js frontend/src/pwa/serviceWorkerAsset.test.ts
```

Expected: no production references to `incrementAppBadgeCount`; old increment tests are gone or renamed to exact-count tests.

- [ ] **Step 6: Run service worker tests**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerAsset.test.ts src/pwa/serviceWorkerRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/public/sw.js frontend/src/pwa/serviceWorkerAsset.test.ts frontend/src/pwa/serviceWorkerRuntime.test.ts
git commit -m "feat: set app badge from server unread total"
```

## Task 9: Browser Flow Coverage

**Files:**

- Modify: `tests/e2e/chat-notifications.spec.ts`

- [ ] **Step 1: Add e2e test for menu badge and open clear**

In `tests/e2e/chat-notifications.spec.ts`, add a mocked API test:

```ts
test('chat menu shows server unread counts and clears opened thread only', async ({
  page,
}) => {
  await page.route('**/api/chat/threads', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        activeThreadId: 'private:me',
        totalUnreadCount: 8,
        threads: [
          {
            id: 'private:me',
            subtitle: 'Вы и поддержка',
            title: 'Личный чат',
            type: 'private',
            unreadCount: 2,
          },
          {
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО Ромашка',
            type: 'group',
            unreadCount: 5,
          },
          {
            id: 'group:155',
            subtitle: 'Групповой чат',
            title: 'ООО Василек',
            type: 'group',
            unreadCount: 1,
          },
        ],
      }),
    })
  })

  await page.route(
    '**/api/chat/messages?threadId=private%3Ame',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          activeThread: {
            id: 'private:me',
            subtitle: 'Вы и поддержка',
            title: 'Личный чат',
            type: 'private',
            unreadCount: 0,
          },
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
          reason: 'none',
          result: 'ready',
          unread: {
            clearedThreadId: 'private:me',
            totalUnreadCount: 6,
          },
        }),
      })
    },
  )

  await page.route(
    '**/api/chat/messages?threadId=group%3A154',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          activeThread: {
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО Ромашка',
            type: 'group',
            unreadCount: 0,
          },
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
          reason: 'none',
          result: 'ready',
          unread: {
            clearedThreadId: 'group:154',
            totalUnreadCount: 1,
          },
        }),
      })
    },
  )

  await page.goto('/chat')
  await page.getByRole('button', { name: 'Меню' }).click()
  await expect(page.getByText('5')).toBeVisible()
  await expect(page.getByText('1')).toBeVisible()

  await page.getByRole('menuitem', { name: /ООО Ромашка/ }).click()
  await page.getByRole('button', { name: 'Меню' }).click()
  await expect(
    page.getByRole('menuitem', { name: /ООО Ромашка/ }),
  ).not.toContainText('5')
  await expect(
    page.getByRole('menuitem', { name: /ООО Василек/ }),
  ).toContainText('1')
})
```

Adjust selectors to the actual login/session test helper used by this file. The test must prove that opening one group clears only that group.

- [ ] **Step 2: Run e2e test and verify it fails if frontend is incomplete**

Run:

```bash
pnpm test:e2e -- tests/e2e/chat-notifications.spec.ts
```

Expected after implementation: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/chat-notifications.spec.ts
git commit -m "test: cover chat unread browser flow"
```

## Task 10: Final Cleanup, Review, And Baseline Docs

**Files:**

- Modify: `docs/roadmap/work-log.md` only after the implementation is accepted as a durable baseline.
- Read: all files touched by this plan.

- [ ] **Step 1: Run no-legacy scan**

Run:

```bash
rg -n "useChatUnreadThreadMarkers|unreadThreadIds|markUnreadThread|thread-unread-dot|incrementAppBadgeCount" frontend/src frontend/public backend/src tests/e2e
```

Expected:

```text
No matches.
```

If tests mention old names in descriptions, rename the tests to the server unread behavior.

- [ ] **Step 2: Run backend targeted tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-unread/repository.test.ts src/modules/chat-unread/service.test.ts src/modules/chatwoot-webhooks/service.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts src/modules/chat-threads/service.test.ts src/modules/chat-messages/service.test.ts src/app.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run frontend targeted tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatHeader.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx src/features/chat/pages/useChatPageNotifications.test.tsx src/pwa/serviceWorkerAsset.test.ts src/pwa/serviceWorkerRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run required broad checks**

Run:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e -- tests/e2e/chat-notifications.spec.ts
```

Expected: PASS. If a broad check is blocked by environment readiness, record the exact blocker and run the closest targeted command that proves the changed layer.

- [ ] **Step 5: Code review the changed area**

Review these invariants manually:

```text
Unread writes happen after tenant/account/inbox/conversation mapping checks.
Unread writes do not happen for message_updated.
Unread writes do not happen for private Chatwoot messages.
Webhook accepted-dedupe cannot skip unread after an unread-write failure.
Duplicate webhooks are safe because unread insert is idempotent.
Thread list total sums only visible thread counts.
Opening group:154 clears group:154 only.
Older pagination does not clear unread.
Cached/offline chat path does not clear unread.
Push disabled does not disable unread writes.
Service worker sets badge from totalUnreadCount and does not increment locally.
Old React Set unread marker implementation is deleted.
```

- [ ] **Step 6: Update work log if this is accepted as baseline**

If all checks pass and the slice is accepted, update `docs/roadmap/work-log.md` with one short baseline entry:

```markdown
- Added server-owned chat unread state: backend stores per-user/thread/message
  unread rows, thread APIs expose exact counts, opening a chat clears that
  thread after a successful snapshot, and PWA badge uses server total unread.
```

Update the single `Recommended Next Step` block at the end of the file to the next product/architecture step.

- [ ] **Step 7: Final commit**

```bash
git add docs/roadmap/work-log.md
git commit -m "docs: record server unread baseline"
```

Skip this commit if `work-log.md` was not changed.

## Acceptance Checklist

- [ ] `portal_chat_unread_messages` exists with unique `(tenant_id, portal_user_id, thread_id, chatwoot_message_id)`.
- [ ] Webhook `message_created` creates unread rows for private and group recipients, excluding the author.
- [ ] Duplicate webhook/message id does not increase counts.
- [ ] `message_updated` and private Chatwoot messages do not create unread.
- [ ] `GET /api/chat/threads` returns `totalUnreadCount` and `threads[].unreadCount`.
- [ ] User with private plus multiple group chats sees independent counts.
- [ ] Latest successful `GET /api/chat/messages?threadId=...` clears only that thread.
- [ ] Failed, denied, unavailable, older-page, and cached/offline reads do not clear unread.
- [ ] Push payload includes `threadUnreadCount` and `totalUnreadCount`.
- [ ] Service worker sets/clears badge from server total, not push-event increments.
- [ ] `ChatHeader` renders numeric unread badges and hides badge for `0`.
- [ ] `useChatUnreadThreadMarkers` and old local dot marker wiring are deleted.
- [ ] Existing push notification delivery behavior still works.
- [ ] Targeted backend, frontend, service worker, and e2e tests pass.
