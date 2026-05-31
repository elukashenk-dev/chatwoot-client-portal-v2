# Server Unread State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight server-owned unread system for portal chat: per-user, per-thread counts for private and group chats, exact app badge total, and read reset after a successful backend snapshot.

**Architecture:** Backend stores one unread row per `(tenant, user, thread, Chatwoot message)` and is the only source of truth. Webhooks write unread rows idempotently before push counts are built; `GET /api/chat/threads` exposes visible-thread counts as the canonical unread total, and successful latest `GET /api/chat/messages` clears the opened thread fail-closed. Frontend removes local unread marker state and renders server counts from API/push payloads.

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
- This is a new product without real users; do not implement backward compatibility or migrations for legacy offline/startup chat cache records. Tests and fixtures must be updated to the new `unreadCount` shape.
- Treat `/api/chat/threads` as the visible unread source of truth. Every user-facing `totalUnreadCount` must equal the sum of `unreadCount` for threads the current user can currently see; do not count stale unread rows for inaccessible groups in app badge or push totals.
- Foreground unread refresh must not depend on push permission, active subscription, or `pushEnabled`. An opened portal refreshes `/api/chat/threads` on initial load, tab visibility resume, and a modest foreground interval while backend is reachable.
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
- `backend/src/modules/chat-notifications/pushDeliveryService.ts` - include exact visible-thread unread counts in push payload.
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
- `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.ts` - refresh visible unread counts while the portal is open, independent of push settings.
- `frontend/src/features/chat/pages/useChatThreadSelection.ts` - set exact app badge total after thread list and message snapshot.
- `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts` - apply unread summary after active thread refresh.
- `frontend/src/features/chat/components/ChatHeader.tsx` - render the menu-button red dot and numeric per-thread unread badges.
- `frontend/src/pwa/serviceWorkerPushMessages.ts` - parse unread counts in foreground push messages.
- `frontend/src/pwa/serviceWorkerRuntime.ts` - add exact app badge setter and remove ChatPage reliance on unconditional clear.
- `frontend/public/sw.js` - parse push counts and set badge to exact total instead of local increment.

Frontend tests to modify:

- `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx` - convert from local dot tests to server-count tests.
- `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx` - foreground refresh behavior when push is disabled.
- `frontend/src/features/chat/components/ChatHeader.test.tsx` - menu-button red dot, numeric badge rendering, and accessibility.
- `frontend/src/pwa/serviceWorkerAsset.test.ts` - exact app badge behavior.
- `frontend/src/pwa/serviceWorkerRuntime.test.ts` - exact badge runtime helper.
- Existing chat tests with thread fixtures - add `unreadCount: 0` or use test builders that set it.

E2E tests to modify or add:

- `tests/e2e/chat-notifications.spec.ts` - browser-level menu-button dot, menu badges, and open-thread clear behavior with mocked API/push payloads.

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

  it('clears the opened thread and returns visible total without counting hidden threads', async () => {
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
        {
          chatwootMessageId: 701,
          now: new Date('2026-06-01T09:02:00.000Z'),
          portalChatThreadId: seeded.groupThreadId,
          portalUserId: seeded.userId,
          threadId: 'group:203',
        },
      ])

      await expect(
        repository.clearThreadUnreadAndCountVisible({
          portalUserId: seeded.userId,
          threadId: 'group:154',
          visibleThreadIds: ['private:me', 'group:154'],
        }),
      ).resolves.toEqual({
        totalUnreadCount: 1,
      })

      await expect(
        repository.countUnreadByThread({
          portalUserId: seeded.userId,
          threadIds: ['private:me', 'group:154', 'group:203'],
        }),
      ).resolves.toEqual(
        new Map([
          ['private:me', 1],
          ['group:154', 0],
          ['group:203', 1],
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

    async clearThreadUnreadAndCountVisible({
      portalUserId,
      threadId,
      visibleThreadIds,
    }: {
      portalUserId: number
      threadId: string
      visibleThreadIds: string[]
    }) {
      return db.transaction(async (tx) => {
        await tx
          .delete(portalChatUnreadMessages)
          .where(
            and(
              eq(portalChatUnreadMessages.tenantId, tenantId),
              eq(portalChatUnreadMessages.portalUserId, portalUserId),
              eq(portalChatUnreadMessages.threadId, threadId),
            ),
          )

        if (visibleThreadIds.length === 0) {
          return { totalUnreadCount: 0 }
        }

        const rows = await tx
          .select({
            unreadCount: count(),
          })
          .from(portalChatUnreadMessages)
          .where(
            and(
              eq(portalChatUnreadMessages.tenantId, tenantId),
              eq(portalChatUnreadMessages.portalUserId, portalUserId),
              inArray(portalChatUnreadMessages.threadId, visibleThreadIds),
            ),
          )

        return {
          totalUnreadCount: toCount(rows[0]?.unreadCount),
        }
      })
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
    clearThreadUnreadAndCountVisible: vi.fn(async () => ({
      totalUnreadCount: 3,
    })),
    countThreadUnreadForUser: vi.fn(async () => 2),
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

  it('clears a thread and returns the cleared thread id with visible total', async () => {
    const repository = createRepository()
    const service = createChatUnreadService({
      recipientResolver: createRecipientResolver(),
      repository,
    })

    await expect(
      service.clearOpenedThreadUnread({
        portalUserId: 7,
        threadId: 'group:154',
        visibleThreadIds: ['private:me', 'group:154'],
      }),
    ).resolves.toEqual({
      clearedThreadId: 'group:154',
      totalUnreadCount: 3,
    })
    expect(repository.clearThreadUnreadAndCountVisible).toHaveBeenCalledWith({
      portalUserId: 7,
      threadId: 'group:154',
      visibleThreadIds: ['private:me', 'group:154'],
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
    | 'clearThreadUnreadAndCountVisible'
    | 'countThreadUnreadForUser'
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

    async clearOpenedThreadUnread({
      portalUserId,
      threadId,
      visibleThreadIds,
    }: {
      portalUserId: number
      threadId: string
      visibleThreadIds: string[]
    }) {
      const clearResult = await repository.clearThreadUnreadAndCountVisible({
        portalUserId,
        threadId,
        visibleThreadIds,
      })

      return {
        clearedThreadId: threadId,
        totalUnreadCount: clearResult.totalUnreadCount,
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

it('excludes unread rows for inaccessible groups from totalUnreadCount', async () => {
  const unreadService = {
    countUnreadByThread: vi.fn(
      async () =>
        new Map([
          ['private:me', 2],
          ['group:154', 5],
        ]),
    ),
  }
  const service = createService({
    chatwootClient: createChatwootClientStub({ groupContactIds: '' }),
    unreadService,
  })

  await expect(service.listCurrentUserThreads({ userId: 7 })).resolves.toEqual({
    activeThreadId: 'private:me',
    threads: [
      expect.objectContaining({
        id: 'private:me',
        unreadCount: 2,
      }),
    ],
    totalUnreadCount: 2,
  })
  expect(unreadService.countUnreadByThread).toHaveBeenCalledWith({
    portalUserId: 7,
    threadIds: ['private:me'],
  })
})
```

- [ ] **Step 2: Add failing message clear service tests**

In `backend/src/modules/chat-messages/service.test.ts`, extend `createChatThreadsServiceStub` with the canonical thread-list total:

```ts
listCurrentUserThreads: vi.fn().mockResolvedValue({
  activeThreadId: 'private:me',
  threads: [
    {
      avatarUrl: '/api/tenant/icons/icon-192.png',
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
      unreadCount: 3,
    },
  ],
  totalUnreadCount: 3,
}),
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
  const chatThreadsService = createChatThreadsServiceStub()
  const chatwootClient = createChatwootClientStub({
    listConversationMessages: vi.fn().mockResolvedValue({
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
    }),
  })
  const service = createChatMessagesService({
    chatThreadsRepository: createChatThreadsRepositoryStub(),
    chatThreadsService,
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
    visibleThreadIds: ['private:me'],
  })
  expect(chatThreadsService.listCurrentUserThreads).toHaveBeenCalledWith({
    userId: 7,
  })
  expect(
    chatThreadsService.listCurrentUserThreads.mock.invocationCallOrder[0],
  ).toBeLessThan(
    unreadService.clearOpenedThreadUnread.mock.invocationCallOrder[0],
  )
})

it('does not clear unread for older message pagination', async () => {
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
chatThreadsService: Pick<
  ChatThreadsService,
  | 'ensureCurrentUserWritableThreadContext'
  | 'getCurrentUserThreadContext'
  | 'listCurrentUserThreads'
  | 'recoverCurrentUserWritableThreadContext'
>
chatUnreadService?: Pick<ChatUnreadService, 'clearOpenedThreadUnread'>
```

Add helper:

```ts
async function attachUnreadClearSummary({
  beforeMessageId,
  chatThreadsService,
  chatUnreadService,
  snapshot,
  threadId,
  userId,
}: {
  beforeMessageId: number | null
  chatThreadsService: Pick<ChatThreadsService, 'listCurrentUserThreads'>
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

  const visibleThreads = await chatThreadsService.listCurrentUserThreads({
    userId,
  })
  const visibleThreadIds = visibleThreads.threads.map((thread) => thread.id)

  if (!visibleThreadIds.includes(threadId)) {
    return snapshot
  }

  const unreadClear = await chatUnreadService.clearOpenedThreadUnread({
    portalUserId: userId,
    threadId,
    visibleThreadIds,
  })

  return {
    ...snapshot,
    unread: {
      clearedThreadId: unreadClear.clearedThreadId,
      totalUnreadCount: unreadClear.totalUnreadCount,
    },
  }
}
```

Important ordering: `listCurrentUserThreads` runs before clear only to capture
the visible thread ids. After `clearOpenedThreadUnread` starts, the endpoint must
not call Chatwoot or rebuild the current thread list to compute the response.
The clear service returns the post-clear visible total from the same DB operation
that deleted the opened thread unread rows.

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
  chatThreadsService,
  chatUnreadService,
  snapshot,
  threadId,
  userId,
})
```

Do not call clear for `not_ready`, `unavailable`, failed Chatwoot requests, denied threads, or `beforeMessageId`. The message response total must come from the same visible-thread path as `/api/chat/threads`, not from a raw "all unread rows for user" count.

- [ ] **Step 7: Wire unread service into app factories**

In `backend/src/app.ts`:

- pass `chatUnreadService: createChatUnreadServiceForRequest(request)` to `createChatThreadsService`;
- pass `chatUnreadService: createChatUnreadServiceForRequest(request)` to `createChatMessagesService`.
- ensure the same `createChatThreadsServiceForRequest(request)` factory is later passed to push delivery so push totals use the canonical visible thread list.

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

In `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`, add a visible thread-list stub:

```ts
function createChatThreadsService() {
  return {
    listCurrentUserThreads: vi.fn(async () => ({
      activeThreadId: 'private:me',
      threads: [
        {
          avatarUrl: '/api/tenant/icons/icon-192.png',
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private' as const,
          unreadCount: 6,
        },
        {
          avatarUrl: null,
          id: 'group:154' as const,
          subtitle: 'Групповой чат',
          title: 'ООО Ромашка',
          type: 'group' as const,
          unreadCount: 3,
        },
      ],
      totalUnreadCount: 9,
    })),
  }
}
```

Pass `chatThreadsService: createChatThreadsService()` in each existing
`createChatNotificationPushDeliveryService` test setup unless the test needs a
custom stub.

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

Add assertion that muted users do not need visible-thread totals for payload:

```ts
expect(chatThreadsService.listCurrentUserThreads).not.toHaveBeenCalled()
```

Add a defensive test for access drift:

```ts
it('skips delivery when the recipient no longer sees the pushed thread', async () => {
  const chatThreadsService = {
    listCurrentUserThreads: vi.fn(async () => ({
      activeThreadId: 'private:me',
      threads: [
        {
          avatarUrl: '/api/tenant/icons/icon-192.png',
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private' as const,
          unreadCount: 2,
        },
      ],
      totalUnreadCount: 2,
    })),
  }
  const service = createChatNotificationPushDeliveryService({
    chatThreadsService,
    recipientResolver: {
      resolveRecipients: vi.fn(async () => [
        {
          portalChatThreadId: 22,
          portalUserId: 7,
          threadId: 'group:154',
          threadTitle: 'ООО Ромашка',
          threadType: 'group' as const,
        },
      ]),
    },
    repository: createRepository(),
    transport: createTransport(),
  })

  await expect(
    service.deliverMessageCreated({
      chatwootMessageId: 9001,
      tenantSlug: 'default',
      threadMapping,
    }),
  ).resolves.toMatchObject({ skipped: 1, sent: 0 })
  expect(chatThreadsService.listCurrentUserThreads).toHaveBeenCalledWith({
    userId: 7,
  })
})
```

- [ ] **Step 2: Run push tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/pushDeliveryService.test.ts
```

Expected: FAIL because payload lacks count fields.

- [ ] **Step 3: Update push delivery service contract**

In `backend/src/modules/chat-notifications/pushDeliveryService.ts`, keep `PushDeliveryRepository` focused on notification settings/delivery rows and add the visible thread-list dependency:

```ts
chatThreadsService: Pick<ChatThreadsService, 'listCurrentUserThreads'>
```

The implementation must reuse the same visible-thread source of truth as `/api/chat/threads`. Do not add or call a raw `countTotalUnreadForUser` method for push payloads.

- [ ] **Step 4: Build payload with exact counts**

Change `buildPayload` input:

```ts
threadUnreadCount: number
totalUnreadCount: number
```

Before calling `buildPayload`, after effective settings allow push and after active subscriptions exist:

```ts
const subscriptions = await repository.listActivePushSubscriptions(
  recipient.portalUserId,
)
summary.subscriptions += subscriptions.length

if (subscriptions.length === 0) {
  continue
}

const currentThreads = await chatThreadsService.listCurrentUserThreads({
  userId: recipient.portalUserId,
})
const pushedThread = currentThreads.threads.find(
  (thread) => thread.id === recipient.threadId,
)

if (!pushedThread) {
  summary.skipped += 1
  continue
}

const threadUnreadCount = pushedThread.unreadCount
const totalUnreadCount = currentThreads.totalUnreadCount
```

Then include both counts in the JSON payload. This makes push `totalUnreadCount` match the menu-visible total instead of counting stale unread rows for inaccessible groups.

- [ ] **Step 5: Wire thread-list service in app**

Pass the request-scoped thread-list service into `createChatNotificationPushDeliveryService`:

```ts
chatThreadsService: createChatThreadsServiceForRequest(request),
```

This keeps notification preferences/push delivery bookkeeping separated from unread persistence and keeps one visible-count rule for `/api/chat/threads`, message clear summaries, and push payloads.

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

- [ ] **Step 7: Run runtime test**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 8: Do not commit yet**

Do not create a checkpoint commit at the end of this task. The required `unreadCount` type change intentionally breaks existing test fixtures until Task 7 updates them. Commit Task 6 and Task 7 together after typecheck passes.

## Task 7: Migrate Chat Thread Fixtures To The New Shape

**Files:**

- Modify: `frontend/src/features/chat/**/*.test.ts*`
- Modify: `frontend/src/features/auth/**/*.test.ts*`
- Modify: `frontend/src/features/offline/**/*.test.ts*`
- Modify: `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts`
- Modify: `backend/src/modules/chat-*/**/*.test.ts`
- Modify: `tests/e2e/*.spec.ts`

- [ ] **Step 1: Find all thread fixtures that need `unreadCount`**

Run:

```bash
rg -n "activeThread:\\s*\\{|const privateThread = \\{|const groupThread = \\{|satisfies NonNullable<ChatMessagesSnapshot\\['activeThread'\\]>|satisfies ChatThreadSummary|threads:\\s*\\[|activeThreadId: 'private:me'" backend/src frontend/src tests/e2e -S
```

Expected: a list of backend, frontend, pwa, offline and e2e tests that construct `ChatThreadSummary` or `ChatMessagesSnapshot.activeThread` objects.

- [ ] **Step 2: Update fixtures to include explicit unread counts**

For every private/group thread fixture, add `unreadCount: 0` unless the test is specifically about unread behavior.

Example:

```ts
const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
  unreadCount: 0,
} satisfies ChatThreadSummary
```

For thread list API fixture responses, add `totalUnreadCount: 0` unless the test is specifically about unread behavior:

```ts
return {
  activeThreadId: privateThread.id,
  threads: [privateThread],
  totalUnreadCount: 0,
}
```

This is not a runtime backward-compatibility migration. It only updates repository tests and mocked API responses to the new product contract.

- [ ] **Step 3: Update offline/startup cache tests to the new contract**

Update tests in:

```text
frontend/src/features/chat/pages/offlineChatCache.test.ts
frontend/src/features/offline/offlineStore.test.ts
frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx
```

Use `unreadCount: 0` in cached thread records and `totalUnreadCount: 0` in cached thread-list-like fixtures. Do not add logic that accepts old cached records without `unreadCount`.

- [ ] **Step 4: Run typecheck and affected fixture tests**

Run:

```bash
pnpm --dir frontend typecheck
pnpm --dir frontend test -- src/features/chat/pages/offlineChatCache.test.ts src/features/offline/offlineStore.test.ts src/features/chat/components/ChatHeader.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx src/pwa/serviceWorkerRuntime.test.ts
pnpm --dir backend test -- src/modules/chat-threads/service.test.ts src/modules/chat-messages/service.test.ts src/modules/chatwoot-webhooks/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6 and Task 7 together**

```bash
git add frontend/src/features frontend/src/pwa backend/src/modules tests/e2e
git commit -m "feat: add unread count frontend contract"
```

## Task 8: Replace Local Chat Unread Markers With Server Counts

**Files:**

- Delete: `frontend/src/features/chat/pages/useChatUnreadThreadMarkers.ts`
- Create: `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/useChatPageNotifications.ts`
- Modify: `frontend/src/features/chat/pages/useChatThreadSelection.ts`
- Modify: `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts`
- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/ChatHeader.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`

- [ ] **Step 1: Convert ChatHeader tests to menu dot and numeric badges**

In `frontend/src/features/chat/components/ChatHeader.test.tsx`, add or update tests so threads have `unreadCount`.

Expected assertions:

```ts
expect(
  screen.getByRole('button', {
    name: /есть непрочитанные сообщения/i,
  }),
).toBeInTheDocument()
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

Add a negative case: when only `selectedThreadId` has `unreadCount > 0`, the menu button red dot is hidden because the dot means "another chat needs attention".

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
Chat menu button shows a red dot when another thread has unread.
Chat menu button does not show a red dot when only the selected thread has unread.
Thread menu shows numeric unread badge from /api/chat/threads.
Opening group:154 clears only group:154 after /api/chat/messages returns unread.totalUnreadCount.
private:me unread count remains when group:154 is opened.
Push disabled: foreground /api/chat/threads refresh still shows menu red dot and numeric badge without a push event.
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

- [ ] **Step 4: Render menu-button dot and numeric badges in ChatHeader**

In `frontend/src/features/chat/components/ChatHeader.tsx`:

- remove `unreadThreadIds` prop and `EMPTY_UNREAD_THREAD_IDS`;
- compute menu-button attention from server counts:

```ts
const hasUnreadInAnotherThread = threads.some(
  (thread) => thread.id !== selectedThreadId && thread.unreadCount > 0,
)
```

- render a small red dot on the menu button when `hasUnreadInAnotherThread` is true:

```tsx
<button
  aria-expanded={isNavMenuOpen}
  aria-haspopup="menu"
  aria-label={
    hasUnreadInAnotherThread
      ? isNavMenuOpen
        ? 'Закрыть навигацию, есть непрочитанные сообщения'
        : 'Открыть навигацию, есть непрочитанные сообщения'
      : isNavMenuOpen
        ? 'Закрыть навигацию'
        : 'Открыть навигацию'
  }
  className="relative inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-slate-600 transition hover:bg-slate-100/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
>
  <MenuIcon className="h-6 w-6" />
  {hasUnreadInAnotherThread ? (
    <span
      aria-hidden="true"
      className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-600 shadow-[0_0_0_2px_white]"
      data-testid="chat-menu-unread-dot"
    />
  ) : null}
</button>
```

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

Keep text inside the menu item from overflowing. The badge must not resize the menu unpredictably. The menu-button dot is binary only; do not render a number on the menu button.

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

- [ ] **Step 8: Add foreground unread refresh independent of push**

Create `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.ts`:

```ts
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'

import { setAppIconBadgeCount } from '../../../pwa/serviceWorkerRuntime'
import { getChatThreads } from '../api/chatClient'
import type { ChatPageState } from './chatPageState'

const FOREGROUND_UNREAD_REFRESH_INTERVAL_MS = 45_000

type UseChatForegroundUnreadRefreshOptions = {
  enabled: boolean
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  onSelectedThreadUnavailable: () => void
  selectedThreadId: string | null
  setPageState: Dispatch<SetStateAction<ChatPageState>>
}

export function useChatForegroundUnreadRefresh({
  enabled,
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  onSelectedThreadUnavailable,
  selectedThreadId,
  setPageState,
}: UseChatForegroundUnreadRefreshOptions) {
  const isRefreshingRef = useRef(false)
  const selectedThreadIdRef = useRef(selectedThreadId)
  selectedThreadIdRef.current = selectedThreadId

  const refreshUnreadThreads = useCallback(async () => {
    if (!enabled || isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true

    try {
      const threadsResponse = await getChatThreads()

      if (!isMountedRef.current) {
        return
      }

      markBrowserOnline()
      void setAppIconBadgeCount(threadsResponse.totalUnreadCount)
      const currentSelectedThreadId = selectedThreadIdRef.current
      const selectedThreadStillVisible =
        currentSelectedThreadId === null ||
        threadsResponse.threads.some(
          (thread) => thread.id === currentSelectedThreadId,
        )

      if (!selectedThreadStillVisible) {
        onSelectedThreadUnavailable()
        return
      }

      setPageState((currentState) => {
        if (currentState.status !== 'ready') {
          return currentState
        }

        return {
          ...currentState,
          threads: threadsResponse.threads,
        }
      })
    } catch (error) {
      if (await handleUnauthorizedChatError(error)) {
        return
      }

      if (handleConnectionUnavailableError(error)) {
        return
      }

      throw error
    } finally {
      isRefreshingRef.current = false
    }
  }, [
    enabled,
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    onSelectedThreadUnavailable,
    setPageState,
  ])

  useEffect(() => {
    if (!enabled) {
      return
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refreshUnreadThreads()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshUnreadThreads()
      }
    }, FOREGROUND_UNREAD_REFRESH_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [enabled, refreshUnreadThreads])

  return {
    refreshUnreadThreads,
  }
}
```

Wire it in `frontend/src/features/chat/pages/ChatPage.tsx`:

```ts
import { useChatForegroundUnreadRefresh } from './useChatForegroundUnreadRefresh'
```

Call it after `useChatSnapshotRefresh`:

```ts
const handleSelectedThreadUnavailable = useCallback(() => {
  void loadInitialChat()
}, [loadInitialChat])

useChatForegroundUnreadRefresh({
  enabled:
    canUseBackend &&
    pageState.status === 'ready' &&
    !pageState.isUsingCachedData,
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline: markChatOnline,
  onSelectedThreadUnavailable: handleSelectedThreadUnavailable,
  selectedThreadId: pageState.selectedThreadId,
  setPageState,
})
```

Do not read `selectedThreadNotificationSettings`, browser push permission, service worker status, or `pushEnabled` in this hook. It is a foreground portal refresh, not a push feature. It must never clear unread; it only refreshes `/api/chat/threads`, updates visible thread counts, and sets exact app badge total from the thread-list response.

If the refreshed thread list no longer contains the selected thread, the hook
must not keep the old snapshot on screen. It should call
`onSelectedThreadUnavailable`, and `ChatPage` should delegate that to
`loadInitialChat()` so the normal initial load path selects the backend
`activeThreadId` and fetches its snapshot.

In `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`, add a foreground refresh test using the file's existing `fetchMock`, `createJsonResponse`, `createAuthenticatedUserResponse`, `createReadySnapshot`, `createNotificationSettingsResponse`, `createSupportAvailabilityResponse`, and `renderChatRoute` helpers.

If the file still only has a private thread fixture, add:

```ts
const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО Ромашка',
  type: 'group',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>
```

Then add:

```ts
it('refreshes unread menu indicators in the foreground when push is disabled', async () => {
  const user = userEvent.setup()
  let threadRequestCount = 0

  fetchMock.mockImplementation(async (input) => {
    const url = String(input)

    if (url === '/api/auth/me') {
      return createAuthenticatedUserResponse()
    }

    if (url === '/api/chat/threads') {
      threadRequestCount += 1

      return createJsonResponse({
        activeThreadId: privateThread.id,
        threads:
          threadRequestCount === 1
            ? [
                { ...privateThread, unreadCount: 0 },
                { ...groupThread, unreadCount: 0 },
              ]
            : [
                { ...privateThread, unreadCount: 0 },
                { ...groupThread, unreadCount: 2 },
              ],
        totalUnreadCount: threadRequestCount === 1 ? 0 : 2,
      })
    }

    if (url === '/api/chat/messages?threadId=private%3Ame') {
      return createJsonResponse(createReadySnapshot())
    }

    if (url === '/api/chat/threads/private%3Ame/notification-settings') {
      return createNotificationSettingsResponse()
    }

    if (url === '/api/chat/support-availability') {
      return createSupportAvailabilityResponse()
    }

    throw new Error(`Unexpected request: ${url}`)
  })

  renderChatRoute()
  await screen.findByText(
    'Здравствуйте, вижу ваше обращение.',
    {},
    CHAT_PAGE_LOAD_TIMEOUT,
  )

  act(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await waitFor(() => expect(threadRequestCount).toBeGreaterThanOrEqual(2))

  expect(
    await screen.findByRole('button', {
      name: /Открыть навигацию, есть непрочитанные сообщения/,
    }),
  ).toBeVisible()

  await user.click(
    screen.getByRole('button', {
      name: /Открыть навигацию, есть непрочитанные сообщения/,
    }),
  )
  expect(screen.getByRole('menuitem', { name: /ООО Ромашка/ })).toContainText(
    '2',
  )
})
```

If the test file does not already import them, add `act` to the existing
Testing Library React import and add `userEvent` from
`@testing-library/user-event`. The test must not dispatch a service worker push
message; it proves foreground unread refresh works with push disabled.

Add a companion runtime test for disappearing selected threads:

```text
Initial /api/chat/threads returns private:me + group:154.
The page is showing group:154 as the selected snapshot.
Foreground refresh /api/chat/threads returns only private:me and activeThreadId private:me.
The page calls the normal initial/snapshot load path and fetches /api/chat/messages?threadId=private%3Ame.
The old group:154 snapshot is not left as the active chat.
```

- [ ] **Step 9: Apply push counts without local markers**

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

If the pushed thread is not in the current thread list, `applyThreadUnreadCount` leaves the list unchanged and the app badge still uses `totalUnreadCount`. The backend payload total is already visible-authoritative; the menu-button red dot follows the current frontend thread list until the next `/api/chat/threads` refresh.

- [ ] **Step 10: Run targeted frontend tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatHeader.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx src/features/chat/pages/useChatPageNotifications.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Verify old implementation is gone**

Run:

```bash
rg -n "useChatUnreadThreadMarkers|unreadThreadIds|markUnreadThread|thread-unread-dot|clearAppIconBadge\\(\\)" frontend/src/features/chat frontend/src/pwa
```

Expected: no production references. `clearAppIconBadge` may remain in `serviceWorkerRuntime.ts` and its tests because exact zero uses it internally, but `ChatPage` must not call it unconditionally.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/features/chat frontend/src/pwa/serviceWorkerRuntime.ts frontend/src/pwa/serviceWorkerRuntime.test.ts
git rm frontend/src/features/chat/pages/useChatUnreadThreadMarkers.ts
git commit -m "feat: replace chat unread markers with server counts"
```

## Task 9: Make Service Worker Badge Exact

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

      if (typeof navigator === 'undefined') {
        return
      }

      if (totalUnreadCount === 0) {
        if (typeof navigator.clearAppBadge === 'function') {
          await navigator.clearAppBadge()
        } else if (typeof navigator.setAppBadge === 'function') {
          await navigator.setAppBadge(0)
        }
        return
      }

      if (typeof navigator.setAppBadge !== 'function') {
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

## Task 10: Browser Flow Coverage

**Files:**

- Modify: `tests/e2e/chat-notifications.spec.ts`

- [ ] **Step 1: Add e2e test for menu-button dot, menu badge, and open clear**

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

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(
    page.getByRole('button', {
      name: /Открыть навигацию, есть непрочитанные сообщения/,
    }),
  ).toBeVisible()
  await page
    .getByRole('button', {
      name: /Открыть навигацию, есть непрочитанные сообщения/,
    })
    .click()
  await expect(page.getByText('5')).toBeVisible()
  await expect(page.getByText('1')).toBeVisible()

  await page.getByRole('menuitem', { name: /ООО Ромашка/ }).click()
  await page
    .getByRole('button', {
      name: /Открыть навигацию, есть непрочитанные сообщения/,
    })
    .click()
  await expect(
    page.getByRole('menuitem', { name: /ООО Ромашка/ }),
  ).not.toContainText('5')
  await expect(
    page.getByRole('menuitem', { name: /ООО Василек/ }),
  ).toContainText('1')
})
```

Use the existing login helper from this file. The test must prove that opening one group clears only that group.

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

## Task 11: Final Cleanup, Review, And Baseline Docs

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
Message clear summary total sums only visible thread counts after clear.
Push payload total sums only visible thread counts and skips access-drifted threads.
Opening group:154 clears group:154 only.
Chat menu button red dot appears when another visible thread has unread and hides when no other visible thread has unread.
Older pagination does not clear unread.
Cached/offline chat path does not clear unread.
Push disabled does not disable unread writes.
Foreground unread refresh updates `/api/chat/threads` without checking push permission, push subscription, or pushEnabled.
Service worker sets badge from totalUnreadCount and does not increment locally.
Old React Set unread marker implementation is deleted.
```

- [ ] **Step 6: Update work log if this is accepted as baseline**

If all checks pass and the slice is accepted, update `docs/roadmap/work-log.md` with one short baseline entry:

```markdown
- Added server-owned chat unread state: backend stores per-user/thread/message
  unread rows, thread APIs expose exact counts, opening a chat clears that
  thread after a successful snapshot, the chat menu button signals unread in
  other chats, and PWA badge uses server total unread.
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
- [ ] `totalUnreadCount` equals the sum of visible `threads[].unreadCount`, not all unread DB rows for the user.
- [ ] User with private plus multiple group chats sees independent counts.
- [ ] Latest successful `GET /api/chat/messages?threadId=...` clears only that thread.
- [ ] Failed, denied, unavailable, older-page, and cached/offline reads do not clear unread.
- [ ] Push payload includes `threadUnreadCount` and `totalUnreadCount`.
- [ ] Push `totalUnreadCount` uses the same visible-thread total as `/api/chat/threads`.
- [ ] Opened portal refreshes unread menu indicators from `/api/chat/threads` even when push is disabled.
- [ ] Service worker sets/clears badge from server total, not push-event increments.
- [ ] `ChatHeader` renders a binary red dot on the menu button when another thread has unread.
- [ ] `ChatHeader` renders numeric unread badges inside the menu and hides per-thread badges for `0`.
- [ ] `useChatUnreadThreadMarkers` and old local dot marker wiring are deleted.
- [ ] Existing push notification delivery behavior still works.
- [ ] Targeted backend, frontend, service worker, and e2e tests pass.
