# Chat Thread Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add portal-owned chat threads as the public chat contract while keeping Chatwoot conversation IDs as backend-only mappings: one private thread plus optional shared company threads configured through Chatwoot contact custom attributes.

**Architecture:** Chatwoot remains the system of record for contacts, conversations, messages and attachments. Portal backend owns thread access, thread-to-conversation mappings, send idempotency, Markdown author formatting for company messages and realtime fanout. Browser uses `threadId` only and never receives Chatwoot conversation authority; `primaryConversationId` stays an internal backend compatibility detail until the thread abstraction is verified and cleanup is safe.

**Tech Stack:** Fastify, TypeScript, Drizzle/Postgres, Vitest, React, Vite, EventSource/SSE, Chatwoot API Channel.

---

## Source Spec

- Spec: `docs/superpowers/specs/2026-05-14-chat-thread-model-design.md`
- Branch: `feature/chat-thread-model-spec`
- Current baseline to wrap first, then internalize: `primaryConversationId` across backend, frontend and realtime.

## Production Quality Bar

This plan targets production-quality implementation from the first enabled
slice. The portal is still in pre-customer development: production deploys are
used for testing and there are no real customer conversations or customer users
to preserve.

That means this work does not need a cautious customer-data migration or legacy
browser compatibility path. We can replace the old public chat contract directly
once the replacement is tested. Controlled slices are still required, but their
purpose is reviewability, security verification and fast rollback during testing,
not long-term compatibility with live customers.

Non-negotiables:

- every slice that changes runtime behavior must be complete, tested and
  deployable within its own scope;
- browser input can select only a portal `threadId`, never Chatwoot authority;
- backend must validate `tenant + session + thread membership` before every
  history, send, attachment and realtime operation;
- company sends and company realtime must not be enabled while
  `F-CHAT-SEC-001` is open;
- company sends must not be enabled while `F-CHAT-THREAD-006` is open;
- company webhook fanout must not be enabled while `F-CHAT-WEBHOOK-003` is open;
- no fallback may grant history/send/realtime access when Chatwoot contact
  attributes are missing, malformed, disabled or cross-tenant;
- `portal_client_company_contact_ids` must be parsed by the shared
  `contactAttributes` parser, capped at `20` IDs, deduplicated before Chatwoot
  lookup/upsert work and rejected fail-closed on malformed or oversized values;
- no Chatwoot secrets, conversation authority or membership authority may be
  stored in frontend state, local storage or public API responses;
- known security findings on the runtime path must be closed before enabling
  the affected behavior.

## File Structure

Backend files to create:

- `backend/src/modules/chat-threads/contactAttributes.ts` - parse and validate Chatwoot portal custom attributes.
- `backend/src/modules/chat-threads/contactAttributes.test.ts` - unit coverage for strict attribute parsing.
- `backend/src/modules/chat-threads/types.ts` - public thread contracts and internal runtime context types.
- `backend/src/modules/chat-threads/repository.ts` - `portal_chat_threads` persistence and message author lookup helpers.
- `backend/src/modules/chat-threads/repository.test.ts` - repository tests with PGlite.
- `backend/src/modules/chat-threads/service.ts` - thread listing, access validation, lazy conversation bootstrap.
- `backend/src/modules/chat-threads/service.test.ts` - service tests for private/company access and bootstrap.
- `backend/src/modules/chat-threads/routes.ts` - `GET /api/chat/threads`.
- `backend/src/modules/chat-threads/routes.test.ts` - auth and route contract tests.

Backend files to modify:

- `backend/src/db/schema.ts` - add `portal_chat_threads`, thread-scoped send ledger columns and indexes.
- `backend/drizzle/*.sql`, `backend/drizzle/meta/*.json`, `backend/drizzle/meta/_journal.json` - generated migration artifacts.
- `backend/src/integrations/chatwoot/client.ts` - return contact custom attributes and add lookup by contact ID.
- `backend/src/integrations/chatwoot/contactLookup.test.ts` - cover contact attributes and contact ID lookup.
- `backend/src/modules/registration/service.ts` - require `portal_contact_type=person` and `portal_enabled=true`.
- `backend/src/modules/registration/service.test.ts` - reject disabled/company/missing-attribute contacts.
- `backend/src/modules/chat-context/service.ts` and `backend/src/modules/chat-context/routes.ts` - shrink or bridge old primary-conversation behavior while messages move to threads.
- `backend/src/modules/chat-messages/types.ts` - replace public `primaryConversation` dependency with `activeThread` and add message `authorRole`.
- `backend/src/modules/chat-messages/repository.ts` - change send ledger scope from `primaryConversationId` to `portalChatThreadId`.
- `backend/src/modules/chat-messages/repository.test.ts` - cover thread-scoped idempotency.
- `backend/src/modules/chat-messages/service.ts` - load/send by `threadId`, format company author Markdown for Chatwoot, strip it for portal UI.
- `backend/src/modules/chat-messages/service.test.ts` - cover private send, company send, history mapping and stripped author prefix.
- `backend/src/modules/chat-messages/routes.ts` - accept `threadId`, stop accepting browser `primaryConversationId` after frontend migration.
- `backend/src/modules/chat-realtime/hub.ts` - key subscriptions by `threadId`, not Chatwoot conversation ID.
- `backend/src/modules/chat-realtime/hub.test.ts` - cover private/company subscription fanout.
- `backend/src/modules/chat-realtime/routes.ts` - accept `threadId` and validate it through thread service.
- `backend/src/modules/chat-realtime/routes.test.ts` - route-level coverage for unauthorized/unavailable thread realtime.
- `backend/src/modules/chatwoot-webhooks/repository.ts` - map Chatwoot conversation ID to portal thread.
- `backend/src/modules/chatwoot-webhooks/repository.test.ts` - repository mapping tests.
- `backend/src/modules/chatwoot-webhooks/service.ts` - publish snapshots by thread to active validated subscribers.
- `backend/src/modules/chatwoot-webhooks/service.test.ts` - private and company fanout coverage.
- `backend/src/app.ts` - register thread repository/service/routes and update dependency wiring.
- `backend/src/app.test.ts` - integration API contract updates.
- `backend/src/test/appTestHelpers.ts` - replace `primaryConversationId` helpers with `threadId` helpers.

Frontend files to modify:

- `frontend/src/features/chat/types.ts` - add `ChatThreadSummary`, `activeThread`, `authorRole`; remove public `ChatPrimaryConversation`.
- `frontend/src/features/chat/api/chatClient.ts` - add `getChatThreads`, change messages/send/attachment to `threadId`.
- `frontend/src/features/chat/api/chatRealtimeClient.ts` - realtime URL uses `threadId`.
- `frontend/src/features/chat/pages/ChatPage.tsx` - load threads, own selected thread state, switch threads, reset reply/optimistic sends on switch.
- `frontend/src/features/chat/pages/chatPageState.ts` - state includes selected thread and thread list loading errors.
- `frontend/src/features/chat/pages/useChatRealtimeConnection.ts` - subscribe by `threadId`.
- `frontend/src/features/chat/pages/useOptimisticTextSend.ts` - optimistic sends carry `threadId`.
- `frontend/src/features/chat/lib/optimisticTextMessages.ts` - remove `primaryConversationId`, add `threadId`.
- `frontend/src/features/chat/lib/chatSnapshot.ts` - merge snapshots by active thread ID.
- `frontend/src/features/chat/components/ChatHeader.tsx` - render thread switcher in left menu and active thread title in subtitle.
- `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx` - render company member author names correctly.
- `frontend/src/features/chat/pages/*.test.tsx`, `frontend/src/features/chat/components/*.test.tsx` - update mocked contracts and add thread switching tests.

Docs to modify after verified implementation:

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md`
- `docs/WORK_LOG.md`

---

## Public API Target

Thread list:

```http
GET /api/chat/threads
```

```json
{
  "threads": [
    {
      "id": "private:me",
      "type": "private",
      "title": "Личный чат",
      "subtitle": "Только вы и поддержка"
    },
    {
      "id": "company:154",
      "type": "company",
      "title": "ООО \"Ромашка\"",
      "subtitle": "Общий чат компании"
    }
  ],
  "activeThreadId": "private:me"
}
```

Messages:

```http
GET /api/chat/messages?threadId=company:154
GET /api/chat/messages?threadId=company:154&beforeMessageId=205
POST /api/chat/messages
POST /api/chat/messages/attachment
GET /api/chat/realtime?threadId=company:154
```

Message snapshot shape:

```ts
type ChatMessagesSnapshot = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  messages: ChatMessage[]
  nextOlderCursor: number | null
  reason: ChatContextReason
  result: ChatContextResult
}
```

Message author roles:

```ts
type ChatMessageAuthorRole = 'agent' | 'current_user' | 'company_member'
```

UI alignment rule:

```ts
const isOutgoing = message.authorRole === 'current_user'
```

Company thread Chatwoot content format:

```md
**Иван Петров**
Добрый день, нужна сверка.
```

---

## Safety Strategy

Because there are no real portal customers yet, this is not a live-customer
migration. Still, it must not be implemented as an unreviewable big-bang rewrite:
the safe sequence is:

1. Protect the existing private-chat baseline with targeted tests.
2. Introduce `threadId` as the browser-facing selector while mapping `private:me`
   to the current primary conversation logic.
3. Keep `primaryConversationId` in backend persistence and internal service
   boundaries during the migration.
4. Stop accepting browser-selected `primaryConversationId` only after the
   `private:me` thread path is verified.
5. Add company threads only after private thread compatibility passes.
6. Treat `F-CHAT-SEC-001`, `F-CHAT-THREAD-006` and
   `F-CHAT-WEBHOOK-003` as company-thread rollout gates: authenticated send rate
   limiting, lazy bootstrap concurrency and webhook mapping ownership must be
   closed before the affected company-thread behavior is enabled.

Security invariant:

```text
browser threadId -> backend validates tenant + session + membership -> backend
resolves internal Chatwoot conversation ID -> Chatwoot API
```

Never invert this flow. Browser input must never select a Chatwoot conversation
directly.

Fail-closed coverage required before runtime behavior is enabled:

| Case                                                       | Required tests                                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed `portal_client_company_contact_ids`              | Task 1 parser tests reject non-integer values, empty tokens, unsafe integers and oversized lists.                                         |
| Referenced company contact is missing                      | Task 3 thread listing service test rejects with `portal_company_contact_missing`.                                                         |
| Referenced company contact has wrong `portal_contact_type` | Task 3 thread listing service test rejects with `portal_company_contact_type_invalid`.                                                    |
| Person contact is disabled or wrong type                   | Task 1 parser/assertion tests and Task 3 service tests reject before returning any thread list.                                           |
| Company contact is disabled                                | Task 3 thread listing service test rejects with `portal_company_contact_disabled`.                                                        |
| Forged `company:<id>` not listed on current person contact | Task 4 runtime resolver test rejects before Chatwoot conversation lookup/create; Task 5 history/send route tests verify no outbound send. |
| Membership removed after subscribe/open                    | Task 5 history/send tests and Task 6 realtime/webhook tests revalidate current attributes and block future delivery.                      |

---

## Task 0: Private Chat Safety Gate

**Files:**

- Inspect: `backend/src/modules/chat-context/service.test.ts`
- Inspect: `backend/src/modules/chat-messages/service.test.ts`
- Inspect: `backend/src/modules/chat-realtime/routes.test.ts`
- Inspect: `backend/src/modules/chatwoot-webhooks/service.test.ts`
- Inspect: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Inspect: `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`
- Inspect: `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`
- Inspect: `docs/Findings/F-CHAT-SEC-001-authenticated-chat-send-rate-limit.md`
- Modify only if needed: failing test files or related implementation files
  uncovered by this safety gate.

- [ ] **Step 1: Run backend private-chat baseline tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-context/service.test.ts src/modules/chat-messages/service.test.ts src/modules/chat-realtime/routes.test.ts src/modules/chatwoot-webhooks/service.test.ts
```

Expected: PASS. If a non-chat suite is unexpectedly pulled into the run or a
timeout appears, stop and fix the test selection/configuration before starting
Task 1.

- [ ] **Step 2: Run frontend private-chat baseline tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx src/features/chat/components/ChatTranscript.test.tsx src/features/chat/components/MessageComposer.test.tsx
```

Expected: PASS. If unrelated auth/page tests time out during this targeted run,
stop and fix the test selection/configuration before starting Task 1.

- [ ] **Step 3: Document or close current baseline blockers**

If either baseline command fails:

1. determine whether the failure is a real chat regression or a test-runner
   selection/configuration issue;
2. fix it in a separate checkpoint if it blocks reliable thread work;
3. record any unresolved blocker in `docs/Findings/`;
4. do not continue to Task 1 until the private-chat baseline is trustworthy.

- [ ] **Step 4: Confirm send-rate-limit gate**

Review `docs/Findings/F-CHAT-SEC-001-authenticated-chat-send-rate-limit.md`.

Before enabling company sends in Task 5, this must be true:

```text
F-CHAT-SEC-001 is closed by implementation and backend tests
```

- [ ] **Step 5: Commit Task 0 if fixes were needed**

If Step 1 or Step 2 required code/test changes, commit them before Task 1:

```bash
git add backend/src frontend/src docs/Findings docs/WORK_LOG.md
git commit -m "test: protect private chat baseline"
```

If no changes were needed, do not create an empty commit.

---

## Task 1: Chatwoot Contact Attributes And Registration Gate

**Files:**

- Create: `backend/src/modules/chat-threads/contactAttributes.ts`
- Create: `backend/src/modules/chat-threads/contactAttributes.test.ts`
- Modify: `backend/src/integrations/chatwoot/client.ts`
- Modify: `backend/src/integrations/chatwoot/client.test.ts`
- Modify: `backend/src/modules/registration/service.ts`
- Modify: `backend/src/modules/registration/service.test.ts`

- [ ] **Step 1: Write failing attribute parser tests**

Create `backend/src/modules/chat-threads/contactAttributes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  assertPortalPersonContactEnabled,
  parsePortalContactAttributes,
} from './contactAttributes.js'

describe('portal contact attributes', () => {
  it('parses enabled person contacts with company contact IDs', () => {
    expect(
      parsePortalContactAttributes({
        portal_client_company_contact_ids: '154, 203',
        portal_contact_type: 'person',
        portal_enabled: true,
      }),
    ).toEqual({
      companyContactIds: [154, 203],
      enabled: true,
      type: 'person',
    })
  })

  it('parses enabled company contacts without company memberships', () => {
    expect(
      parsePortalContactAttributes({
        portal_client_company_contact_ids: '',
        portal_contact_type: 'company',
        portal_enabled: true,
      }),
    ).toEqual({
      companyContactIds: [],
      enabled: true,
      type: 'company',
    })
  })

  it('rejects malformed company contact IDs', () => {
    expect(() =>
      parsePortalContactAttributes({
        portal_client_company_contact_ids: '154, bad',
        portal_contact_type: 'person',
        portal_enabled: true,
      }),
    ).toThrow('portal_client_company_contact_ids')
  })

  it('requires person contacts to be portal enabled', () => {
    expect(() =>
      assertPortalPersonContactEnabled({
        customAttributes: {
          portal_contact_type: 'company',
          portal_enabled: true,
        },
        id: 154,
      }),
    ).toThrow('portal_contact_type')

    expect(() =>
      assertPortalPersonContactEnabled({
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: false,
        },
        id: 155,
      }),
    ).toThrow('portal_enabled')
  })
})
```

- [ ] **Step 2: Run parser test to verify it fails**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/contactAttributes.test.ts
```

Expected: FAIL because `contactAttributes.ts` does not exist.

- [ ] **Step 3: Implement strict parser**

Create `backend/src/modules/chat-threads/contactAttributes.ts`:

```ts
import { ApiError } from '../../lib/errors.js'

export type PortalContactType = 'person' | 'company'

export type PortalContactAttributes = {
  companyContactIds: number[]
  enabled: boolean
  type: PortalContactType
}

export type ChatwootContactWithAttributes = {
  customAttributes?: Record<string, unknown> | null
  id: number
}

function readType(value: unknown): PortalContactType {
  if (value === 'person' || value === 'company') {
    return value
  }

  throw new ApiError(
    403,
    'portal_contact_type_invalid',
    'Контакт не настроен для доступа к порталу.',
  )
}

function readEnabled(value: unknown) {
  if (value === true) {
    return true
  }

  if (value === false || value === undefined || value === null) {
    return false
  }

  throw new ApiError(
    403,
    'portal_enabled_invalid',
    'Доступ контакта к порталу настроен некорректно.',
  )
}

function parseCompanyContactIds(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return []
  }

  if (typeof value !== 'string') {
    throw new ApiError(
      403,
      'portal_client_company_contact_ids_invalid',
      'Список компаний для портала настроен некорректно.',
    )
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const parsed = Number(part)

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ApiError(
          403,
          'portal_client_company_contact_ids_invalid',
          'Список компаний для портала настроен некорректно.',
        )
      }

      return parsed
    })
}

export function parsePortalContactAttributes(
  customAttributes: Record<string, unknown> | null | undefined,
): PortalContactAttributes {
  const attributes = customAttributes ?? {}

  return {
    companyContactIds: parseCompanyContactIds(
      attributes.portal_client_company_contact_ids,
    ),
    enabled: readEnabled(attributes.portal_enabled),
    type: readType(attributes.portal_contact_type),
  }
}

export function assertPortalPersonContactEnabled(
  contact: ChatwootContactWithAttributes,
) {
  const attributes = parsePortalContactAttributes(contact.customAttributes)

  if (attributes.type !== 'person') {
    throw new ApiError(
      403,
      'portal_contact_type_invalid',
      'Контакт не настроен как пользователь портала.',
    )
  }

  if (!attributes.enabled) {
    throw new ApiError(
      403,
      'portal_contact_disabled',
      'Доступ к порталу для этого контакта отключен.',
    )
  }

  return attributes
}
```

- [ ] **Step 4: Run parser test to verify it passes**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/contactAttributes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Extend Chatwoot contact client tests**

In `backend/src/integrations/chatwoot/client.test.ts`, add tests covering:

```ts
it('maps contact custom attributes from email search', async () => {
  // Mock /contacts/search payload with custom_attributes.
  // Expect findContactByEmail() to return customAttributes.
})

it('fetches a contact by id with custom attributes', async () => {
  // Mock /contacts/154?include_contact_inboxes=true.
  // Expect findContactById(154) to return id, email, name and customAttributes.
})
```

Expected failure before implementation: returned contact has no `customAttributes` and `findContactById` is missing.

- [ ] **Step 6: Extend Chatwoot client**

Modify `backend/src/integrations/chatwoot/client.ts`:

```ts
export type ChatwootContact = {
  customAttributes: Record<string, unknown>
  email: string | null
  id: number
  name: string | null
}
```

Add helper:

```ts
function mapContact(payload: unknown): ChatwootContact {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup returned an invalid contact payload.',
    )
  }

  const id = readInteger(payload.id)

  if (id === null) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup returned an invalid contact payload.',
    )
  }

  return {
    customAttributes: readObject(payload.custom_attributes) ?? {},
    email: readString(payload.email),
    id,
    name: readString(payload.name),
  }
}
```

Update `findContactByEmail()` to return `mapContact(exactMatch)`.

Add:

```ts
async function findContactById(
  contactId: number,
): Promise<ChatwootContact | null> {
  const resolvedConfig = assertConfigured()

  if (!Number.isInteger(contactId) || contactId <= 0) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup requires a valid contact id.',
    )
  }

  const requestUrl = new URL(
    `/api/v1/accounts/${resolvedConfig.accountId}/contacts/${contactId}`,
    resolvedConfig.baseUrl,
  )
  requestUrl.searchParams.set('include_contact_inboxes', 'true')

  try {
    const contact = await requestJson(
      requestUrl,
      'Chatwoot contact lookup is unavailable.',
    )

    return mapContact(parseContactDetailsResponse(contact).payload)
  } catch (error) {
    if (
      error instanceof ChatwootClientRequestError &&
      error.message.includes('404')
    ) {
      return null
    }

    throw error
  }
}
```

Expose `findContactById` from the returned client object.

- [ ] **Step 7: Run Chatwoot client tests**

Run:

```bash
pnpm --dir backend exec vitest run src/integrations/chatwoot/client.test.ts
```

Expected: PASS.

- [ ] **Step 8: Add registration gate tests**

In `backend/src/modules/registration/service.test.ts`, add cases:

```ts
it('rejects registration when contact is not a portal person contact', async () => {
  const service = createRegistrationServiceForTest({
    chatwootClient: {
      findContactByEmail: vi.fn().mockResolvedValue({
        customAttributes: {
          portal_contact_type: 'company',
          portal_enabled: true,
        },
        email: 'ivan@example.com',
        id: 154,
        name: 'ООО "Ромашка"',
      }),
    },
    emailDelivery: {
      send: vi.fn(),
    },
    now: () => new Date('2026-05-14T12:00:00.000Z'),
    portalUsersRepository: createPortalUsersRepository(database.db, {
      tenantId,
    }),
    registrationRepository: createRegistrationRepository(database.db, {
      tenantId,
    }),
  })

  await expect(
    service.requestVerification({
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
    }),
  ).rejects.toMatchObject({
    code: 'portal_contact_type_invalid',
  })
})

it('rejects registration when portal access is disabled on the person contact', async () => {
  const service = createRegistrationServiceForTest({
    chatwootClient: {
      findContactByEmail: vi.fn().mockResolvedValue({
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: false,
        },
        email: 'ivan@example.com',
        id: 155,
        name: 'Иван Петров',
      }),
    },
    emailDelivery: {
      send: vi.fn(),
    },
    now: () => new Date('2026-05-14T12:00:00.000Z'),
    portalUsersRepository: createPortalUsersRepository(database.db, {
      tenantId,
    }),
    registrationRepository: createRegistrationRepository(database.db, {
      tenantId,
    }),
  })

  await expect(
    service.requestVerification({
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
    }),
  ).rejects.toMatchObject({
    code: 'portal_contact_disabled',
  })
})
```

- [ ] **Step 9: Enforce registration gate**

In `backend/src/modules/registration/service.ts`, import and call `assertPortalPersonContactEnabled(contact)` immediately after the existing `if (!contact)` check.

- [ ] **Step 10: Run registration tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/registration/service.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit Task 1**

Run:

```bash
git add backend/src/integrations/chatwoot/client.ts backend/src/integrations/chatwoot/client.test.ts backend/src/modules/chat-threads/contactAttributes.ts backend/src/modules/chat-threads/contactAttributes.test.ts backend/src/modules/registration/service.ts backend/src/modules/registration/service.test.ts
git commit -m "feat: validate portal contact attributes"
```

---

## Task 2: Thread Persistence And Send Ledger Migration

**Files:**

- Modify: `backend/src/db/schema.ts`
- Create via Drizzle: `backend/drizzle/0009_*.sql`
- Modify via Drizzle: `backend/drizzle/meta/0009_snapshot.json`
- Modify via Drizzle: `backend/drizzle/meta/_journal.json`
- Create: `backend/src/modules/chat-threads/repository.ts`
- Create: `backend/src/modules/chat-threads/repository.test.ts`

- [ ] **Step 1: Add failing repository tests**

Create `backend/src/modules/chat-threads/repository.test.ts` with PGlite patterns from existing repository tests. Cover:

```ts
it('upserts one private thread per tenant user', async () => {
  const repository = createChatThreadsRepository(database.db, { tenantId: 1 })

  const first = await repository.upsertPrivateThread({
    chatwootContactId: 44,
    chatwootInboxId: 9,
    now: new Date('2026-05-14T12:00:00.000Z'),
    userId: 7,
  })
  const second = await repository.upsertPrivateThread({
    chatwootContactId: 44,
    chatwootInboxId: 9,
    now: new Date('2026-05-14T12:01:00.000Z'),
    userId: 7,
  })

  expect(second.id).toBe(first.id)
  expect(second.threadType).toBe('private')
})

it('upserts one company thread per tenant company contact', async () => {
  const repository = createChatThreadsRepository(database.db, { tenantId: 1 })

  const thread = await repository.upsertCompanyThread({
    chatwootContactId: 154,
    chatwootInboxId: 9,
    now: new Date('2026-05-14T12:00:00.000Z'),
  })

  expect(thread.portalUserId).toBeNull()
  expect(thread.threadType).toBe('company')
})

it('updates a thread conversation mapping after lazy bootstrap', async () => {
  const repository = createChatThreadsRepository(database.db, { tenantId: 1 })
  const thread = await repository.upsertPrivateThread({
    chatwootContactId: 44,
    chatwootInboxId: 9,
    now: new Date('2026-05-14T12:00:00.000Z'),
    userId: 7,
  })

  await repository.updateThreadConversation({
    chatwootConversationId: 101,
    chatwootInboxId: 9,
    id: thread.id,
    now: new Date('2026-05-14T12:01:00.000Z'),
  })

  await expect(repository.findThreadById(thread.id)).resolves.toMatchObject({
    chatwootConversationId: 101,
  })
})
```

- [ ] **Step 2: Run repository test to verify it fails**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/repository.test.ts
```

Expected: FAIL because schema/repository do not exist.

- [ ] **Step 3: Update schema**

Modify `backend/src/db/schema.ts`:

```ts
export const portalChatThreads = pgTable(
  'portal_chat_threads',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, { onDelete: 'restrict' }),
    threadType: text('thread_type').notNull(),
    portalUserId: integer('portal_user_id').references(() => portalUsers.id, {
      onDelete: 'cascade',
    }),
    chatwootContactId: integer('chatwoot_contact_id').notNull(),
    chatwootInboxId: integer('chatwoot_inbox_id').notNull(),
    chatwootConversationId: integer('chatwoot_conversation_id'),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_chat_threads_tenant_private_user_unique')
      .on(table.tenantId, table.portalUserId)
      .where(sql`${table.threadType} = 'private'`),
    uniqueIndex('portal_chat_threads_tenant_company_contact_unique')
      .on(table.tenantId, table.chatwootContactId)
      .where(sql`${table.threadType} = 'company'`),
    uniqueIndex('portal_chat_threads_tenant_conversation_unique')
      .on(table.tenantId, table.chatwootConversationId)
      .where(sql`${table.chatwootConversationId} is not null`),
    index('portal_chat_threads_tenant_contact_idx').on(
      table.tenantId,
      table.chatwootContactId,
    ),
    check(
      'portal_chat_threads_type_check',
      sql`${table.threadType} in ('private', 'company')`,
    ),
    check(
      'portal_chat_threads_private_user_check',
      sql`(${table.threadType} = 'private' and ${table.portalUserId} is not null) or (${table.threadType} = 'company' and ${table.portalUserId} is null)`,
    ),
  ],
)
```

Change `portalChatMessageSends`:

```ts
portalChatThreadId: integer('portal_chat_thread_id').references(
  () => portalChatThreads.id,
  { onDelete: 'restrict' },
),
authorDisplayNameSnapshot: text('author_display_name_snapshot'),
```

Keep `primaryConversationId` during migration as an internal backend field. After
Task 5, new browser-facing code stops sending or accepting
`primaryConversationId`, but backend persistence can keep it until a later
cleanup migration.

- [ ] **Step 4: Generate migration**

Run:

```bash
pnpm --dir backend db:generate
```

Expected: new `backend/drizzle/0009_*.sql` plus meta snapshot.

- [ ] **Step 5: Manually inspect and amend migration SQL**

Ensure the migration backfills private threads from existing mappings:

```sql
insert into portal_chat_threads (
  tenant_id,
  thread_type,
  portal_user_id,
  chatwoot_contact_id,
  chatwoot_inbox_id,
  chatwoot_conversation_id,
  created_at,
  updated_at
)
select
  tenant_id,
  'private',
  user_id,
  chatwoot_contact_id,
  chatwoot_inbox_id,
  chatwoot_conversation_id,
  created_at,
  updated_at
from portal_user_chatwoot_conversations
on conflict do nothing;

update portal_chat_message_sends sends
set portal_chat_thread_id = threads.id,
    author_display_name_snapshot = users.full_name
from portal_chat_threads threads
join portal_users users
  on users.tenant_id = threads.tenant_id
 and users.id = threads.portal_user_id
where sends.tenant_id = threads.tenant_id
  and sends.user_id = threads.portal_user_id
  and sends.primary_conversation_id = threads.chatwoot_conversation_id;
```

Do not drop `portal_user_chatwoot_conversations` in this task.

- [ ] **Step 6: Implement repository**

Create `backend/src/modules/chat-threads/repository.ts`:

```ts
import { and, eq, inArray } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalChatMessageSends, portalChatThreads } from '../../db/schema.js'

type TenantRepositoryScope = {
  tenantId: number
}

export type PortalChatThreadRecord = {
  chatwootContactId: number
  chatwootConversationId: number | null
  chatwootInboxId: number
  id: number
  portalUserId: number | null
  threadType: 'private' | 'company'
}

const threadSelection = {
  chatwootContactId: portalChatThreads.chatwootContactId,
  chatwootConversationId: portalChatThreads.chatwootConversationId,
  chatwootInboxId: portalChatThreads.chatwootInboxId,
  id: portalChatThreads.id,
  portalUserId: portalChatThreads.portalUserId,
  threadType: portalChatThreads.threadType,
}

function mapThread(row: typeof threadSelection): PortalChatThreadRecord {
  return row as PortalChatThreadRecord
}

export function createChatThreadsRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  return {
    async findSendLedgerAuthorsByMessageIds({
      messageIds,
      portalChatThreadId,
    }: {
      messageIds: number[]
      portalChatThreadId: number
    }) {
      if (messageIds.length === 0) {
        return new Map<
          number,
          { authorDisplayName: string | null; userId: number }
        >()
      }

      const rows = await db
        .select({
          authorDisplayName: portalChatMessageSends.authorDisplayNameSnapshot,
          chatwootMessageId: portalChatMessageSends.chatwootMessageId,
          userId: portalChatMessageSends.userId,
        })
        .from(portalChatMessageSends)
        .where(
          and(
            eq(portalChatMessageSends.tenantId, tenantId),
            eq(portalChatMessageSends.portalChatThreadId, portalChatThreadId),
            inArray(portalChatMessageSends.chatwootMessageId, messageIds),
          ),
        )

      return new Map(
        rows
          .filter((row) => row.chatwootMessageId !== null)
          .map((row) => [
            row.chatwootMessageId as number,
            {
              authorDisplayName: row.authorDisplayName,
              userId: row.userId,
            },
          ]),
      )
    },

    async findThreadByChatwootConversationId(chatwootConversationId: number) {
      const [thread] = await db
        .select(threadSelection)
        .from(portalChatThreads)
        .where(
          and(
            eq(portalChatThreads.tenantId, tenantId),
            eq(
              portalChatThreads.chatwootConversationId,
              chatwootConversationId,
            ),
          ),
        )
        .limit(1)

      return thread ? mapThread(thread) : null
    },

    async findThreadById(id: number) {
      const [thread] = await db
        .select(threadSelection)
        .from(portalChatThreads)
        .where(
          and(
            eq(portalChatThreads.tenantId, tenantId),
            eq(portalChatThreads.id, id),
          ),
        )
        .limit(1)

      return thread ? mapThread(thread) : null
    },

    async updateThreadConversation({
      chatwootConversationId,
      chatwootInboxId,
      id,
      now,
    }: {
      chatwootConversationId: number
      chatwootInboxId: number
      id: number
      now: Date
    }) {
      const [thread] = await db
        .update(portalChatThreads)
        .set({
          chatwootConversationId,
          chatwootInboxId,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalChatThreads.tenantId, tenantId),
            eq(portalChatThreads.id, id),
          ),
        )
        .returning(threadSelection)

      return thread ? mapThread(thread) : null
    },

    async upsertCompanyThread({
      chatwootContactId,
      chatwootInboxId,
      now,
    }: {
      chatwootContactId: number
      chatwootInboxId: number
      now: Date
    }) {
      const [thread] = await db
        .insert(portalChatThreads)
        .values({
          chatwootContactId,
          chatwootInboxId,
          portalUserId: null,
          tenantId,
          threadType: 'company',
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: { chatwootInboxId, updatedAt: now },
          target: [
            portalChatThreads.tenantId,
            portalChatThreads.chatwootContactId,
          ],
        })
        .returning(threadSelection)

      return mapThread(thread)
    },

    async upsertPrivateThread({
      chatwootContactId,
      chatwootInboxId,
      now,
      userId,
    }: {
      chatwootContactId: number
      chatwootInboxId: number
      now: Date
      userId: number
    }) {
      const [thread] = await db
        .insert(portalChatThreads)
        .values({
          chatwootContactId,
          chatwootInboxId,
          portalUserId: userId,
          tenantId,
          threadType: 'private',
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: { chatwootContactId, chatwootInboxId, updatedAt: now },
          target: [portalChatThreads.tenantId, portalChatThreads.portalUserId],
        })
        .returning(threadSelection)

      return mapThread(thread)
    },
  }
}

export type ChatThreadsRepository = ReturnType<
  typeof createChatThreadsRepository
>
```

Adjust the `onConflictDoUpdate` targets if Drizzle rejects partial unique index targets; use raw SQL migration plus `onConflictDoNothing()` followed by explicit `update/select`.

- [ ] **Step 7: Run repository tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/repository.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run schema-related tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-context/repository.test.ts src/modules/chat-messages/repository.test.ts src/modules/chatwoot-webhooks/repository.test.ts
```

Expected: PASS or only expected compile failures from new nullable columns. Fix compile errors without changing behavior.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add backend/src/db/schema.ts backend/drizzle backend/src/modules/chat-threads/repository.ts backend/src/modules/chat-threads/repository.test.ts
git commit -m "feat: add portal chat thread persistence"
```

---

## Task 3: Thread Listing Service And Route

**Files:**

- Create: `backend/src/modules/chat-threads/types.ts`
- Create: `backend/src/modules/chat-threads/service.ts`
- Create: `backend/src/modules/chat-threads/service.test.ts`
- Create: `backend/src/modules/chat-threads/routes.ts`
- Create: `backend/src/modules/chat-threads/routes.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write service tests**

Create `backend/src/modules/chat-threads/service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { createChatThreadsService } from './service.js'

type ContactTestDouble = {
  customAttributes: Record<string, unknown>
  email: string
  id: number
  name: string
}

function createThreadListService({
  companyContact = {
    customAttributes: {
      portal_contact_type: 'company',
      portal_enabled: true,
    },
    email: 'office@romashka.ru',
    id: 154,
    name: 'ООО "Ромашка"',
  },
  personContact = {
    customAttributes: {
      portal_client_company_contact_ids: '154',
      portal_contact_type: 'person',
      portal_enabled: true,
    },
    email: 'ivan@example.com',
    id: 44,
    name: 'Иван Петров',
  },
}: {
  companyContact?: ContactTestDouble | null
  personContact?: ContactTestDouble | null
} = {}) {
  return createChatThreadsService({
    chatThreadsRepository: {
      upsertCompanyThread: vi.fn().mockResolvedValue({
        chatwootContactId: 154,
        chatwootConversationId: null,
        chatwootInboxId: 9,
        id: 2,
        portalUserId: null,
        threadType: 'company',
      }),
      upsertPrivateThread: vi.fn().mockResolvedValue({
        chatwootContactId: 44,
        chatwootConversationId: null,
        chatwootInboxId: 9,
        id: 1,
        portalUserId: 7,
        threadType: 'private',
      }),
    },
    chatwootClient: {
      findContactById: vi.fn().mockResolvedValue(companyContact),
    },
    linkedContactResolver: vi.fn().mockResolvedValue(personContact),
    portalInboxId: 9,
  })
}

describe('createChatThreadsService', () => {
  it('returns private thread plus enabled company threads from person attributes', async () => {
    const service = createThreadListService()

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Только вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
        {
          id: 'company:154',
          subtitle: 'Общий чат компании',
          title: 'ООО "Ромашка"',
          type: 'company',
        },
      ],
    })
  })

  it('fails closed when a referenced company contact is missing', async () => {
    const service = createThreadListService({ companyContact: null })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_missing',
    })
  })

  it('fails closed when a referenced company contact has the wrong type', async () => {
    const service = createThreadListService({
      companyContact: {
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: true,
        },
        email: 'employee@romashka.ru',
        id: 154,
        name: 'Сотрудник Ромашки',
      },
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_type_invalid',
    })
  })

  it('fails closed when a referenced company contact is not enabled', async () => {
    const service = createThreadListService({
      companyContact: {
        customAttributes: {
          portal_contact_type: 'company',
          portal_enabled: false,
        },
        email: 'office@romashka.ru',
        id: 154,
        name: 'ООО "Ромашка"',
      },
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_disabled',
    })
  })

  it('fails closed when the current person contact is disabled', async () => {
    const service = createThreadListService({
      personContact: {
        customAttributes: {
          portal_client_company_contact_ids: '154',
          portal_contact_type: 'person',
          portal_enabled: false,
        },
        email: 'ivan@example.com',
        id: 44,
        name: 'Иван Петров',
      },
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_disabled',
    })
  })

  it('fails closed when the current person contact has the wrong type', async () => {
    const service = createThreadListService({
      personContact: {
        customAttributes: {
          portal_client_company_contact_ids: '',
          portal_contact_type: 'company',
          portal_enabled: true,
        },
        email: 'office@romashka.ru',
        id: 44,
        name: 'ООО "Ромашка"',
      },
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_type_invalid',
    })
  })
})
```

- [ ] **Step 2: Run service test to verify it fails**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/service.test.ts
```

Expected: FAIL because service/types do not exist.

- [ ] **Step 3: Define public types**

Create `backend/src/modules/chat-threads/types.ts`:

```ts
export type PortalChatThreadType = 'private' | 'company'

export type PortalChatThreadSummary = {
  id: string
  subtitle: string
  title: string
  type: PortalChatThreadType
}

export type PortalChatThreadsResponse = {
  activeThreadId: string
  threads: PortalChatThreadSummary[]
}

export function privateThreadId() {
  return 'private:me'
}

export function companyThreadId(chatwootCompanyContactId: number) {
  return `company:${chatwootCompanyContactId}`
}

export function parseThreadId(threadId: string) {
  if (threadId === privateThreadId()) {
    return { type: 'private' as const }
  }

  const match = /^company:(\d+)$/.exec(threadId)

  if (!match) {
    return null
  }

  const chatwootContactId = Number(match[1])

  return Number.isInteger(chatwootContactId) && chatwootContactId > 0
    ? { chatwootContactId, type: 'company' as const }
    : null
}
```

- [ ] **Step 4: Implement list service**

Create `backend/src/modules/chat-threads/service.ts`:

```ts
import type {
  ChatwootClient,
  ChatwootContact,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import {
  assertPortalPersonContactEnabled,
  parsePortalContactAttributes,
} from './contactAttributes.js'
import type { ChatThreadsRepository } from './repository.js'
import { companyThreadId, privateThreadId } from './types.js'

type CreateChatThreadsServiceOptions = {
  chatThreadsRepository: Pick<
    ChatThreadsRepository,
    'upsertCompanyThread' | 'upsertPrivateThread'
  >
  chatwootClient: Pick<ChatwootClient, 'findContactById'>
  linkedContactResolver: (userId: number) => Promise<ChatwootContact | null>
  now?: () => Date
  portalInboxId: number
}

function companyTitle(contact: ChatwootContact) {
  return contact.name?.trim() || `Компания #${contact.id}`
}

export function createChatThreadsService({
  chatThreadsRepository,
  chatwootClient,
  linkedContactResolver,
  now = () => new Date(),
  portalInboxId,
}: CreateChatThreadsServiceOptions) {
  return {
    async listCurrentUserThreads({ userId }: { userId: number }) {
      const personContact = await linkedContactResolver(userId)

      if (!personContact) {
        throw new ApiError(
          403,
          'portal_contact_missing',
          'Контакт портала не найден.',
        )
      }

      const personAttributes = assertPortalPersonContactEnabled(personContact)

      await chatThreadsRepository.upsertPrivateThread({
        chatwootContactId: personContact.id,
        chatwootInboxId: portalInboxId,
        now: now(),
        userId,
      })

      const threads = [
        {
          id: privateThreadId(),
          subtitle: 'Только вы и поддержка',
          title: 'Личный чат',
          type: 'private' as const,
        },
      ]

      for (const companyContactId of personAttributes.companyContactIds) {
        const companyContact =
          await chatwootClient.findContactById(companyContactId)

        if (!companyContact) {
          throw new ApiError(
            403,
            'portal_company_contact_missing',
            'Общий чат компании настроен некорректно.',
          )
        }

        const companyAttributes = parsePortalContactAttributes(
          companyContact.customAttributes,
        )

        if (companyAttributes.type !== 'company') {
          throw new ApiError(
            403,
            'portal_company_contact_type_invalid',
            'Общий чат компании настроен некорректно.',
          )
        }

        if (!companyAttributes.enabled) {
          throw new ApiError(
            403,
            'portal_company_contact_disabled',
            'Общий чат компании отключен.',
          )
        }

        await chatThreadsRepository.upsertCompanyThread({
          chatwootContactId: companyContact.id,
          chatwootInboxId: portalInboxId,
          now: now(),
        })

        threads.push({
          id: companyThreadId(companyContact.id),
          subtitle: 'Общий чат компании',
          title: companyTitle(companyContact),
          type: 'company',
        })
      }

      return {
        activeThreadId: privateThreadId(),
        threads,
      }
    },
  }
}

export type ChatThreadsService = ReturnType<typeof createChatThreadsService>
```

- [ ] **Step 5: Run service tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add route and route tests**

Create `backend/src/modules/chat-threads/routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import type { AuthService } from '../auth/service.js'
import { resolveAuthenticatedPortalUser } from '../chat-context/routes.js'
import type { ChatThreadsService } from './service.js'

type RegisterChatThreadsRoutesOptions = {
  authService: AuthService
  createChatThreadsService: (request: FastifyRequest) => ChatThreadsService
  env: AppEnv
}

export function registerChatThreadsRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatThreadsService,
    env,
  }: RegisterChatThreadsRoutesOptions,
) {
  app.get('/api/chat/threads', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })

    return createChatThreadsService(request).listCurrentUserThreads({
      userId: user.id,
    })
  })
}
```

Create route tests mirroring `chat-realtime/routes.test.ts`:

- unauthenticated `GET /api/chat/threads` returns 401;
- authenticated request returns the thread list from `ChatThreadsService`;
- disabled current person contact returns 403 with `portal_contact_disabled`;
- wrong-type current person contact returns 403 with
  `portal_contact_type_invalid`;
- malformed `portal_client_company_contact_ids` returns 403 with
  `portal_client_company_contact_ids_invalid`;
- missing referenced company contact returns 403 with
  `portal_company_contact_missing`;
- wrong-type referenced company contact returns 403 with
  `portal_company_contact_type_invalid`;
- disabled referenced company contact returns 403 with
  `portal_company_contact_disabled`.

- [ ] **Step 7: Wire route in app**

Modify `backend/src/app.ts`:

```ts
import { createChatThreadsRepository } from './modules/chat-threads/repository.js'
import { registerChatThreadsRoutes } from './modules/chat-threads/routes.js'
import { createChatThreadsService } from './modules/chat-threads/service.js'
```

Wire the factory with current tenant `chatwootPortalInboxId` and current request's Chatwoot client.

- [ ] **Step 8: Run route/app tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/routes.test.ts src/app.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add backend/src/app.ts backend/src/modules/chat-threads/types.ts backend/src/modules/chat-threads/service.ts backend/src/modules/chat-threads/service.test.ts backend/src/modules/chat-threads/routes.ts backend/src/modules/chat-threads/routes.test.ts backend/src/app.test.ts
git commit -m "feat: expose portal chat threads"
```

---

## Task 4: Thread Runtime Context And Lazy Conversation Bootstrap

**Files:**

- Modify: `backend/src/modules/chat-threads/types.ts`
- Modify: `backend/src/modules/chat-threads/service.ts`
- Modify: `backend/src/modules/chat-threads/service.test.ts`
- Modify: `backend/src/modules/chat-context/service.ts`
- Modify: `backend/src/modules/chat-context/routes.ts`
- Modify: `backend/src/modules/chat-context/service.test.ts`

- [ ] **Step 1: Add runtime context tests**

In `backend/src/modules/chat-threads/service.test.ts`, add:

```ts
function createCompanyThreadRuntimeService({
  createConversation = vi.fn(),
  personCompanyContactIds = '154',
  threadConversationId = null,
}: {
  createConversation?: ReturnType<typeof vi.fn>
  personCompanyContactIds?: string
  threadConversationId?: number | null
} = {}) {
  const updateThreadConversation = vi.fn().mockResolvedValue({
    chatwootContactId: 154,
    chatwootConversationId: 301,
    chatwootInboxId: 9,
    id: 2,
    portalUserId: null,
    threadType: 'company',
  })

  return {
    service: createChatThreadsService({
      chatThreadsRepository: createRepositoryStub({
        findThreadById: vi.fn().mockResolvedValue({
          chatwootContactId: 154,
          chatwootConversationId: threadConversationId,
          chatwootInboxId: 9,
          id: 2,
          portalUserId: null,
          threadType: 'company',
        }),
        updateThreadConversation,
      }),
      chatwootClient: createChatwootClientStub({
        createContactInbox: vi.fn().mockResolvedValue({
          inboxId: 9,
          sourceId: 'portal-contact:generated',
        }),
        createConversation,
        findContactById: vi.fn().mockResolvedValue({
          customAttributes: {
            portal_contact_type: 'company',
            portal_enabled: true,
          },
          email: 'office@romashka.ru',
          id: 154,
          name: 'ООО "Ромашка"',
        }),
        findContactPortalInboxSourceId: vi.fn().mockResolvedValue(null),
      }),
      linkedContactResolver: vi.fn().mockResolvedValue({
        customAttributes: {
          portal_client_company_contact_ids: personCompanyContactIds,
          portal_contact_type: 'person',
          portal_enabled: true,
        },
        email: 'ivan@example.com',
        id: 44,
        name: 'Иван Петров',
      }),
      portalInboxId: 9,
    }),
    updateThreadConversation,
  }
}

it('returns a company thread context without creating a Chatwoot conversation for read-only empty state', async () => {
  const createConversation = vi.fn()
  const { service } = createCompanyThreadRuntimeService({
    createConversation,
  })

  await expect(
    service.getCurrentUserThreadContext({
      threadId: 'company:154',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    activeThread: {
      id: 'company:154',
      title: 'ООО "Ромашка"',
      type: 'company',
    },
    chatwootConversation: null,
    reason: 'conversation_missing',
    result: 'not_ready',
  })
  expect(createConversation).not.toHaveBeenCalled()
})

it('bootstraps a company conversation only for writable context', async () => {
  const createConversation = vi.fn().mockResolvedValue({
    assigneeName: null,
    channelType: 'Channel::Api',
    createdAt: 1_776_000_000,
    id: 301,
    inboxId: 9,
    lastActivityAt: 1_776_000_000,
    status: 'open',
  })

  const { service, updateThreadConversation } =
    createCompanyThreadRuntimeService({
      createConversation,
    })

  await expect(
    service.ensureCurrentUserWritableThreadContext({
      threadId: 'company:154',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    chatwootConversation: {
      id: 301,
    },
    result: 'ready',
  })
  expect(createConversation).toHaveBeenCalledWith({
    contactId: 154,
    sourceId: 'portal-contact:generated',
  })
  expect(updateThreadConversation).toHaveBeenCalledWith(
    expect.objectContaining({
      chatwootConversationId: 301,
      id: 2,
    }),
  )
})

it('fails closed for a forged company thread not listed on the current person contact', async () => {
  const createConversation = vi.fn()
  const { service, updateThreadConversation } =
    createCompanyThreadRuntimeService({
      createConversation,
      personCompanyContactIds: '203',
    })

  await expect(
    service.getCurrentUserThreadContext({
      threadId: 'company:154',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    activeThread: null,
    chatwootConversation: null,
    reason: 'thread_access_denied',
    result: 'not_ready',
  })
  expect(createConversation).not.toHaveBeenCalled()
  expect(updateThreadConversation).not.toHaveBeenCalled()
})

it('fails closed for malformed public thread IDs', async () => {
  const createConversation = vi.fn()
  const { service, updateThreadConversation } =
    createCompanyThreadRuntimeService({
      createConversation,
    })

  await expect(
    service.getCurrentUserThreadContext({
      threadId: 'company:not-a-number',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    activeThread: null,
    chatwootConversation: null,
    reason: 'thread_invalid',
    result: 'not_ready',
  })
  expect(createConversation).not.toHaveBeenCalled()
  expect(updateThreadConversation).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run runtime context tests to verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/service.test.ts
```

Expected: FAIL because runtime methods do not exist.

- [ ] **Step 3: Add runtime types**

Extend `backend/src/modules/chat-threads/types.ts`:

```ts
export type PortalChatThreadRuntimeContext = {
  activeThread: PortalChatThreadSummary | null
  chatwootConversation: {
    assigneeName: string | null
    id: number
    inboxId: number
    lastActivityAt: number | null
    status: string
  } | null
  linkedContactId: number | null
  portalChatThreadId: number | null
  reason:
    | 'none'
    | 'chatwoot_not_configured'
    | 'chatwoot_unavailable'
    | 'contact_link_missing'
    | 'conversation_mapping_unavailable'
    | 'conversation_missing'
    | 'thread_access_denied'
    | 'thread_invalid'
  result: 'not_ready' | 'ready' | 'unavailable'
  targetChatwootContactId: number | null
  threadType: PortalChatThreadType | null
}
```

- [ ] **Step 4: Implement runtime resolution**

In `backend/src/modules/chat-threads/service.ts`, add methods:

```ts
async getCurrentUserThreadContext({
  threadId,
  userId,
}: {
  threadId: string
  userId: number
}): Promise<PortalChatThreadRuntimeContext>

async ensureCurrentUserWritableThreadContext(input): Promise<PortalChatThreadRuntimeContext>
```

Rules:

- Always validate person contact attributes first.
- `private:me` targets the person contact.
- `company:<id>` targets only a company contact listed in the current person contact's `portal_client_company_contact_ids`.
- Forged or malformed public `threadId` values must fail closed before Chatwoot
  conversation lookup/create.
- `getCurrentUserThreadContext` never creates a Chatwoot conversation.
- `ensureCurrentUserWritableThreadContext` creates/reuses contact inbox source ID and Chatwoot conversation when missing.
- Persist conversation ID with `chatThreadsRepository.updateThreadConversation`.

Use existing logic from `chat-context/service.ts`:

```ts
const sourceId =
  (await chatwootClient.findContactPortalInboxSourceId(targetContact.id)) ??
  (
    await chatwootClient.createContactInbox({
      contactId: targetContact.id,
      sourceId: `portal-contact:${randomUUID()}`,
    })
  ).sourceId

const conversation = await chatwootClient.createConversation({
  contactId: targetContact.id,
  sourceId,
})
```

- [ ] **Step 5: Keep `/api/chat/context` as compatibility shim**

Modify `backend/src/modules/chat-context/routes.ts` so `/api/chat/context` calls `GET /api/chat/threads` equivalent and returns a controlled legacy-compatible not-ready/ready response only for private thread during transition. Do not add new frontend dependencies on this endpoint.

- [ ] **Step 6: Run context and thread tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/service.test.ts src/modules/chat-context/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add backend/src/modules/chat-threads/types.ts backend/src/modules/chat-threads/service.ts backend/src/modules/chat-threads/service.test.ts backend/src/modules/chat-context/service.ts backend/src/modules/chat-context/routes.ts backend/src/modules/chat-context/service.test.ts
git commit -m "feat: resolve writable chat thread context"
```

---

## Task 5: Messages API, Thread-Scoped Ledger And Company Author Formatting

**Files:**

- Modify: `backend/src/modules/chat-messages/types.ts`
- Modify: `backend/src/modules/chat-messages/repository.ts`
- Modify: `backend/src/modules/chat-messages/repository.test.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`
- Modify: `backend/src/modules/chat-messages/routes.ts`
- Modify: `backend/src/test/appTestHelpers.ts`
- Modify: `backend/src/app.test.ts`

- [ ] **Step 0: Confirm send-rate-limit gate before company sends**

Before implementing company-thread send behavior, check the current decision for
`F-CHAT-SEC-001`.

Run:

```bash
test ! -f docs/Findings/F-CHAT-SEC-001-authenticated-chat-send-rate-limit.md
```

Expected: PASS if authenticated send rate limiting is already closed. If this
command fails, stop Task 5 and close `F-CHAT-SEC-001` with implementation and
backend tests in a separate checkpoint. Do not enable company sends while this
finding is still open.

- [ ] **Step 1: Add formatting tests**

In `backend/src/modules/chat-messages/service.test.ts`, add:

```ts
it('formats company thread text messages for Chatwoot with a Markdown author prefix', async () => {
  const createConversationIncomingMessage = vi.fn().mockResolvedValue({
    ...sentChatwootMessage,
    content: '**Иван Петров**\nДобрый день',
  })
  const service = createChatMessagesService({
    chatThreadsService: createThreadServiceStub({
      context: companyReadyContext,
    }),
    chatwootClient: createChatwootClientStub({
      createConversationIncomingMessage,
    }),
  })

  await service.sendCurrentUserTextMessage({
    clientMessageKey: 'portal-send:key',
    content: 'Добрый день',
    threadId: 'company:154',
    userId: 7,
  })

  expect(createConversationIncomingMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '**Иван Петров**\nДобрый день',
      conversationId: 301,
    }),
  )
})

it('strips company Markdown author prefix from portal history and exposes author role', async () => {
  const service = createChatMessagesService({
    chatMessagesRepository: null,
    chatThreadsRepository: {
      findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(
        new Map([
          [
            501,
            {
              authorDisplayName: 'Иван Петров',
              userId: 7,
            },
          ],
        ]),
      ),
    },
    chatThreadsService: createThreadServiceStub({
      context: companyReadyContext,
    }),
    chatwootClient: createChatwootClientStub({
      listConversationMessages: vi.fn().mockResolvedValue({
        hasMoreOlder: false,
        messages: [
          {
            ...sentChatwootMessage,
            content: '**Иван Петров**\nДобрый день',
            id: 501,
          },
        ],
        nextOlderCursor: null,
      }),
    }),
  })

  await expect(
    service.getCurrentUserChatMessages({
      threadId: 'company:154',
      userId: 8,
    }),
  ).resolves.toMatchObject({
    messages: [
      {
        authorName: 'Иван Петров',
        authorRole: 'company_member',
        content: 'Добрый день',
        direction: 'incoming',
      },
    ],
  })
})

it('does not read company history after membership is removed', async () => {
  const listConversationMessages = vi.fn()
  const service = createChatMessagesService({
    chatThreadsService: createThreadServiceStub({
      context: {
        ...companyReadyContext,
        activeThread: null,
        chatwootConversation: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
      },
    }),
    chatwootClient: createChatwootClientStub({
      listConversationMessages,
    }),
  })

  await expect(
    service.getCurrentUserChatMessages({
      threadId: 'company:154',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    messages: [],
    reason: 'thread_access_denied',
    result: 'not_ready',
  })
  expect(listConversationMessages).not.toHaveBeenCalled()
})

it('does not send to Chatwoot after company membership is removed', async () => {
  const createConversationIncomingMessage = vi.fn()
  const service = createChatMessagesService({
    chatThreadsService: createThreadServiceStub({
      writableContext: {
        ...companyReadyContext,
        activeThread: null,
        chatwootConversation: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
      },
    }),
    chatwootClient: createChatwootClientStub({
      createConversationIncomingMessage,
    }),
  })

  await expect(
    service.sendCurrentUserTextMessage({
      clientMessageKey: 'portal-send:key',
      content: 'Добрый день',
      threadId: 'company:154',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    reason: 'thread_access_denied',
    result: 'not_ready',
    sentMessage: null,
  })
  expect(createConversationIncomingMessage).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run message tests to verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/service.test.ts
```

Expected: FAIL because `threadId`, `authorRole` and company formatting are not implemented.

- [ ] **Step 3: Update message types**

Modify `backend/src/modules/chat-messages/types.ts`:

```ts
import type {
  PortalChatThreadRuntimeContext,
  PortalChatThreadSummary,
} from '../chat-threads/types.js'

export type PortalChatMessageAuthorRole =
  | 'agent'
  | 'company_member'
  | 'current_user'

export type PortalChatMessage = {
  attachments: PortalChatAttachment[]
  authorAvatarUrl?: string | null
  authorName: string
  authorRole: PortalChatMessageAuthorRole
  clientMessageKey?: string | null
  content: string | null
  contentType: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: number
  replyTo: PortalChatReplyPreview | null
  status: string
}

export type ChatMessagesSnapshot = Pick<
  PortalChatThreadRuntimeContext,
  'activeThread' | 'reason' | 'result'
> & {
  hasMoreOlder: boolean
  messages: PortalChatMessage[]
  nextOlderCursor: number | null
}

export type ChatSendResult = Pick<
  PortalChatThreadRuntimeContext,
  'activeThread' | 'reason' | 'result'
> & {
  sentMessage: PortalChatMessage | null
}
```

- [ ] **Step 4: Update repository ledger scope**

In `backend/src/modules/chat-messages/repository.ts`:

- Change `SendLedgerScope` to `{ clientMessageKey; portalChatThreadId }`.
- Keep `userId` on inserted rows as author.
- Insert `portalChatThreadId`.
- Set `authorDisplayNameSnapshot` on insert.
- Keep setting legacy `primaryConversationId` to the resolved Chatwoot conversation ID until the column is removed in a later cleanup. Public API code must stop accepting browser-selected `primaryConversationId`, but backend persistence can keep this column as an internal compatibility field.

Expected insert shape:

```ts
.values({
  authorDisplayNameSnapshot: input.authorDisplayNameSnapshot,
  clientMessageKey: input.clientMessageKey,
  messageKind: input.messageKind,
  payloadSha256: input.payloadSha256,
  portalChatThreadId: input.portalChatThreadId,
  primaryConversationId: input.primaryConversationId,
  processingToken: input.processingToken,
  status: 'processing',
  tenantId,
  updatedAt: input.now,
  userId: input.userId,
})
```

- [ ] **Step 5: Update routes to accept threadId**

Modify `backend/src/modules/chat-messages/routes.ts`:

```ts
const threadIdSchema = z.string().trim().min(1).max(80)

const chatMessagesQuerySchema = z.object({
  beforeMessageId: z.coerce.number().int().positive().optional(),
  threadId: threadIdSchema.optional(),
})

const sendChatMessageBodySchema = z.object({
  clientMessageKey: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1, 'Введите сообщение.').max(4000),
  replyToMessageId: z.number().int().positive().optional(),
  threadId: threadIdSchema,
})

const sendChatAttachmentFieldsSchema = z.object({
  clientMessageKey: z.string().trim().min(1).max(200),
  content: z.string().trim().max(4000).optional(),
  replyToMessageId: z.coerce.number().int().positive().optional(),
  threadId: threadIdSchema,
})
```

Default `GET /api/chat/messages` without `threadId` to `private:me` during rollout. Require `threadId` for sends.

Add route-level fail-closed tests:

- `GET /api/chat/messages?threadId=company:999` where current person contact
  does not list `999` returns a controlled not-ready/access-denied snapshot and
  does not call Chatwoot message listing;
- `POST /api/chat/messages` with forged `threadId=company:999` returns a
  controlled not-ready/access-denied send result and does not call Chatwoot
  outbound message create;
- attachment send with forged `threadId=company:999` is rejected before Chatwoot
  outbound attachment create;
- all send routes require `threadId`; only read history may default missing
  `threadId` to `private:me` during rollout.

- [ ] **Step 6: Update service to use thread runtime**

Change `createChatMessagesService` options:

```ts
type CreateChatMessagesServiceOptions = {
  chatThreadsRepository: Pick<
    ChatThreadsRepository,
    'findSendLedgerAuthorsByMessageIds'
  >
  chatThreadsService: Pick<
    ChatThreadsService,
    'ensureCurrentUserWritableThreadContext' | 'getCurrentUserThreadContext'
  >
  chatMessagesRepository?: ChatMessagesRepository | null
  chatwootClient: Pick<
    ChatwootClient,
    | 'createConversationIncomingAttachmentMessage'
    | 'createConversationIncomingMessage'
    | 'findConversationMessageById'
    | 'findConversationMessageBySourceId'
    | 'listConversationMessages'
  >
  now?: () => Date
}
```

Add helpers:

```ts
function escapeMarkdownStrongText(value: string) {
  return value.replace(/[\\*_`[\]]/g, '\\$&').trim()
}

function formatCompanyThreadContent({
  authorName,
  content,
}: {
  authorName: string
  content: string | null
}) {
  const prefix = `**${escapeMarkdownStrongText(authorName)}**`

  return content?.trim() ? `${prefix}\n${content.trim()}` : prefix
}

function parseCompanyThreadContent(content: string | null) {
  if (!content) {
    return { authorName: null, content: null }
  }

  const match = /^\*\*(.+?)\*\*(?:\n([\s\S]*))?$/.exec(content)

  if (!match) {
    return { authorName: null, content }
  }

  return {
    authorName: match[1].replace(/\\([\\*_`[\]])/g, '$1').trim() || null,
    content: match[2]?.trim() || null,
  }
}
```

Mapping rules:

- If thread runtime returns anything except `result='ready'`, history/send must
  return the controlled context result and must not call Chatwoot message list,
  text send or attachment send APIs.
- Agent messages: `authorRole='agent'`, `direction='incoming'`.
- Private contact messages: `authorRole='current_user'`, `direction='outgoing'`.
- Company contact messages with ledger `userId === current user`: `authorRole='current_user'`, `direction='outgoing'`.
- Company contact messages with ledger `userId !== current user`: `authorRole='company_member'`, `direction='incoming'`.
- Company contact messages without ledger: parse Markdown prefix and render as `company_member`.

- [ ] **Step 7: Run message and route tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/service.test.ts src/modules/chat-messages/repository.test.ts src/app.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add backend/src/modules/chat-messages backend/src/test/appTestHelpers.ts backend/src/app.test.ts
git commit -m "feat: send chat messages by portal thread"
```

---

## Task 6: Thread Realtime And Chatwoot Webhook Fanout

**Files:**

- Modify: `backend/src/modules/chat-realtime/hub.ts`
- Modify: `backend/src/modules/chat-realtime/hub.test.ts`
- Modify: `backend/src/modules/chat-realtime/routes.ts`
- Modify: `backend/src/modules/chat-realtime/routes.test.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/repository.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/repository.test.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.test.ts`

- [ ] **Step 1: Write realtime hub tests**

In `backend/src/modules/chat-realtime/hub.test.ts`, add:

```ts
it('publishes a company thread event to every subscriber on that thread', async () => {
  const hub = createChatRealtimeHub()
  const firstSend = vi.fn()
  const secondSend = vi.fn()

  hub.subscribe({
    send: firstSend,
    tenantId: 1,
    threadId: 'company:154',
    userId: 7,
  })
  hub.subscribe({
    send: secondSend,
    tenantId: 1,
    threadId: 'company:154',
    userId: 8,
  })

  await expect(
    hub.publishThreadMessages({
      createSnapshotForUser: vi.fn().mockResolvedValue({
        activeThread: {
          id: 'company:154',
          title: 'ООО "Ромашка"',
          type: 'company',
        },
        hasMoreOlder: false,
        messages: [],
        nextOlderCursor: null,
        reason: 'none',
        result: 'ready',
      }),
      tenantId: 1,
      threadId: 'company:154',
    }),
  ).resolves.toBe(2)

  expect(firstSend).toHaveBeenCalledTimes(1)
  expect(secondSend).toHaveBeenCalledTimes(1)
})

it('skips a subscribed user after company thread access is revoked', async () => {
  const hub = createChatRealtimeHub()
  const firstSend = vi.fn()
  const secondSend = vi.fn()

  hub.subscribe({
    send: firstSend,
    tenantId: 1,
    threadId: 'company:154',
    userId: 7,
  })
  hub.subscribe({
    send: secondSend,
    tenantId: 1,
    threadId: 'company:154',
    userId: 8,
  })

  await expect(
    hub.publishThreadMessages({
      createSnapshotForUser: vi.fn(async (userId) =>
        userId === 7
          ? {
              activeThread: null,
              hasMoreOlder: false,
              messages: [],
              nextOlderCursor: null,
              reason: 'thread_access_denied',
              result: 'not_ready',
            }
          : {
              activeThread: {
                id: 'company:154',
                title: 'ООО "Ромашка"',
                type: 'company',
              },
              hasMoreOlder: false,
              messages: [],
              nextOlderCursor: null,
              reason: 'none',
              result: 'ready',
            },
      ),
      tenantId: 1,
      threadId: 'company:154',
    }),
  ).resolves.toBe(1)

  expect(firstSend).not.toHaveBeenCalled()
  expect(secondSend).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run realtime tests to verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-realtime/hub.test.ts
```

Expected: FAIL because hub still keys by `primaryConversationId`.

- [ ] **Step 3: Refactor realtime hub**

Change subscription type:

```ts
type RealtimeSubscription = {
  send: (event: ChatRealtimeEvent) => void
  tenantId: number
  threadId: string
  userId: number
}
```

Key by `tenantId:threadId:userId` for limit and by `tenantId:threadId` for publication.

Add async publisher:

```ts
async publishThreadMessages({
  createSnapshotForUser,
  tenantId,
  threadId,
}: {
  createSnapshotForUser: (userId: number) => Promise<ChatMessagesSnapshot>
  tenantId: number
  threadId: string
}) {
  const subscriptions = subscriptionsByThreadKey.get(`${tenantId}:${threadId}`)

  if (!subscriptions) {
    return 0
  }

  let delivered = 0

  for (const subscription of subscriptions) {
    const snapshot = await createSnapshotForUser(subscription.userId)

    if (snapshot.result !== 'ready') {
      continue
    }

    subscription.send({
      data: snapshot,
      type: 'messages',
    })
    delivered += 1
  }

  return delivered
}
```

- [ ] **Step 4: Update realtime route**

Modify `backend/src/modules/chat-realtime/routes.ts`:

```ts
const chatRealtimeQuerySchema = z.object({
  threadId: z.string().trim().min(1).max(80),
})
```

Validate through `chatThreadsService.getCurrentUserThreadContext({ threadId, userId })`.

Add route tests:

- forged `threadId=company:999` where current person contact does not list
  company `999` returns a controlled access-denied response and does not
  subscribe;
- malformed `threadId=company:not-a-number` returns a controlled invalid-thread
  response and does not subscribe;
- a user whose membership is removed before reconnect cannot establish a new SSE
  subscription for that company thread.

Subscribe with:

```ts
realtimeHub.subscribe({
  send: (event) => writeSseEvent(reply.raw, event),
  tenantId: tenant.id,
  threadId: context.activeThread.id,
  userId: user.id,
})
```

- [ ] **Step 5: Update webhook repository mapping**

Change `findConversationMappingByChatwootConversationId()` to read `portal_chat_threads` and return:

```ts
{
  chatwootConversationId: number
  portalChatThreadId: number
  threadId: 'private:me' | `company:${number}`
  threadType: 'private' | 'company'
  userId: number | null
}
```

For private thread, `userId` is the thread owner. For company thread, `userId` is null and fanout goes to active subscribers.

- [ ] **Step 6: Update webhook service**

In `publishCurrentSnapshot`, call:

```ts
await realtimeHub.publishThreadMessages({
  createSnapshotForUser: (userId) =>
    chatMessagesService.getCurrentUserChatMessages({
      threadId: mapping.threadId,
      userId,
    }),
  tenantId,
  threadId: mapping.threadId,
})
```

For private mappings, this still works because only the private owner can subscribe.

Add webhook service tests:

- company webhook fanout calls `getCurrentUserChatMessages` once per active
  subscriber and sends only snapshots that still return `result='ready'`;
- a subscriber whose current person contact no longer lists the company contact
  receives no webhook event without needing to reconnect;
- an unmapped Chatwoot conversation remains `unroutable` and is not recovered
  from contact validity alone.

- [ ] **Step 7: Run realtime/webhook tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-realtime/hub.test.ts src/modules/chat-realtime/routes.test.ts src/modules/chatwoot-webhooks/repository.test.ts src/modules/chatwoot-webhooks/service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

Run:

```bash
git add backend/src/modules/chat-realtime backend/src/modules/chatwoot-webhooks
git commit -m "feat: publish realtime by chat thread"
```

---

## Task 7: Frontend Thread Switcher And Thread-Based Chat Runtime

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Modify: `frontend/src/features/chat/api/chatRealtimeClient.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/chatPageState.ts`
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
- Modify: `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
- Modify: `frontend/src/features/chat/lib/optimisticTextMessages.ts`
- Modify: `frontend/src/features/chat/lib/chatSnapshot.ts`
- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.test.tsx`

- [ ] **Step 1: Update frontend contract tests first**

In `frontend/src/features/chat/pages/ChatPage.test.tsx`, update mocks so initial load calls:

```ts
expect(fetch).toHaveBeenCalledWith('/api/chat/threads', expect.anything())
expect(fetch).toHaveBeenCalledWith(
  '/api/chat/messages?threadId=private%3Ame',
  expect.anything(),
)
```

Add switching test:

```ts
it('switches to a company thread from the header menu and reloads transcript by threadId', async () => {
  mockChatThreads({
    activeThreadId: 'private:me',
    threads: [
      { id: 'private:me', subtitle: 'Только вы и поддержка', title: 'Личный чат', type: 'private' },
      { id: 'company:154', subtitle: 'Общий чат компании', title: 'ООО "Ромашка"', type: 'company' },
    ],
  })
  mockChatMessages({ activeThreadId: 'private:me' })

  render(<ChatPage />)
  await user.click(screen.getByRole('button', { name: /открыть навигацию/i }))
  await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

  expect(fetch).toHaveBeenCalledWith(
    '/api/chat/messages?threadId=company%3A154',
    expect.anything(),
  )
})
```

- [ ] **Step 2: Run frontend chat page tests to verify they fail**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.test.tsx
```

Expected: FAIL because frontend still uses `primaryConversationId`.

- [ ] **Step 3: Update frontend types**

Modify `frontend/src/features/chat/types.ts`:

```ts
export type ChatThreadType = 'private' | 'company'

export type ChatThreadSummary = {
  id: string
  subtitle: string
  title: string
  type: ChatThreadType
}

export type ChatThreadsResponse = {
  activeThreadId: string
  threads: ChatThreadSummary[]
}

export type ChatMessageAuthorRole = 'agent' | 'company_member' | 'current_user'
```

Remove `ChatPrimaryConversation` from public snapshot types. Add `activeThread`.

- [ ] **Step 4: Update frontend API client**

Modify `frontend/src/features/chat/api/chatClient.ts`:

```ts
export async function getChatThreads() {
  return request<ChatThreadsResponse>('/chat/threads')
}

export async function getChatMessages({
  beforeMessageId,
  threadId,
}: {
  beforeMessageId?: number | null
  threadId: string
}) {
  const searchParams = new URLSearchParams()
  searchParams.set('threadId', threadId)

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  return request<ChatMessagesSnapshot>(`/chat/messages?${searchParams}`)
}
```

Change `sendChatMessage` and `sendChatAttachment` to require `threadId`.

- [ ] **Step 5: Update realtime client**

Modify `frontend/src/features/chat/api/chatRealtimeClient.ts`:

```ts
type OpenChatRealtimeInput = {
  onChatState: (snapshot: ChatMessagesSnapshot) => void
  onOpen?: () => void
  onMessages: (snapshot: ChatMessagesSnapshot) => void
  threadId: string
}

function buildRealtimeUrl(threadId: string) {
  const url = new URL(
    `${API_BASE_URL.replace(/\/+$/, '')}/chat/realtime`,
    window.location.origin,
  )
  url.searchParams.set('threadId', threadId)
  return url.toString()
}
```

- [ ] **Step 6: Update chat page state**

Modify `frontend/src/features/chat/pages/chatPageState.ts`:

```ts
import type { ChatMessagesSnapshot, ChatThreadSummary } from '../types'

export type ChatPageState =
  | {
      errorMessage: string
      selectedThreadId: string | null
      snapshot: ChatMessagesSnapshot | null
      status: 'error'
      threads: ChatThreadSummary[]
    }
  | {
      selectedThreadId: string | null
      snapshot: ChatMessagesSnapshot | null
      status: 'loading'
      threads: ChatThreadSummary[]
    }
  | {
      selectedThreadId: string
      snapshot: ChatMessagesSnapshot
      status: 'ready'
      threads: ChatThreadSummary[]
    }
```

- [ ] **Step 7: Update ChatPage runtime**

In `frontend/src/features/chat/pages/ChatPage.tsx`:

- Load `getChatThreads()` before `getChatMessages()`.
- Store `selectedThreadId`.
- On thread change:
  - clear `replyTarget`;
  - clear send/history errors;
  - clear optimistic sends or key them by thread;
  - load messages with new `threadId`.

Expected handler:

```ts
async function handleSelectThread(threadId: string) {
  if (threadId === pageState.selectedThreadId) {
    return
  }

  setReplyTarget(null)
  setSendErrorMessage(null)
  setHistoryErrorMessage(null)
  setPageState((currentState) => ({
    ...currentState,
    selectedThreadId: threadId,
    status: 'loading',
  }))

  const snapshot = await getChatMessages({ threadId })

  if (!isMountedRef.current) {
    return
  }

  setPageState((currentState) => ({
    ...currentState,
    selectedThreadId: threadId,
    snapshot,
    status: 'ready',
  }))
}
```

- [ ] **Step 8: Update header menu**

Modify `frontend/src/features/chat/components/ChatHeader.tsx` props:

```ts
type ChatHeaderProps = {
  activeThread: ChatThreadSummary | null
  isReady: boolean
  onSelectThread: (threadId: string) => void
  selectedThreadId: string | null
  threads: ChatThreadSummary[]
}
```

Render left menu:

```tsx
;<div className="px-3 py-2 text-left font-medium text-brand-800">Чаты</div>
{
  threads.map((thread) => (
    <button
      aria-current={thread.id === selectedThreadId ? 'true' : undefined}
      className="flex w-full items-center gap-2 rounded-[0.6rem] px-3 py-2 text-left text-slate-700"
      key={thread.id}
      onClick={() => onSelectThread(thread.id)}
      role="menuitem"
      type="button"
    >
      <span className="w-4 text-brand-800">
        {thread.id === selectedThreadId ? '✓' : ''}
      </span>
      <span className="min-w-0 truncate">{thread.title}</span>
    </button>
  ))
}
;<button disabled role="menuitem">
  Центр поддержки <span>скоро</span>
</button>
```

Header subtitle should use:

```tsx
const subtitleName = activeThread?.title ?? supportTeamName
```

- [ ] **Step 9: Update transcript bubble alignment**

Modify `MessageBubble.tsx`:

```ts
const isOutgoing = message.authorRole === 'current_user'
const shouldRenderAgentAvatar =
  message.authorRole === 'agent' && shouldRenderAuthorName(blockPosition)
const shouldRenderAuthorHeader =
  message.authorRole !== 'current_user' && shouldRenderAuthorName(blockPosition)
```

Render `AgentNameHeader` for both `agent` and `company_member`, but avatar only for `agent`.

- [ ] **Step 10: Run frontend chat tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx src/features/chat/components/ChatTranscript.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit Task 7**

Run:

```bash
git add frontend/src/features/chat
git commit -m "feat: switch portal chat threads in ui"
```

---

## Task 8: Full Verification, Docs Update And Cleanup

**Files:**

- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md`
- Modify: `docs/WORK_LOG.md`
- Optionally modify: `docs/Findings/*.md` if implementation opens or closes findings.

- [ ] **Step 1: Run backend tests**

Run:

```bash
pnpm --dir backend test
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck/build/lint**

Run:

```bash
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm lint
git diff --check
```

Expected: all PASS and `git diff --check` empty.

- [ ] **Step 4: Runtime validation with user-started services**

Do not start services from the agent. Ask the user to start the existing local portal/Chatwoot/Postgres stack. After the user confirms services are running, validate:

```bash
pnpm test:e2e
```

Expected: PASS. If Playwright is blocked by environment, record the blocker and run targeted frontend runtime tests already listed above.

- [ ] **Step 5: Manual Chatwoot admin validation**

With test Chatwoot contacts configured:

```text
Person:
  portal_contact_type = person
  portal_enabled = true
  portal_client_company_contact_ids = 154

Company:
  portal_contact_type = company
  portal_enabled = true
```

Validate:

- Portal left menu shows `Личный чат` and `ООО "Ромашка"`.
- Header subtitle changes to selected thread.
- First send in `ООО "Ромашка"` creates one company Chatwoot conversation.
- Chatwoot agent sees company contact in header.
- Chatwoot message body starts with bold Markdown author name.
- Portal transcript strips the Markdown prefix.
- Another portal user with the same company ID receives company realtime events.
- Removing company ID from a person contact blocks future history/send/realtime after reconnect.

- [ ] **Step 6: Update stable docs**

Update:

- `docs/ARCHITECTURE.md`: replace `primary conversation per tenant user` with thread model.
- `docs/DECISIONS.md`: supersede `D-009` or add `D-018. Portal chat uses portal-owned threads`.
- `docs/IMPLEMENTATION_PLAN.md`: record chat-thread model as active/completed follow-up before MT-9.
- `docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md`: update data model/API/realtime sections.
- `docs/WORK_LOG.md`: add one short completed bullet only after implementation and checks are complete; replace `Recommended Next Step`.

`WORK_LOG.md` addition:

```md
- Chat runtime переведен с одного primary conversation на portal-owned threads:
  личный чат и общие company-чаты через Chatwoot contact attributes.
```

Recommended next step:

```md
## Recommended Next Step

- Провести production smoke deploy для chat-thread runtime и затем вернуться к
  `MT-9` gate по `F-MT-004`.
```

- [ ] **Step 7: Final review**

Review changed areas:

```bash
git diff --stat
git diff -- backend/src/modules/chat-threads
git diff -- backend/src/modules/chat-messages
git diff -- backend/src/modules/chat-realtime
git diff -- backend/src/modules/chatwoot-webhooks
git diff -- frontend/src/features/chat
```

Look specifically for:

- browser-visible Chatwoot conversation IDs;
- any fallback that bypasses thread access validation;
- company thread send without Markdown author prefix;
- realtime fanout that publishes to a user without revalidating thread access;
- stale `primaryConversationId` in frontend requests.

- [ ] **Step 8: Commit Task 8**

Run:

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/IMPLEMENTATION_PLAN.md docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md docs/WORK_LOG.md
git commit -m "docs: document chat thread runtime"
```

---

## Final Acceptance Criteria

- Registration only accepts enabled Chatwoot `person` contacts.
- `GET /api/chat/threads` returns private thread plus enabled company threads from Chatwoot attributes.
- Browser sends `threadId`, not Chatwoot conversation ID.
- Empty thread view does not create Chatwoot conversation.
- First send lazily creates/reuses the correct Chatwoot conversation.
- Company thread messages sent to Chatwoot use Markdown author prefix.
- Portal UI strips company Markdown prefix and shows structured author metadata.
- Company thread history/send/realtime validates current Chatwoot attributes.
- Webhooks map Chatwoot conversation to portal thread and publish through thread subscriptions.
- Existing one-chat user path works as private thread compatibility path.
- Backend tests, frontend tests, typecheck/build/lint and `git diff --check` pass.
