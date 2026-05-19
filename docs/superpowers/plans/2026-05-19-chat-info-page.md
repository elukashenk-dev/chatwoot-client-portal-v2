# Chat Info Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only full-screen `Информация о чате` page for the selected portal chat thread.

**Architecture:** Keep browser authority thread-id based. Backend extends the existing chat thread module with a read-only info endpoint that reuses tenant/session/thread validation and never creates Chatwoot conversations. Frontend opens a full-screen in-app panel from the existing chat menu and keeps `ChatPage.tsx` under the code-health line limit by moving UI into focused components.

**Tech Stack:** Fastify, Zod, Drizzle, Chatwoot Application API wrapper, React 19, React Router, Tailwind CSS 4, Vitest, Testing Library, Playwright.

---

## File Structure

- Modify `backend/src/modules/chat-threads/types.ts`: add public chat info response and participant types.
- Modify `backend/src/modules/chat-threads/contactRepository.ts`: add tenant-scoped active portal-user contact-link listing for safe group participants.
- Add `backend/src/modules/chat-threads/contactRepository.test.ts`: verify the participant source is tenant-scoped and active-user-only.
- Create `backend/src/modules/chat-threads/info.ts`: normalize `curator_name`, date mapping, labels, and safe participant selection.
- Modify `backend/src/modules/chat-threads/service.ts`: add `getCurrentUserThreadInfo`.
- Modify `backend/src/modules/chat-threads/routes.ts`: add `GET /api/chat/threads/:threadId/info`.
- Add tests in `backend/src/modules/chat-threads/info.test.ts`, `service.test.ts`, and `routes.test.ts`.
- Modify `frontend/src/features/chat/types.ts`: add chat info response types.
- Modify `frontend/src/features/chat/api/chatClient.ts`: add `getChatThreadInfo`.
- Create `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`: reusable full-screen chat-adjacent page shell for info, media/files, support center, profile, and future similar pages.
- Create `frontend/src/features/chat/components/ChatInfoPage.tsx`: chat-info-specific content rendered inside the reusable full-screen shell.
- Modify `frontend/src/features/chat/components/ChatHeader.tsx`: enable `Информация о чате` menu item.
- Create `frontend/src/features/chat/pages/useChatInfoPanel.ts`: own info-page loading, retry, and close state outside `ChatPage.tsx`.
- Modify `frontend/src/features/chat/pages/ChatPage.tsx`: call the info hook and render the full-screen page.
- Add frontend tests in `frontend/src/features/chat/components/ChatFullScreenPanel.test.tsx`, `frontend/src/features/chat/components/ChatInfoPage.test.tsx`, and `frontend/src/features/chat/pages/ChatPage.test.tsx`.
- Add Playwright coverage in the existing e2e suite for private/group info opening when local runtime fixtures support it; otherwise record the runtime blocker in `docs/roadmap/work-log.md`.
- Modify `docs/roadmap/work-log.md` only after implementation, review, fixes, and checks are complete.

---

### Task 1: Backend Chat Info Types And Pure Helpers

**Files:**

- Modify: `backend/src/modules/chat-threads/types.ts`
- Create: `backend/src/modules/chat-threads/info.ts`
- Test: `backend/src/modules/chat-threads/info.test.ts`

- [x] **Step 1: Add failing pure helper tests**

Create `backend/src/modules/chat-threads/info.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  buildChatThreadAccessLabel,
  buildChatThreadTypeLabel,
  normalizeChatInfoParticipantRows,
  readCuratorName,
  toIsoDateTime,
} from './info.js'

describe('chat thread info helpers', () => {
  it('reads a trimmed curator name only from string custom attributes', () => {
    expect(readCuratorName({ curator_name: ' Анна Маттина ' })).toBe(
      'Анна Маттина',
    )
    expect(readCuratorName({ curator_name: '' })).toBeNull()
    expect(readCuratorName({ curator_name: 42 })).toBeNull()
    expect(readCuratorName(null)).toBeNull()
  })

  it('maps thread labels without exposing implementation details', () => {
    expect(buildChatThreadTypeLabel('private')).toBe('Личный')
    expect(buildChatThreadTypeLabel('group')).toBe('Групповой')
    expect(buildChatThreadAccessLabel('private')).toBe('Только вы и поддержка')
    expect(buildChatThreadAccessLabel('group')).toBe(
      'Участники группы и поддержка',
    )
  })

  it('normalizes unix timestamps to ISO strings and keeps absent dates null', () => {
    expect(toIsoDateTime(1779148800)).toBe('2026-05-19T00:00:00.000Z')
    expect(toIsoDateTime(null)).toBeNull()
  })

  it('deduplicates and sorts safe participant rows with current user first', () => {
    expect(
      normalizeChatInfoParticipantRows([
        {
          displayName: 'Мария Соколова',
          email: 'maria@example.test',
          isCurrentUser: false,
          userId: 8,
        },
        {
          displayName: null,
          email: 'ivan@example.test',
          isCurrentUser: true,
          userId: 7,
        },
        {
          displayName: 'Мария Соколова',
          email: 'maria@example.test',
          isCurrentUser: false,
          userId: 8,
        },
      ]),
    ).toEqual([
      {
        displayName: 'ivan@example.test',
        id: 'portal-user:7',
        isCurrentUser: true,
      },
      {
        displayName: 'Мария Соколова',
        id: 'portal-user:8',
        isCurrentUser: false,
      },
    ])
  })
})
```

- [x] **Step 2: Run helper tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/info.test.ts
```

Expected: fail because `info.ts` does not exist.

- [x] **Step 3: Add chat info public types**

Append to `backend/src/modules/chat-threads/types.ts`:

```ts
export type PublicChatThreadInfoParticipant = {
  displayName: string
  id: `portal-user:${number}`
  isCurrentUser: boolean
}

export type PublicChatThreadInfo = {
  accessLabel: string
  activeThread: PublicChatThreadSummary | null
  curatorName: string | null
  lastActivityAt: string | null
  participants: PublicChatThreadInfoParticipant[]
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
  startedAt: string | null
  supportLabel: string
  threadTypeLabel: 'Групповой' | 'Личный' | null
}
```

- [x] **Step 4: Implement pure helpers**

Create `backend/src/modules/chat-threads/info.ts`:

```ts
import type {
  PublicChatThreadInfoParticipant,
  PublicChatThreadSummary,
} from './types.js'

type ChatInfoThreadType = PublicChatThreadSummary['type']

export type SafeChatInfoParticipantRow = {
  displayName: string | null
  email: string
  isCurrentUser: boolean
  userId: number
}

export function readCuratorName(
  customAttributes: Record<string, unknown> | null | undefined,
) {
  const value = customAttributes?.curator_name

  if (typeof value !== 'string') {
    return null
  }

  return value.trim() || null
}

export function buildChatThreadTypeLabel(threadType: ChatInfoThreadType) {
  return threadType === 'group' ? 'Групповой' : 'Личный'
}

export function buildChatThreadAccessLabel(threadType: ChatInfoThreadType) {
  return threadType === 'group'
    ? 'Участники группы и поддержка'
    : 'Только вы и поддержка'
}

export function toIsoDateTime(timestampSeconds: number | null | undefined) {
  return typeof timestampSeconds === 'number'
    ? new Date(timestampSeconds * 1000).toISOString()
    : null
}

function getParticipantDisplayName(row: SafeChatInfoParticipantRow) {
  return row.displayName?.trim() || row.email
}

export function normalizeChatInfoParticipantRows(
  rows: SafeChatInfoParticipantRow[],
): PublicChatThreadInfoParticipant[] {
  const participantsById = new Map<number, PublicChatThreadInfoParticipant>()

  for (const row of rows) {
    if (participantsById.has(row.userId)) {
      continue
    }

    participantsById.set(row.userId, {
      displayName: getParticipantDisplayName(row),
      id: `portal-user:${row.userId}`,
      isCurrentUser: row.isCurrentUser,
    })
  }

  return [...participantsById.values()].sort((left, right) => {
    if (left.isCurrentUser !== right.isCurrentUser) {
      return left.isCurrentUser ? -1 : 1
    }

    return left.displayName.localeCompare(right.displayName, 'ru')
  })
}
```

- [x] **Step 5: Run helper tests and verify they pass**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/info.test.ts
```

Expected: pass.

- [x] **Step 6: Check backend helper foundation**

Run:

```bash
git status --short
```

Expected: only current feature files are modified or untracked. Do not commit
yet; the project closure flow commits after implementation, review, checks, and
work-log update.

---

### Task 2: Backend Repository And Conversation Metadata Support

**Files:**

- Modify: `backend/src/modules/chat-threads/contactRepository.ts`
- Test: `backend/src/modules/chat-threads/contactRepository.test.ts`
- Test: `backend/src/modules/chat-threads/service.info.test.ts`

- [x] **Step 1: Add failing contact repository test**

Create `backend/src/modules/chat-threads/contactRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalUserContactLinks, portalUsers } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatThreadContactRepository } from './contactRepository.js'

async function createUser({
  database,
  email,
  fullName,
  isActive = true,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  fullName: string
  isActive?: boolean
  tenantId: number
}) {
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email,
      fullName,
      isActive,
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })
    .returning({
      id: portalUsers.id,
    })

  if (!user) {
    throw new Error('Failed to create test portal user.')
  }

  return user
}

describe('createChatThreadContactRepository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('lists only active contact links for the scoped tenant', async () => {
    const tenant = await seedTestTenant(database.db)
    const otherTenant = await seedTestTenant(database.db, {
      primaryDomain: 'other.localhost',
      slug: 'other',
    })
    const activeUser = await createUser({
      database,
      email: 'ivan@example.test',
      fullName: 'Иван Петров',
      tenantId: tenant.id,
    })
    const inactiveUser = await createUser({
      database,
      email: 'inactive@example.test',
      fullName: 'Отключенный пользователь',
      isActive: false,
      tenantId: tenant.id,
    })
    const otherTenantUser = await createUser({
      database,
      email: 'other@example.test',
      fullName: 'Другой tenant',
      tenantId: otherTenant.id,
    })
    const repository = createChatThreadContactRepository(database.db, {
      tenantId: tenant.id,
    })

    await database.db.insert(portalUserContactLinks).values([
      {
        chatwootContactId: 44,
        tenantId: tenant.id,
        userId: activeUser.id,
      },
      {
        chatwootContactId: 55,
        tenantId: tenant.id,
        userId: inactiveUser.id,
      },
      {
        chatwootContactId: 66,
        tenantId: otherTenant.id,
        userId: otherTenantUser.id,
      },
    ])

    await expect(
      repository.listActivePortalUserContactLinks(),
    ).resolves.toEqual([
      {
        chatwootContactId: 44,
        email: 'ivan@example.test',
        fullName: 'Иван Петров',
        userId: activeUser.id,
      },
    ])
  })
})
```

- [x] **Step 2: Run contact repository test and verify it fails**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/contactRepository.test.ts
```

Expected: fail because `listActivePortalUserContactLinks` is missing.

- [x] **Step 3: Add tenant-scoped active contact-link listing**

Modify `backend/src/modules/chat-threads/contactRepository.ts` imports:

```ts
import { and, eq } from 'drizzle-orm'
```

Add this method in the returned repository object:

```ts
async listActivePortalUserContactLinks() {
  return db
    .select({
      chatwootContactId: portalUserContactLinks.chatwootContactId,
      email: portalUsers.email,
      fullName: portalUsers.fullName,
      userId: portalUsers.id,
    })
    .from(portalUserContactLinks)
    .innerJoin(portalUsers, eq(portalUserContactLinks.userId, portalUsers.id))
    .where(
      and(
        eq(portalUserContactLinks.tenantId, tenantId),
        eq(portalUsers.tenantId, tenantId),
        eq(portalUsers.isActive, true),
      ),
    )
}
```

- [x] **Step 4: Keep Chatwoot client surface unchanged**

Use the existing `chatwootClient.listContactConversations(contactId)` method
from the chat-info service and select the persisted conversation id in the
service layer. Do not add a new method to
`backend/src/integrations/chatwoot/client.ts`; that file is at its code-health
baseline and this feature does not need a broader Chatwoot client API.

- [x] **Step 5: Run affected backend tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/contactRepository.test.ts
```

Expected: pass.

- [x] **Step 6: Check metadata and repository support**

Run:

```bash
git status --short
```

Expected: only current feature files are modified or untracked. Do not commit
yet.

---

### Task 3: Backend Chat Info Service And Route

**Files:**

- Modify: `backend/src/modules/chat-threads/service.ts`
- Modify: `backend/src/modules/chat-threads/routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/modules/chat-threads/service.info.test.ts`
- Test: `backend/src/modules/chat-threads/routes.test.ts`

- [x] **Step 1: Add failing service tests**

In `backend/src/modules/chat-threads/service.test.ts`, first extend the local
stubs:

```ts
type ChatwootClientStub = ChatThreadsServiceOptions['chatwootClient'] & {
  createContactInbox: ReturnType<typeof vi.fn>
  createConversation: ReturnType<typeof vi.fn>
  findContactByEmail: ReturnType<typeof vi.fn>
  findContactById: ReturnType<typeof vi.fn>
  findContactPortalInboxSourceId: ReturnType<typeof vi.fn>
  listContactConversations: ReturnType<typeof vi.fn>
}
```

Update `createRepositoryStub` to include `listActivePortalUserContactLinks` in
its picked keys and default object:

```ts
listActivePortalUserContactLinks: vi.fn().mockResolvedValue([]),
```

Update `createChatwootClientStub` default object:

```ts
listContactConversations: vi.fn().mockResolvedValue([]),
```

Then add these tests inside `describe('createChatThreadsService', () => { ... })`:

```ts
it('returns private chat info with person curator and no participants', async () => {
  const chatwootClient = createChatwootClientStub({
    overrides: {
      findContactById: vi.fn(async (contactId: number) =>
        contactId === 44
          ? {
              customAttributes: {
                curator_name: 'Анна Маттина',
                portal_client_group_contact_ids: '',
                portal_contact_type: 'person',
                portal_enabled: true,
              },
              email: 'ivan@example.com',
              id: 44,
              name: 'Иван Петров',
            }
          : null,
      ),
      listContactConversations: vi.fn().mockResolvedValue([
        {
          assigneeName: null,
          channelType: 'Channel::Api',
          createdAt: 1_779_182_400,
          id: 101,
          inboxId: 9,
          lastActivityAt: 1_779_186_000,
          status: 'open',
        },
      ]),
    },
  })
  const service = createService({
    chatThreadsRepository: createChatThreadsPersistenceRepositoryStub({
      initialPrivateConversationId: 101,
    }),
    chatwootClient,
  })

  await expect(
    service.getCurrentUserThreadInfo({
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    curatorName: 'Анна Маттина',
    lastActivityAt: '2026-05-19T10:20:00.000Z',
    participants: [],
    result: 'ready',
    startedAt: '2026-05-19T09:20:00.000Z',
    threadTypeLabel: 'Личный',
  })
  expect(chatwootClient.listContactConversations).toHaveBeenCalledWith(44)
  expect(chatwootClient.createConversation).not.toHaveBeenCalled()
})

it('returns group participants only for active portal users with current group access', async () => {
  const contactsById = new Map([
    [
      44,
      {
        customAttributes: {
          portal_client_group_contact_ids: '154',
          portal_contact_type: 'person',
          portal_enabled: true,
        },
        email: 'ivan@example.test',
        id: 44,
        name: 'Иван Петров',
      },
    ],
    [
      55,
      {
        customAttributes: {
          portal_client_group_contact_ids: '154',
          portal_contact_type: 'person',
          portal_enabled: true,
        },
        email: 'maria@example.test',
        id: 55,
        name: 'Мария Соколова',
      },
    ],
    [
      66,
      {
        customAttributes: {
          portal_client_group_contact_ids: '',
          portal_contact_type: 'person',
          portal_enabled: true,
        },
        email: 'denied@example.test',
        id: 66,
        name: 'Нет доступа',
      },
    ],
    [
      154,
      {
        customAttributes: {
          curator_name: 'Анна Маттина',
          portal_contact_type: 'group',
          portal_enabled: true,
        },
        email: 'office@romashka.test',
        id: 154,
        name: 'ООО "Ромашка"',
      },
    ],
  ])
  const chatwootClient = createChatwootClientStub({
    overrides: {
      findContactById: vi.fn(
        async (contactId: number) => contactsById.get(contactId) ?? null,
      ),
    },
  })
  const service = createService({
    chatwootClient,
    repository: createRepositoryStub({
      listActivePortalUserContactLinks: vi.fn().mockResolvedValue([
        {
          chatwootContactId: 44,
          email: 'ivan@example.test',
          fullName: 'Иван Петров',
          userId: 7,
        },
        {
          chatwootContactId: 55,
          email: 'maria@example.test',
          fullName: 'Мария Соколова',
          userId: 8,
        },
        {
          chatwootContactId: 66,
          email: 'denied@example.test',
          fullName: 'Нет доступа',
          userId: 9,
        },
      ]),
    }),
  })

  await expect(
    service.getCurrentUserThreadInfo({
      threadId: 'group:154',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    curatorName: 'Анна Маттина',
    participants: [
      {
        displayName: 'Иван Петров',
        id: 'portal-user:7',
        isCurrentUser: true,
      },
      {
        displayName: 'Мария Соколова',
        id: 'portal-user:8',
        isCurrentUser: false,
      },
    ],
    threadTypeLabel: 'Групповой',
  })
  expect(chatwootClient.createConversation).not.toHaveBeenCalled()
})
```

- [x] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/service.test.ts
```

Expected: fail because `getCurrentUserThreadInfo` is missing.

- [x] **Step 3: Extend service dependencies**

Modify `backend/src/modules/chat-threads/service.ts` repository picks:

```ts
type ChatThreadsContactRepository = Pick<
  ChatThreadContactRepository,
  | 'createContactLink'
  | 'findContactLinkByUserId'
  | 'findPortalUserById'
  | 'listActivePortalUserContactLinks'
>
```

Modify `ChatThreadsChatwootClient`:

```ts
type ChatThreadsChatwootClient = Pick<
  ChatwootClient,
  | 'createContactInbox'
  | 'createConversation'
  | 'findContactByEmail'
  | 'findContactById'
  | 'findContactPortalInboxSourceId'
  | 'listContactConversations'
>
```

- [x] **Step 4: Implement safe participant resolver**

In `backend/src/modules/chat-threads/service.ts`, import:

```ts
import {
  buildChatThreadAccessLabel,
  buildChatThreadTypeLabel,
  normalizeChatInfoParticipantRows,
  readCuratorName,
  toIsoDateTime,
  type SafeChatInfoParticipantRow,
} from './info.js'
```

Add inside `createChatThreadsService`:

```ts
async function listSafeGroupParticipants({
  currentUserId,
  groupContactId,
}: {
  currentUserId: number
  groupContactId: number
}) {
  const rows = await contactRepository.listActivePortalUserContactLinks()
  const participantRows: SafeChatInfoParticipantRow[] = []

  for (const row of rows) {
    const contact = await chatwootClient.findContactById(row.chatwootContactId)

    if (!contact) {
      continue
    }

    let attributes: ReturnType<typeof assertPortalPersonContactEnabled>

    try {
      attributes = assertPortalPersonContactEnabled(contact)
    } catch {
      continue
    }

    if (!attributes.groupContactIds.includes(groupContactId)) {
      continue
    }

    participantRows.push({
      displayName: row.fullName,
      email: row.email,
      isCurrentUser: row.userId === currentUserId,
      userId: row.userId,
    })
  }

  return normalizeChatInfoParticipantRows(participantRows)
}
```

- [x] **Step 5: Implement `getCurrentUserThreadInfo`**

Add to the returned service object:

```ts
async getCurrentUserThreadInfo({
  threadId,
  userId,
}: {
  threadId: string
  userId: number
}) {
  const context = await runtimeResolver.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (!context.activeThread || !context.threadType) {
    return {
      accessLabel: '',
      activeThread: null,
      curatorName: null,
      lastActivityAt: null,
      participants: [],
      reason: context.reason,
      result: context.result,
      startedAt: null,
      supportLabel: 'Команда поддержки',
      threadTypeLabel: null,
    }
  }

  const targetContact =
    context.targetChatwootContactId === null
      ? null
      : await chatwootClient.findContactById(context.targetChatwootContactId)
  const conversations =
    context.chatwootConversation && context.targetChatwootContactId !== null
      ? await chatwootClient.listContactConversations(
          context.targetChatwootContactId,
        )
      : []
  const conversation =
    context.chatwootConversation === null
      ? null
      : (conversations.find(
          (candidate) => candidate.id === context.chatwootConversation?.id,
        ) ?? null)
  const participants =
    context.threadType === 'group' && context.targetChatwootContactId !== null
      ? await listSafeGroupParticipants({
          currentUserId: userId,
          groupContactId: context.targetChatwootContactId,
        })
      : []

  return {
    accessLabel: buildChatThreadAccessLabel(context.threadType),
    activeThread: context.activeThread,
    curatorName: readCuratorName(targetContact?.customAttributes),
    lastActivityAt: toIsoDateTime(conversation?.lastActivityAt ?? null),
    participants,
    reason: context.reason,
    result:
      context.result === 'unavailable'
        ? 'unavailable'
        : context.activeThread
          ? 'ready'
          : context.result,
    startedAt: toIsoDateTime(conversation?.createdAt ?? null),
    supportLabel: 'Команда поддержки',
    threadTypeLabel: buildChatThreadTypeLabel(context.threadType),
  }
}
```

In `buildApp`, after implementation, replace `supportLabel` with tenant display name by passing it through service options:

```ts
supportLabel: `Команда ${tenant.displayName}`,
```

- [x] **Step 6: Add route test**

In `backend/src/modules/chat-threads/routes.test.ts`, extend the mock service pick and add:

```ts
it('returns current user chat thread info', async () => {
  const getCurrentUserThreadInfo = vi.fn().mockResolvedValue({
    accessLabel: 'Только вы и поддержка',
    activeThread: {
      id: 'private:me',
      subtitle: 'Только вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    curatorName: 'Анна Маттина',
    lastActivityAt: '2026-05-19T00:00:00.000Z',
    participants: [],
    reason: 'none',
    result: 'ready',
    startedAt: '2026-05-18T00:00:00.000Z',
    supportLabel: 'Команда Local Test Tenant',
    threadTypeLabel: 'Личный',
  })
  const { app } = await buildThreadsRoutesTestApp({
    getCurrentUserThreadInfo,
  })

  try {
    const response = await app.inject({
      headers: {
        cookie: createAuthorizedCookie(app),
      },
      method: 'GET',
      url: '/api/chat/threads/private%3Ame/info',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      curatorName: 'Анна Маттина',
      threadTypeLabel: 'Личный',
    })
    expect(getCurrentUserThreadInfo).toHaveBeenCalledWith({
      threadId: 'private:me',
      userId: 7,
    })
  } finally {
    await app.close()
  }
})
```

- [x] **Step 7: Implement route**

Modify `backend/src/modules/chat-threads/routes.ts`:

```ts
import { z } from 'zod'
```

Add schemas:

```ts
const publicThreadIdSchema = z.string().trim().min(1).max(80)

const chatThreadInfoParamsSchema = z
  .object({
    threadId: publicThreadIdSchema,
  })
  .strict()
```

Change service pick:

```ts
createChatThreadsService: (request: FastifyRequest) =>
  Pick<
    ChatThreadsService,
    'getCurrentUserThreadInfo' | 'listCurrentUserThreads'
  >
```

Add route:

```ts
app.get('/api/chat/threads/:threadId/info', async (request, reply) => {
  const user = await resolveAuthenticatedPortalUser({
    authService,
    env,
    reply,
    request,
  })
  const params = chatThreadInfoParamsSchema.parse(request.params)

  return createChatThreadsService(request).getCurrentUserThreadInfo({
    threadId: params.threadId,
    userId: user.id,
  })
})
```

- [x] **Step 8: Wire support label through app factory**

Extend `CreateChatThreadsServiceOptions` with:

```ts
supportLabel?: string
```

Default it in `createChatThreadsService`:

```ts
supportLabel = 'Команда поддержки',
```

Use the option in `getCurrentUserThreadInfo`. In `backend/src/app.ts`, pass:

```ts
supportLabel: `Команда ${tenant.displayName}`,
```

- [x] **Step 9: Run backend chat-thread tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/info.test.ts src/modules/chat-threads/service.test.ts src/modules/chat-threads/routes.test.ts src/modules/chat-threads/app-integration.test.ts
```

Expected: pass.

- [x] **Step 10: Check backend endpoint changes**

Run:

```bash
git status --short
```

Expected: only current feature files are modified or untracked. Do not commit
yet.

---

### Task 4: Frontend API Client And Chat Info Page Component

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
- Create: `frontend/src/features/chat/components/ChatInfoPage.tsx`
- Test: `frontend/src/features/chat/components/ChatFullScreenPanel.test.tsx`
- Test: `frontend/src/features/chat/components/ChatInfoPage.test.tsx`

- [x] **Step 1: Add failing reusable shell tests**

Create `frontend/src/features/chat/components/ChatFullScreenPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatFullScreenPanel } from './ChatFullScreenPanel'

describe('ChatFullScreenPanel', () => {
  it('renders title, back button, and children', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()

    render(
      <ChatFullScreenPanel
        isLoading={false}
        onBack={onBack}
        onRetry={vi.fn()}
        title="Информация о чате"
      >
        <p>Содержимое страницы</p>
      </ChatFullScreenPanel>,
    )

    expect(
      screen.getByRole('heading', { name: 'Информация о чате' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Содержимое страницы')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Вернуться к чату' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('renders loading and unavailable states', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    const { rerender } = render(
      <ChatFullScreenPanel
        isLoading
        onBack={vi.fn()}
        onRetry={onRetry}
        title="Медиа и файлы"
      >
        <p>Не видно при загрузке</p>
      </ChatFullScreenPanel>,
    )

    expect(screen.getByText('Загружаем данные.')).toBeInTheDocument()
    expect(screen.queryByText('Не видно при загрузке')).not.toBeInTheDocument()

    rerender(
      <ChatFullScreenPanel
        isLoading={false}
        isUnavailable
        onBack={vi.fn()}
        onRetry={onRetry}
        title="Медиа и файлы"
        unavailableMessage="Не удалось загрузить медиа."
      >
        <p>Не видно при ошибке</p>
      </ChatFullScreenPanel>,
    )

    expect(screen.getByText('Не удалось загрузить медиа.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 2: Run shell tests and verify they fail**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatFullScreenPanel.test.tsx
```

Expected: fail because `ChatFullScreenPanel` is missing.

- [x] **Step 3: Add failing chat-info component tests**

Create `frontend/src/features/chat/components/ChatInfoPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatInfoPage } from './ChatInfoPage'
import type { ChatThreadInfoResponse } from '../types'

const privateInfo = {
  accessLabel: 'Только вы и поддержка',
  activeThread: {
    id: 'private:me',
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  curatorName: 'Анна Маттина',
  lastActivityAt: '2026-05-19T10:20:00.000Z',
  participants: [],
  reason: 'none',
  result: 'ready',
  startedAt: '2026-05-18T09:00:00.000Z',
  supportLabel: 'Команда ProvGroup',
  threadTypeLabel: 'Личный',
} satisfies ChatThreadInfoResponse

describe('ChatInfoPage', () => {
  it('renders private chat details without participants', () => {
    render(
      <ChatInfoPage
        info={privateInfo}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Информация о чате' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Личный чат')).toBeInTheDocument()
    expect(screen.getByText('Тип чата')).toBeInTheDocument()
    expect(screen.getByText('Личный')).toBeInTheDocument()
    expect(screen.getByText('Ваш куратор')).toBeInTheDocument()
    expect(screen.getByText('Анна Маттина')).toBeInTheDocument()
    expect(screen.queryByText('Участники портала')).not.toBeInTheDocument()
  })

  it('hides absent optional rows and renders empty conversation state', () => {
    render(
      <ChatInfoPage
        info={{
          ...privateInfo,
          curatorName: null,
          lastActivityAt: null,
          startedAt: null,
        }}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByText('Ваш куратор')).not.toBeInTheDocument()
    expect(screen.queryByText('Последняя активность')).not.toBeInTheDocument()
    expect(screen.getByText('Еще нет сообщений')).toBeInTheDocument()
  })

  it('renders group participants with current user marker', () => {
    render(
      <ChatInfoPage
        info={{
          ...privateInfo,
          activeThread: {
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО "Ромашка"',
            type: 'group',
          },
          accessLabel: 'Участники группы и поддержка',
          participants: [
            {
              displayName: 'Иван Петров',
              id: 'portal-user:7',
              isCurrentUser: true,
            },
            {
              displayName: 'Мария Соколова',
              id: 'portal-user:8',
              isCurrentUser: false,
            },
          ],
          threadTypeLabel: 'Групповой',
        }}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Участники портала')).toBeInTheDocument()
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('Вы')).toBeInTheDocument()
    expect(screen.getByText('Мария Соколова')).toBeInTheDocument()
  })

  it('calls retry from unavailable state', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <ChatInfoPage
        info={{
          ...privateInfo,
          activeThread: null,
          result: 'unavailable',
        }}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={onRetry}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 4: Run chat-info component tests and verify they fail**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatInfoPage.test.tsx
```

Expected: fail because `ChatInfoPage` and types are missing.

- [x] **Step 5: Add frontend types**

Append to `frontend/src/features/chat/types.ts`:

```ts
export type ChatThreadInfoParticipant = {
  displayName: string
  id: `portal-user:${number}`
  isCurrentUser: boolean
}

export type ChatThreadInfoResponse = {
  accessLabel: string
  activeThread: ChatThreadSummary | null
  curatorName: string | null
  lastActivityAt: string | null
  participants: ChatThreadInfoParticipant[]
  reason: ChatThreadReason
  result: ChatThreadResult
  startedAt: string | null
  supportLabel: string
  threadTypeLabel: 'Групповой' | 'Личный' | null
}
```

- [x] **Step 6: Add API client method**

Modify `frontend/src/features/chat/api/chatClient.ts` imports and add:

```ts
import type {
  ChatMessagesSnapshot,
  ChatSendResult,
  ChatThreadInfoResponse,
  ChatThreadsResponse,
} from '../types'
```

Add:

```ts
export async function getChatThreadInfo(threadId: string) {
  return request<ChatThreadInfoResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/info`,
  )
}
```

- [x] **Step 7: Implement `ChatFullScreenPanel`**

Create `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`:

```tsx
import type { ReactNode } from 'react'

import { ChevronLeftIcon, RefreshIcon } from '../../../shared/ui/icons'

type ChatFullScreenPanelProps = {
  children: ReactNode
  isLoading: boolean
  isUnavailable?: boolean
  loadingMessage?: string
  onBack: () => void
  onRetry: () => void
  title: string
  unavailableMessage?: string
}

export function ChatFullScreenPanel({
  children,
  isLoading,
  isUnavailable = false,
  loadingMessage = 'Загружаем данные.',
  onBack,
  onRetry,
  title,
  unavailableMessage = 'Не удалось загрузить данные.',
}: ChatFullScreenPanelProps) {
  return (
    <section className="fixed inset-0 z-40 flex min-h-0 flex-col bg-white text-slate-900">
      <header className="app-safe-top chat-header-background border-b border-slate-200/90 px-4 pb-2.5 shadow-sm sm:px-6 sm:pb-3">
        <div className="flex min-h-10 items-center gap-3">
          <button
            aria-label="Вернуться к чату"
            className="inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-slate-600 transition hover:bg-slate-100/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
            onClick={onBack}
            type="button"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-tight">
            {title}
          </h1>
        </div>
      </header>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="mx-auto mt-16 max-w-xs text-center text-sm text-slate-500">
            {loadingMessage}
          </div>
        ) : null}

        {!isLoading && isUnavailable ? (
          <div className="mx-auto mt-16 max-w-xs text-center">
            <p className="text-sm text-slate-600">{unavailableMessage}</p>
            <button
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={onRetry}
              type="button"
            >
              <RefreshIcon className="h-4 w-4" />
              Повторить
            </button>
          </div>
        ) : null}

        {!isLoading && !isUnavailable ? children : null}
      </div>
    </section>
  )
}
```

- [x] **Step 8: Run shell tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatFullScreenPanel.test.tsx
```

Expected: pass.

- [x] **Step 9: Implement `ChatInfoPage`**

Create `frontend/src/features/chat/components/ChatInfoPage.tsx`:

```tsx
import { ChevronLeftIcon, RefreshIcon } from '../../../shared/ui/icons'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import type { ChatThreadInfoResponse } from '../types'

type ChatInfoPageProps = {
  info: ChatThreadInfoResponse | null
  isLoading: boolean
  onBack: () => void
  onRetry: () => void
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-slate-200/80 px-4 py-3 last:border-b-0">
      <dt className="shrink-0 text-[13px] leading-5 text-slate-500">{label}</dt>
      <dd className="min-w-0 max-w-[65%] break-words text-right text-[13px] font-medium leading-5 text-slate-900">
        {value}
      </dd>
    </div>
  )
}

function ParticipantAvatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800">
      {createTenantMonogram(name)}
    </span>
  )
}

export function ChatInfoPage({
  info,
  isLoading,
  onBack,
  onRetry,
}: ChatInfoPageProps) {
  const { tenant } = useTenantIdentity()
  const monogram = tenant ? createTenantMonogram(tenant.displayName) : 'ЛК'
  const startedAt = formatDateTime(info?.startedAt ?? null)
  const lastActivityAt = formatDateTime(info?.lastActivityAt ?? null)

  return (
    <section className="fixed inset-0 z-40 flex min-h-0 flex-col bg-white text-slate-900">
      <header className="app-safe-top chat-header-background border-b border-slate-200/90 px-4 pb-2.5 shadow-sm sm:px-6 sm:pb-3">
        <div className="flex min-h-10 items-center gap-3">
          <button
            aria-label="Вернуться к чату"
            className="inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-slate-600 transition hover:bg-slate-100/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
            onClick={onBack}
            type="button"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-tight">
            Информация о чате
          </h1>
        </div>
      </header>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="mx-auto mt-16 max-w-xs text-center text-sm text-slate-500">
            Загружаем информацию о чате.
          </div>
        ) : null}

        {!isLoading && (!info || info.result === 'unavailable') ? (
          <div className="mx-auto mt-16 max-w-xs text-center">
            <p className="text-sm text-slate-600">
              Не удалось загрузить информацию о чате.
            </p>
            <button
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={onRetry}
              type="button"
            >
              <RefreshIcon className="h-4 w-4" />
              Повторить
            </button>
          </div>
        ) : null}

        {!isLoading && info && info.result !== 'unavailable' ? (
          <div className="mx-auto max-w-md">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-900 text-base font-semibold text-white">
                {monogram}
              </div>
              <h2 className="mt-3 max-w-full truncate text-[18px] font-semibold leading-tight">
                {info.activeThread?.title ?? 'Чат'}
              </h2>
              <p className="mt-1 max-w-full truncate text-[13px] text-slate-500">
                {info.activeThread?.subtitle ?? info.supportLabel}
              </p>
            </div>

            <dl className="mt-6 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
              {info.threadTypeLabel ? (
                <DetailRow label="Тип чата" value={info.threadTypeLabel} />
              ) : null}
              <DetailRow label="Поддержка" value={info.supportLabel} />
              {info.curatorName ? (
                <DetailRow label="Ваш куратор" value={info.curatorName} />
              ) : null}
              <DetailRow
                label="Начат"
                value={startedAt ?? 'Еще нет сообщений'}
              />
              {lastActivityAt ? (
                <DetailRow
                  label="Последняя активность"
                  value={lastActivityAt}
                />
              ) : null}
              <DetailRow label="Доступ" value={info.accessLabel} />
            </dl>

            {info.participants.length > 0 ? (
              <section className="mt-5">
                <h2 className="px-1 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
                  Участники портала
                </h2>
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
                  {info.participants.map((participant) => (
                    <div
                      className="flex min-h-12 items-center gap-3 border-b border-slate-200/80 px-4 py-2.5 last:border-b-0"
                      key={participant.id}
                    >
                      <ParticipantAvatar name={participant.displayName} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-900">
                        {participant.displayName}
                      </span>
                      {participant.isCurrentUser ? (
                        <span className="shrink-0 text-[12px] text-slate-500">
                          Вы
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
```

- [x] **Step 6: Run component tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatInfoPage.test.tsx
```

Expected: pass.

- [x] **Step 7: Check frontend info component changes**

Run:

```bash
git status --short
```

Expected: only current feature files are modified or untracked. Do not commit
yet.

---

### Task 5: Frontend Chat Menu Integration

**Files:**

- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Create: `frontend/src/features/chat/pages/useChatInfoPanel.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Test: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Test: `frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx`

- [x] **Step 1: Add failing page integration test**

In `frontend/src/features/chat/pages/ChatPage.test.tsx`, add:

```tsx
it('opens chat info from the chat menu and returns to the transcript', async () => {
  const user = userEvent.setup()

  fetchMock.mockImplementation(async (input) => {
    const url = String(input)

    if (url === '/api/auth/me') {
      return createAuthenticatedUserResponse()
    }

    if (url === '/api/chat/threads') {
      return createJsonResponse(createThreadsResponse())
    }

    if (url === '/api/chat/messages?threadId=private%3Ame') {
      return createJsonResponse(createReadySnapshot())
    }

    if (url === '/api/chat/threads/private%3Ame/info') {
      return createJsonResponse({
        accessLabel: 'Только вы и поддержка',
        activeThread: privateThread,
        curatorName: 'Анна Маттина',
        lastActivityAt: '2026-05-19T10:20:00.000Z',
        participants: [],
        reason: 'none',
        result: 'ready',
        startedAt: '2026-05-18T09:00:00.000Z',
        supportLabel: 'Команда ProvGroup',
        threadTypeLabel: 'Личный',
      })
    }

    throw new Error(`Unexpected request: ${url}`)
  })

  renderChatRoute()

  expect(
    await screen.findByText('Здравствуйте, вижу ваше обращение.'),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
  await user.click(screen.getByRole('menuitem', { name: 'Информация о чате' }))

  expect(
    await screen.findByRole('heading', { name: 'Информация о чате' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Анна Маттина')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Вернуться к чату' }))

  expect(
    screen.getByText('Здравствуйте, вижу ваше обращение.'),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Информация о чате' }),
  ).not.toBeInTheDocument()
})
```

- [x] **Step 2: Run page test and verify it fails**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/ChatPage.test.tsx
```

Expected: fail because the menu item is disabled and panel state is missing.

- [x] **Step 3: Enable ChatHeader menu item callback**

Modify `ChatHeaderProps` in `frontend/src/features/chat/components/ChatHeader.tsx`:

```ts
onOpenThreadInfo: () => void
```

Accept the prop and update the `Информация о чате` item:

```tsx
<ChatMenuItem
  icon={<InfoIcon className="h-5 w-5" />}
  label="Информация о чате"
  onSelect={() => {
    closeMenus()
    onOpenThreadInfo()
  }}
/>
```

- [x] **Step 4: Add chat info panel hook**

Create `frontend/src/features/chat/pages/useChatInfoPanel.ts`:

```ts
import { useState, type MutableRefObject } from 'react'

import { ChatApiClientError, getChatThreadInfo } from '../api/chatClient'
import type { ChatThreadInfoResponse, ChatThreadReason } from '../types'

export type ChatInfoPanelState = {
  info: ChatThreadInfoResponse | null
  isLoading: boolean
  isOpen: boolean
}

const unavailableInfo: ChatThreadInfoResponse = {
  accessLabel: '',
  activeThread: null,
  curatorName: null,
  lastActivityAt: null,
  participants: [],
  reason: 'chatwoot_unavailable',
  result: 'unavailable',
  startedAt: null,
  supportLabel: 'Команда поддержки',
  threadTypeLabel: null,
}

function readUnavailableReason(error: unknown): ChatThreadReason {
  if (!(error instanceof ChatApiClientError)) {
    return 'chatwoot_unavailable'
  }

  switch (error.code) {
    case 'chatwoot_not_configured':
    case 'chatwoot_unavailable':
    case 'contact_link_missing':
    case 'conversation_mapping_unavailable':
    case 'conversation_missing':
    case 'thread_access_denied':
    case 'thread_invalid':
      return error.code
    default:
      return 'chatwoot_unavailable'
  }
}

type UseChatInfoPanelOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
}

export function useChatInfoPanel({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
}: UseChatInfoPanelOptions) {
  const [state, setState] = useState<ChatInfoPanelState>({
    info: null,
    isLoading: false,
    isOpen: false,
  })

  async function loadChatInfo() {
    if (!selectedThreadId) {
      return
    }

    setState({ info: null, isLoading: true, isOpen: true })

    try {
      const info = await getChatThreadInfo(selectedThreadId)

      if (!isMountedRef.current) {
        return
      }

      markBrowserOnline()
      setState({ info, isLoading: false, isOpen: true })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        setState({
          info: unavailableInfo,
          isLoading: false,
          isOpen: true,
        })
        return
      }

      handleConnectionUnavailableError(error)
      setState({
        info: { ...unavailableInfo, reason: readUnavailableReason(error) },
        isLoading: false,
        isOpen: true,
      })
    }
  }

  return {
    closeChatInfo: () => {
      setState((currentState) => ({
        ...currentState,
        isOpen: false,
      }))
    },
    loadChatInfo,
    retryChatInfo: loadChatInfo,
    state,
  }
}
```

- [x] **Step 5: Wire ChatPage with minimal line growth**

Modify imports in `frontend/src/features/chat/pages/ChatPage.tsx`:

```ts
import {
  ChatApiClientError,
  getChatMessages,
  sendChatAttachment,
} from '../api/chatClient'
import { ChatInfoPage } from '../components/ChatInfoPage'
import { useChatInfoPanel } from './useChatInfoPanel'
```

Call the hook after `useChatThreadSelection`:

```ts
const chatInfoPanel = useChatInfoPanel({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId: pageState.selectedThreadId,
})
```

Pass to `ChatHeader`:

```tsx
onOpenThreadInfo={() => {
  void chatInfoPanel.loadChatInfo()
}}
```

Render this expression immediately before the closing `</>` in `ChatPage`:

```
{chatInfoPanel.state.isOpen ? (
  <ChatInfoPage
    info={chatInfoPanel.state.info}
    isLoading={chatInfoPanel.state.isLoading}
    onBack={chatInfoPanel.closeChatInfo}
    onRetry={() => {
      void chatInfoPanel.retryChatInfo()
    }}
  />
) : null}
```

After edits, run:

```bash
wc -l frontend/src/features/chat/pages/ChatPage.tsx
```

Expected: `ChatPage.tsx` remains at or below 500 lines.

- [x] **Step 6: Run frontend chat page tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.thread-selection.test.tsx
```

Expected: pass.

- [x] **Step 7: Check menu integration changes**

Run:

```bash
git status --short
```

Expected: only current feature files are modified or untracked. Do not commit
yet.

---

### Task 6: Review, Runtime Coverage, And Work Log

**Files:**

- Modify: `docs/roadmap/work-log.md`
- Optional test file: existing Playwright e2e spec under `tests/` if local fixtures already cover private/group thread chat.

- [x] **Step 1: Run targeted backend checks**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/info.test.ts src/modules/chat-threads/contactRepository.test.ts src/modules/chat-threads/service.test.ts src/modules/chat-threads/routes.test.ts src/modules/chat-threads/app-integration.test.ts
```

Expected: pass.

- [x] **Step 2: Run targeted frontend checks**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatInfoPage.test.tsx src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.thread-selection.test.tsx
pnpm --dir frontend typecheck
```

Expected: pass.

- [x] **Step 3: Run build and lint checks**

Run:

```bash
pnpm --dir backend build
pnpm --dir frontend build
pnpm lint
git diff --check
```

Expected: pass.

- [x] **Step 4: Browser/runtime validation**

Run Playwright when local services are already running and test fixtures support chat:

```bash
pnpm test:e2e
```

Expected: chat info can be opened from private and group chat, then closed back
to the same transcript, and browser network contains only same-origin `/api`
requests.

If services are not running because the project rule reserves service start/stop
for the user, record the blocker in the final answer and in the work log entry.

- [x] **Step 5: Code review the touched areas**

Review these files manually:

```bash
git diff -- backend/src/modules/chat-threads backend/src/integrations/chatwoot frontend/src/features/chat docs/roadmap/work-log.md
```

Check:

- no browser-direct Chatwoot authority;
- no Chatwoot IDs returned as authority;
- group participants are current tenant active portal users only;
- no conversation is created by info page load;
- `ChatPage.tsx` remains at or below 500 lines;
- no generated artifacts are tracked.

- [x] **Step 6: Update work log after checks**

Edit `docs/roadmap/work-log.md`:

- add one short completed bullet under `Chat Thread Planning`;
- replace `Recommended Next Step` with the next focused chat menu slice, such as
  `Реализовать следующий пункт chat menu: Поиск по чату.`

Use only completed facts and checks. Keep one `Recommended Next Step` block.

- [x] **Step 7: Run docs formatting and diff check**

Run:

```bash
pnpm exec prettier --check docs/roadmap/work-log.md
git diff --check
```

Expected: pass.

- [x] **Step 8: Commit completed feature slice**

Run:

```bash
git add backend frontend docs/roadmap/work-log.md
git commit -m "feat: add chat info page"
```

---

## Self-Review Notes

- Spec coverage: the plan covers read-only info, `curator_name`, dates, safe group participants, no conversation creation, no browser Chatwoot authority, frontend full-screen UI, tests, runtime validation, and work-log closure.
- Scope boundary: search, media/files, notifications, and end-dialog behavior are deliberately outside this implementation plan.
- Line-limit risk: `ChatPage.tsx` starts at 473 lines, so the plan puts the page UI in `ChatInfoPage.tsx` and explicitly checks the line count after wiring.
