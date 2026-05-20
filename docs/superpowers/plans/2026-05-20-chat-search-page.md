# Chat Search Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only full-screen `Поиск по чату` page for the selected portal chat thread.

**Chosen UI:** `C. Search page + context preview` - a dedicated search page with a search input, author filters, highlighted matches, nearby message context, and a jump-back action.

**Architecture:** Keep the browser on portal-owned `threadId` authority. Backend adds a read-only search endpoint that validates the current tenant/session/thread, scans visible Chatwoot history through the existing message mapper, and never creates or recovers conversations. Frontend reuses `ChatFullScreenPanel`, adds a search hook/page parallel to media/info, merges fresh current transcript results, and only scrolls to already-loaded transcript messages.

**Tech Stack:** Fastify, Zod, Chatwoot Application API wrapper, React 19, React Router, Tailwind CSS 4, Vitest, Testing Library, Playwright.

---

## File Structure

- Modify `backend/src/modules/chat-messages/types.ts`: add search result and response types.
- Create `backend/src/modules/chat-messages/search.ts`: pure search helpers for query normalization, match ranges, snippets, and result mapping.
- Create `backend/src/modules/chat-messages/search.test.ts`: pure helper coverage.
- Modify `backend/src/modules/chat-messages/service.ts`: add bounded read-only `getCurrentUserChatSearch`.
- Create `backend/src/modules/chat-messages/service.search.test.ts`: service coverage for authority, visibility, scan bounds, unavailable states, and no conversation creation.
- Modify `backend/src/modules/chat-messages/routes.ts`: add `GET /api/chat/threads/:threadId/search`.
- Create `backend/src/modules/chat-messages/routes.search.test.ts`: route validation/auth coverage.
- Modify `frontend/src/features/chat/types.ts`: add frontend search types and author filter type.
- Modify `frontend/src/features/chat/api/chatClient.ts`: add `getChatThreadSearch`.
- Create `frontend/src/features/chat/lib/chatSearch.ts`: frontend-only current snapshot merge and match helpers for visible transcript messages.
- Create `frontend/src/features/chat/lib/chatSearch.test.ts`: frontend helper coverage.
- Create `frontend/src/features/chat/pages/useChatSearchPanel.ts`: load/query/load-more/close state with stale request invalidation.
- Create `frontend/src/features/chat/pages/useChatSearchPanel.test.tsx`: hook coverage.
- Create `frontend/src/features/chat/components/ChatSearchPage.tsx`: full-screen search UI.
- Create `frontend/src/features/chat/components/ChatSearchPage.test.tsx`: component coverage.
- Modify `frontend/src/features/chat/components/ChatHeader.tsx`: enable `Поиск по чату` through a new callback.
- Modify `frontend/src/features/chat/components/ChatTranscript.tsx`: pass highlighted message id to bubbles.
- Modify `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`: render a temporary highlight state on already-loaded messages.
- Modify `frontend/src/features/chat/pages/ChatPage.tsx`: wire search hook/page and jump-back behavior.
- Add or modify focused frontend wiring tests under `frontend/src/features/chat/pages/`.
- Modify `tests/e2e/chat-read-model.spec.ts`: add Playwright coverage for private and group chat search.
- Modify `docs/roadmap/work-log.md`: update only after implementation, review, fixes, and checks are complete.

Repo rule for implementation: do not commit after individual tasks unless the user explicitly asks. Use one checkpoint commit after the whole search slice passes closure checks.

---

### Task 1: Backend Search Types And Pure Helpers

**Files:**

- Modify: `backend/src/modules/chat-messages/types.ts`
- Create: `backend/src/modules/chat-messages/search.ts`
- Test: `backend/src/modules/chat-messages/search.test.ts`

- [ ] **Step 1: Add failing pure helper tests**

Create `backend/src/modules/chat-messages/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  buildPortalChatSearchResults,
  findSearchMatchRanges,
  normalizeChatSearchQuery,
} from './search.js'
import type { PortalChatMessage } from './types.js'

function createMessage(
  overrides: Partial<PortalChatMessage> = {},
): PortalChatMessage {
  return {
    attachments: [],
    authorName: 'Ольга Support',
    authorRole: 'agent',
    content: 'Здравствуйте, вижу ваше обращение.',
    contentType: 'text',
    createdAt: '2026-05-20T08:10:00.000Z',
    direction: 'incoming',
    id: 204,
    replyTo: null,
    status: 'sent',
    ...overrides,
  }
}

describe('chat search helpers', () => {
  it('normalizes query by trimming and capping length', () => {
    expect(normalizeChatSearchQuery('  обращение  ')).toBe('обращение')
    expect(normalizeChatSearchQuery('x'.repeat(90))).toHaveLength(80)
  })

  it('finds case-insensitive match ranges in original content coordinates', () => {
    expect(findSearchMatchRanges('Ваше Обращение принято', 'обращ')).toEqual([
      { start: 5, end: 10 },
    ])
  })

  it('maps visible text messages to search results with context snippets', () => {
    const results = buildPortalChatSearchResults({
      messages: [
        createMessage({
          content: 'Предыдущий вопрос по договору',
          id: 203,
        }),
        createMessage({
          content: 'Здравствуйте, договор готов к подписанию.',
          id: 204,
        }),
        createMessage({
          authorName: 'Вы',
          authorRole: 'current_user',
          content: 'Спасибо, посмотрю договор сегодня.',
          direction: 'outgoing',
          id: 205,
        }),
      ],
      query: 'договор',
    })

    expect(results).toEqual([
      expect.objectContaining({
        afterSnippet: null,
        authorName: 'Вы',
        authorRole: 'current_user',
        beforeSnippet: 'Здравствуйте, договор готов к подписанию.',
        content: 'Спасибо, посмотрю договор сегодня.',
        id: 'message:205',
        matchRanges: [{ start: 18, end: 25 }],
        messageId: 205,
      }),
      expect.objectContaining({
        afterSnippet: 'Спасибо, посмотрю договор сегодня.',
        authorName: 'Ольга Support',
        beforeSnippet: 'Предыдущий вопрос по договору',
        content: 'Здравствуйте, договор готов к подписанию.',
        id: 'message:204',
        matchRanges: [{ start: 15, end: 22 }],
        messageId: 204,
      }),
      expect.objectContaining({
        afterSnippet: 'Здравствуйте, договор готов к подписанию.',
        beforeSnippet: null,
        content: 'Предыдущий вопрос по договору',
        id: 'message:203',
        matchRanges: [{ start: 20, end: 27 }],
        messageId: 203,
      }),
    ])
  })

  it('ignores messages without text content', () => {
    expect(
      buildPortalChatSearchResults({
        messages: [createMessage({ content: null })],
        query: 'договор',
      }),
    ).toEqual([])
  })
})
```

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/search.test.ts
```

Expected: fail because `search.ts` does not exist.

- [ ] **Step 2: Add backend search types**

In `backend/src/modules/chat-messages/types.ts`, add:

```ts
export type ChatSearchMatchRange = {
  end: number
  start: number
}

export type PortalChatSearchResult = {
  afterSnippet: string | null
  authorName: string
  authorRole: PortalChatMessageAuthorRole
  beforeSnippet: string | null
  content: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: `message:${number}`
  matchRanges: ChatSearchMatchRange[]
  messageId: number
}

export type ChatThreadSearchResponse = {
  activeThread: PublicChatThreadSummary | null
  hasMoreOlder: boolean
  items: PortalChatSearchResult[]
  nextOlderCursor: number | null
  query: string
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
}
```

- [ ] **Step 3: Implement pure search helpers**

Create `backend/src/modules/chat-messages/search.ts`:

```ts
import type {
  ChatSearchMatchRange,
  PortalChatMessage,
  PortalChatSearchResult,
} from './types.js'

export const CHAT_SEARCH_QUERY_MAX_LENGTH = 80
const CHAT_SEARCH_SNIPPET_MAX_LENGTH = 140

export function normalizeChatSearchQuery(query: string) {
  return query.trim().slice(0, CHAT_SEARCH_QUERY_MAX_LENGTH)
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('ru-RU')
}

export function findSearchMatchRanges(
  content: string,
  query: string,
): ChatSearchMatchRange[] {
  const normalizedQuery = normalizeSearchText(normalizeChatSearchQuery(query))

  if (normalizedQuery.length === 0) {
    return []
  }

  const normalizedContent = normalizeSearchText(content)
  const ranges: ChatSearchMatchRange[] = []
  let searchFromIndex = 0

  while (searchFromIndex < normalizedContent.length) {
    const matchIndex = normalizedContent.indexOf(
      normalizedQuery,
      searchFromIndex,
    )

    if (matchIndex === -1) {
      break
    }

    ranges.push({
      end: matchIndex + normalizedQuery.length,
      start: matchIndex,
    })
    searchFromIndex = matchIndex + Math.max(normalizedQuery.length, 1)
  }

  return ranges
}

function createSnippet(content: string | null) {
  const normalizedContent = content?.replace(/\s+/g, ' ').trim() ?? ''

  if (!normalizedContent) {
    return null
  }

  if (normalizedContent.length <= CHAT_SEARCH_SNIPPET_MAX_LENGTH) {
    return normalizedContent
  }

  return `${normalizedContent.slice(0, CHAT_SEARCH_SNIPPET_MAX_LENGTH - 1)}…`
}

export function buildPortalChatSearchResults({
  limit,
  messages,
  query,
}: {
  limit?: number
  messages: PortalChatMessage[]
  query: string
}): PortalChatSearchResult[] {
  const normalizedQuery = normalizeChatSearchQuery(query)
  const chronologicalMessages = [...messages].sort((left, right) => {
    return left.id - right.id
  })
  const results: PortalChatSearchResult[] = []

  for (const [index, message] of chronologicalMessages.entries()) {
    if (!message.content) {
      continue
    }

    const matchRanges = findSearchMatchRanges(message.content, normalizedQuery)

    if (matchRanges.length === 0) {
      continue
    }

    results.push({
      afterSnippet: createSnippet(chronologicalMessages[index + 1]?.content),
      authorName: message.authorName,
      authorRole: message.authorRole,
      beforeSnippet: createSnippet(chronologicalMessages[index - 1]?.content),
      content: message.content,
      createdAt: message.createdAt,
      direction: message.direction,
      id: `message:${message.id}`,
      matchRanges,
      messageId: message.id,
    })
  }

  const newestFirstResults = results.sort((left, right) => {
    return right.messageId - left.messageId
  })

  return limit ? newestFirstResults.slice(0, limit) : newestFirstResults
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/search.test.ts
```

Expected: pass.

---

### Task 2: Backend Service Search

**Files:**

- Modify: `backend/src/modules/chat-messages/service.ts`
- Test: `backend/src/modules/chat-messages/service.search.test.ts`

- [ ] **Step 1: Add failing service tests**

Create `backend/src/modules/chat-messages/service.search.test.ts` with focused fixtures copied from `service.media.test.ts`. Cover these cases:

```ts
it('searches only client-visible mapped text messages', async () => {
  const service = createService({
    chatwootMessages: [
      createChatwootMessage({
        content: 'Клиенту виден номер договора 123.',
        id: 301,
        messageType: 'outgoing',
      }),
      createChatwootMessage({
        content: 'internal договор hidden',
        id: 302,
        private: true,
      }),
    ],
  })

  await expect(
    service.getCurrentUserChatSearch({
      query: 'договор',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    hasMoreOlder: false,
    items: [
      expect.objectContaining({
        content: 'Клиенту виден номер договора 123.',
        messageId: 301,
      }),
    ],
    query: 'договор',
    reason: 'none',
    result: 'ready',
  })
})

it('does not create or recover a conversation while searching an empty thread', async () => {
  const ensureCurrentUserWritableThreadContext = vi.fn()
  const recoverCurrentUserWritableThreadContext = vi.fn()
  const service = createService({
    context: createReadyContext({ chatwootConversation: null }),
    ensureCurrentUserWritableThreadContext,
    recoverCurrentUserWritableThreadContext,
  })

  await expect(
    service.getCurrentUserChatSearch({
      query: 'договор',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    hasMoreOlder: false,
    items: [],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  })
  expect(ensureCurrentUserWritableThreadContext).not.toHaveBeenCalled()
  expect(recoverCurrentUserWritableThreadContext).not.toHaveBeenCalled()
})

it('scans older pages until it finds results or reaches the page limit', async () => {
  const service = createService({
    pages: [
      { hasMoreOlder: true, messages: [], nextOlderCursor: 200 },
      {
        hasMoreOlder: true,
        messages: [
          createChatwootMessage({
            content: 'Искомый договор найден во второй странице.',
            id: 190,
          }),
        ],
        nextOlderCursor: 190,
      },
    ],
  })

  await expect(
    service.getCurrentUserChatSearch({
      query: 'договор',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    hasMoreOlder: true,
    items: [expect.objectContaining({ messageId: 190 })],
    nextOlderCursor: 190,
  })
})

it('returns unavailable when Chatwoot history request fails', async () => {
  const service = createService({
    listConversationMessagesError: new ChatwootClientRequestError(
      'Chatwoot unavailable',
    ),
  })

  await expect(
    service.getCurrentUserChatSearch({
      query: 'договор',
      threadId: 'private:me',
      userId: 7,
    }),
  ).resolves.toMatchObject({
    items: [],
    reason: 'chatwoot_unavailable',
    result: 'unavailable',
  })
})

it('throws a controlled invalid cursor error', async () => {
  const service = createService({
    listConversationMessagesError: new ChatwootInvalidHistoryCursorError(),
  })

  await expect(
    service.getCurrentUserChatSearch({
      beforeMessageId: 999,
      query: 'договор',
      threadId: 'private:me',
      userId: 7,
    }),
  ).rejects.toMatchObject({
    code: 'invalid_history_cursor',
    statusCode: 400,
  })
})
```

Also add group authority coverage by using a `group:<id>` ready context and asserting `chatThreadsService.getCurrentUserThreadContext` receives that exact thread id.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/service.search.test.ts
```

Expected: fail because `getCurrentUserChatSearch` does not exist.

- [ ] **Step 2: Add response builder and constants**

In `backend/src/modules/chat-messages/service.ts`, import search helpers and types:

```ts
import {
  buildPortalChatSearchResults,
  normalizeChatSearchQuery,
} from './search.js'
import type {
  ChatThreadSearchResponse,
  PortalChatSearchResult,
} from './types.js'
```

Add constants near the other chat constants:

```ts
const CHAT_SEARCH_MAX_SCANNED_PAGES = 8
const CHAT_SEARCH_MAX_RESULTS = 20
```

Add builder near `buildMediaResponse`:

```ts
function buildSearchResponse(
  context: CurrentUserChatThreadContext,
  {
    hasMoreOlder = false,
    items = [],
    nextOlderCursor = null,
    query,
    reason = context.reason,
    result = context.result,
  }: {
    hasMoreOlder?: boolean
    items?: PortalChatSearchResult[]
    nextOlderCursor?: number | null
    query: string
    reason?: ChatThreadSearchResponse['reason']
    result?: ChatThreadSearchResponse['result']
  },
): ChatThreadSearchResponse {
  return {
    activeThread: context.activeThread,
    hasMoreOlder,
    items,
    nextOlderCursor,
    query,
    reason,
    result,
  }
}
```

- [ ] **Step 3: Implement `getCurrentUserChatSearch`**

Add the method inside the object returned from `createChatMessagesService`, before `getCurrentUserChatMessages`:

```ts
async getCurrentUserChatSearch({
  beforeMessageId = null,
  query,
  threadId = PRIVATE_CHAT_THREAD_ID,
  userId,
}: {
  beforeMessageId?: number | null
  query: string
  threadId?: string
  userId: number
}): Promise<ChatThreadSearchResponse> {
  const normalizedQuery = normalizeChatSearchQuery(query)
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (!context.chatwootConversation) {
    if (
      context.reason === 'conversation_missing' &&
      context.activeThread !== null
    ) {
      return buildSearchResponse(context, {
        query: normalizedQuery,
        reason: 'none',
        result: 'ready',
      })
    }

    return buildSearchResponse(context, {
      query: normalizedQuery,
    })
  }

  if (context.result !== 'ready') {
    return buildSearchResponse(context, {
      query: normalizedQuery,
    })
  }

  try {
    const conversationId = context.chatwootConversation.id
    let cursor = beforeMessageId
    let hasMoreOlder = false
    let nextOlderCursor: number | null = null
    const visibleMessages: PortalChatMessage[] = []

    for (
      let scannedPages = 0;
      scannedPages < CHAT_SEARCH_MAX_SCANNED_PAGES;
      scannedPages += 1
    ) {
      const page = await chatwootClient.listConversationMessages(
        conversationId,
        {
          beforeMessageId: cursor,
        },
      )

      if (page === null) {
        return buildSearchResponse(
          {
            ...context,
            chatwootConversation: null,
            reason: 'conversation_missing',
            result: 'not_ready',
          },
          { query: normalizedQuery },
        )
      }

      const replyTargetsById = await buildReplyTargetsById({
        chatwootClient,
        conversationId,
        messages: page.messages,
      })
      const ledgerAuthorsByMessageId = await findLedgerAuthorsForMessages({
        context,
        messageIds: [
          ...new Set([
            ...page.messages.map((message) => message.id),
            ...replyTargetsById.keys(),
          ]),
        ],
      })
      const messageMapperContext = createMessageMapperContext({
        context,
        ledgerAuthorsByMessageId,
        replyTargetsById,
        userId,
      })

      visibleMessages.push(
        ...page.messages
          .map((message) => mapPortalMessage(message, messageMapperContext))
          .filter((message): message is PortalChatMessage => message !== null),
      )
      hasMoreOlder = page.hasMoreOlder
      nextOlderCursor = page.nextOlderCursor

      const currentResults = buildPortalChatSearchResults({
        limit: CHAT_SEARCH_MAX_RESULTS,
        messages: visibleMessages,
        query: normalizedQuery,
      })

      if (
        currentResults.length >= CHAT_SEARCH_MAX_RESULTS ||
        !page.hasMoreOlder ||
        !page.nextOlderCursor
      ) {
        break
      }

      cursor = page.nextOlderCursor
    }

    return buildSearchResponse(context, {
      hasMoreOlder,
      items: buildPortalChatSearchResults({
        limit: CHAT_SEARCH_MAX_RESULTS,
        messages: visibleMessages,
        query: normalizedQuery,
      }),
      nextOlderCursor,
      query: normalizedQuery,
    })
  } catch (error) {
    if (error instanceof ChatwootInvalidHistoryCursorError) {
      throw new ApiError(
        400,
        'invalid_history_cursor',
        'History cursor is invalid for the current conversation.',
      )
    }

    if (
      error instanceof ChatwootClientConfigurationError ||
      error instanceof ChatwootClientRequestError
    ) {
      return buildSearchResponse(context, {
        query: normalizedQuery,
        reason: 'chatwoot_unavailable',
        result: 'unavailable',
      })
    }

    throw error
  }
}
```

Update the export block near the top of `service.ts` to include `ChatThreadSearchResponse` and `PortalChatSearchResult`.

- [ ] **Step 4: Run backend search service tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/search.test.ts src/modules/chat-messages/service.search.test.ts
```

Expected: pass.

---

### Task 3: Backend Search Route

**Files:**

- Modify: `backend/src/modules/chat-messages/routes.ts`
- Test: `backend/src/modules/chat-messages/routes.search.test.ts`

- [ ] **Step 1: Add failing route tests**

Create `backend/src/modules/chat-messages/routes.search.test.ts` using the same app/auth fixtures as `routes.media.test.ts`. Cover:

```ts
it('requires authentication for chat search', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/chat/threads/private%3Ame/search?q=договор',
  })

  expect(response.statusCode).toBe(401)
})

it('passes thread id, query, cursor, and user id to the service', async () => {
  const getCurrentUserChatSearch = vi.fn().mockResolvedValue({
    activeThread: privateThread,
    hasMoreOlder: true,
    items: [],
    nextOlderCursor: 205,
    query: 'договор',
    reason: 'none',
    result: 'ready',
  })

  const response = await authenticatedInject({
    createChatMessagesService: () => ({ getCurrentUserChatSearch }),
    method: 'GET',
    url: '/api/chat/threads/group%3A154/search?q=%20договор%20&beforeMessageId=205',
  })

  expect(response.statusCode).toBe(200)
  expect(getCurrentUserChatSearch).toHaveBeenCalledWith({
    beforeMessageId: 205,
    query: 'договор',
    threadId: 'group:154',
    userId: expect.any(Number),
  })
})

it('rejects a too-short query with a controlled validation error', async () => {
  const response = await authenticatedInject({
    method: 'GET',
    url: '/api/chat/threads/private%3Ame/search?q=a',
  })

  expect(response.statusCode).toBe(400)
})

it('rejects invalid cursors', async () => {
  const response = await authenticatedInject({
    method: 'GET',
    url: '/api/chat/threads/private%3Ame/search?q=договор&beforeMessageId=-1',
  })

  expect(response.statusCode).toBe(400)
})
```

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/routes.search.test.ts
```

Expected: fail because the route does not exist.

- [ ] **Step 2: Add route schemas**

In `backend/src/modules/chat-messages/routes.ts`, add:

```ts
const chatSearchParamsSchema = z
  .object({
    threadId: publicThreadIdSchema,
  })
  .strict()

const chatSearchQuerySchema = z
  .object({
    beforeMessageId: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(2).max(80),
  })
  .strict()
```

- [ ] **Step 3: Add `GET /api/chat/threads/:threadId/search`**

In `registerChatMessagesRoutes`, place the search route near the media route:

```ts
app.get('/api/chat/threads/:threadId/search', async (request, reply) => {
  const user = await resolveAuthenticatedPortalUser({
    authService,
    env,
    reply,
    request,
  })
  const params = chatSearchParamsSchema.parse(request.params)
  const query = chatSearchQuerySchema.parse(request.query)

  return createChatMessagesService(request).getCurrentUserChatSearch({
    beforeMessageId: query.beforeMessageId ?? null,
    query: query.q,
    threadId: params.threadId,
    userId: user.id,
  })
})
```

- [ ] **Step 4: Run backend route tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/routes.search.test.ts src/modules/chat-messages/service.search.test.ts src/modules/chat-messages/search.test.ts
```

Expected: pass.

---

### Task 4: Frontend Search Types, API, And Helpers

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/lib/chatSearch.ts`
- Test: `frontend/src/features/chat/lib/chatSearch.test.ts`

- [ ] **Step 1: Add failing frontend helper tests**

Create `frontend/src/features/chat/lib/chatSearch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  buildCurrentSnapshotSearchResults,
  filterChatSearchResults,
  mergeChatSearchWithCurrentSnapshot,
} from './chatSearch'
import type { ChatMessagesSnapshot, ChatThreadSearchResponse } from '../types'

const snapshot: ChatMessagesSnapshot = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  hasMoreOlder: false,
  messages: [
    {
      attachments: [],
      authorName: 'Вы',
      authorRole: 'current_user',
      content: 'Свежий договор из transcript snapshot',
      contentType: 'text',
      createdAt: '2026-05-20T08:15:00.000Z',
      direction: 'outgoing',
      id: 501,
      status: 'sent',
    },
    {
      attachments: [],
      authorName: 'Ольга Support',
      authorRole: 'agent',
      content: 'Ответ поддержки по договору',
      contentType: 'text',
      createdAt: '2026-05-20T08:20:00.000Z',
      direction: 'incoming',
      id: 502,
      status: 'sent',
    },
  ],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
}

describe('frontend chat search helpers', () => {
  it('builds search results from the current transcript snapshot', () => {
    expect(
      buildCurrentSnapshotSearchResults({
        currentSnapshot: snapshot,
        query: 'договор',
        selectedThreadId: 'private:me',
      }),
    ).toEqual([
      expect.objectContaining({ messageId: 502 }),
      expect.objectContaining({ messageId: 501 }),
    ])
  })

  it('deduplicates backend results by message id when merging snapshot results', () => {
    const backendResponse: ChatThreadSearchResponse = {
      activeThread: snapshot.activeThread,
      hasMoreOlder: false,
      items: [
        {
          afterSnippet: null,
          authorName: 'Вы',
          authorRole: 'current_user',
          beforeSnippet: null,
          content: 'Свежий договор из transcript snapshot',
          createdAt: '2026-05-20T08:15:00.000Z',
          direction: 'outgoing',
          id: 'message:501',
          matchRanges: [{ start: 7, end: 14 }],
          messageId: 501,
        },
      ],
      nextOlderCursor: null,
      query: 'договор',
      reason: 'none',
      result: 'ready',
    }

    const merged = mergeChatSearchWithCurrentSnapshot({
      currentSnapshot: snapshot,
      search: backendResponse,
      selectedThreadId: 'private:me',
    })

    expect(merged.items.map((item) => item.messageId)).toEqual([502, 501])
  })

  it('filters support results as agent and group member messages', () => {
    const results = buildCurrentSnapshotSearchResults({
      currentSnapshot: snapshot,
      query: 'договор',
      selectedThreadId: 'private:me',
    })

    expect(filterChatSearchResults(results, 'mine')).toHaveLength(1)
    expect(filterChatSearchResults(results, 'support')).toHaveLength(1)
    expect(filterChatSearchResults(results, 'all')).toHaveLength(2)
  })
})
```

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/lib/chatSearch.test.ts
```

Expected: fail because `chatSearch.ts` does not exist.

- [ ] **Step 2: Add frontend search types**

In `frontend/src/features/chat/types.ts`, add:

```ts
export type ChatSearchMatchRange = {
  end: number
  start: number
}

export type ChatSearchResult = {
  afterSnippet: string | null
  authorName: string
  authorRole: ChatMessageAuthorRole
  beforeSnippet: string | null
  content: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: `message:${number}`
  matchRanges: ChatSearchMatchRange[]
  messageId: number
}

export type ChatThreadSearchResponse = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  items: ChatSearchResult[]
  nextOlderCursor: number | null
  query: string
  reason: ChatThreadReason
  result: ChatThreadResult
}

export type ChatSearchAuthorFilter = 'all' | 'mine' | 'support'
```

- [ ] **Step 3: Add frontend API function**

In `frontend/src/features/chat/api/chatClient.ts`, import `ChatThreadSearchResponse` and add:

```ts
export async function getChatThreadSearch({
  beforeMessageId,
  query,
  threadId,
}: {
  beforeMessageId?: number | null
  query: string
  threadId: string
}) {
  const searchParams = new URLSearchParams()

  searchParams.set('q', query)

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  const queryString = searchParams.toString()

  return request<ChatThreadSearchResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/search${
      queryString ? `?${queryString}` : ''
    }`,
  )
}
```

- [ ] **Step 4: Implement frontend helper file**

Create `frontend/src/features/chat/lib/chatSearch.ts` with the same range/snippet semantics as backend:

```ts
import type {
  ChatMessage,
  ChatSearchAuthorFilter,
  ChatSearchMatchRange,
  ChatSearchResult,
  ChatMessagesSnapshot,
  ChatThreadSearchResponse,
} from '../types'

const CHAT_SEARCH_QUERY_MAX_LENGTH = 80
const CHAT_SEARCH_SNIPPET_MAX_LENGTH = 140

export function normalizeChatSearchQuery(query: string) {
  return query.trim().slice(0, CHAT_SEARCH_QUERY_MAX_LENGTH)
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('ru-RU')
}

export function findSearchMatchRanges(
  content: string,
  query: string,
): ChatSearchMatchRange[] {
  const normalizedQuery = normalizeSearchText(normalizeChatSearchQuery(query))

  if (!normalizedQuery) {
    return []
  }

  const normalizedContent = normalizeSearchText(content)
  const ranges: ChatSearchMatchRange[] = []
  let searchFromIndex = 0

  while (searchFromIndex < normalizedContent.length) {
    const matchIndex = normalizedContent.indexOf(
      normalizedQuery,
      searchFromIndex,
    )

    if (matchIndex === -1) {
      break
    }

    ranges.push({
      end: matchIndex + normalizedQuery.length,
      start: matchIndex,
    })
    searchFromIndex = matchIndex + Math.max(normalizedQuery.length, 1)
  }

  return ranges
}

function createSnippet(content: string | null | undefined) {
  const normalizedContent = content?.replace(/\s+/g, ' ').trim() ?? ''

  if (!normalizedContent) {
    return null
  }

  if (normalizedContent.length <= CHAT_SEARCH_SNIPPET_MAX_LENGTH) {
    return normalizedContent
  }

  return `${normalizedContent.slice(0, CHAT_SEARCH_SNIPPET_MAX_LENGTH - 1)}…`
}

function buildResultsFromMessages({
  messages,
  query,
}: {
  messages: ChatMessage[]
  query: string
}) {
  const chronologicalMessages = [...messages].sort((left, right) => {
    return left.id - right.id
  })
  const results: ChatSearchResult[] = []

  for (const [index, message] of chronologicalMessages.entries()) {
    if (!message.content) {
      continue
    }

    const matchRanges = findSearchMatchRanges(message.content, query)

    if (matchRanges.length === 0) {
      continue
    }

    results.push({
      afterSnippet: createSnippet(chronologicalMessages[index + 1]?.content),
      authorName: message.authorName,
      authorRole: message.authorRole,
      beforeSnippet: createSnippet(chronologicalMessages[index - 1]?.content),
      content: message.content,
      createdAt: message.createdAt,
      direction: message.direction,
      id: `message:${message.id}`,
      matchRanges,
      messageId: message.id,
    })
  }

  return results.sort((left, right) => right.messageId - left.messageId)
}

export function buildCurrentSnapshotSearchResults({
  currentSnapshot,
  query,
  selectedThreadId,
}: {
  currentSnapshot: ChatMessagesSnapshot | null
  query: string
  selectedThreadId: string
}) {
  if (
    !currentSnapshot ||
    currentSnapshot.result !== 'ready' ||
    currentSnapshot.activeThread?.id !== selectedThreadId
  ) {
    return []
  }

  return buildResultsFromMessages({
    messages: currentSnapshot.messages,
    query,
  })
}

export function mergeChatSearchWithCurrentSnapshot({
  currentSnapshot,
  search,
  selectedThreadId,
}: {
  currentSnapshot: ChatMessagesSnapshot | null
  search: ChatThreadSearchResponse
  selectedThreadId: string
}) {
  if (search.result !== 'ready') {
    return search
  }

  const existingMessageIds = new Set(search.items.map((item) => item.messageId))
  const currentSnapshotItems = buildCurrentSnapshotSearchResults({
    currentSnapshot,
    query: search.query,
    selectedThreadId,
  }).filter((item) => !existingMessageIds.has(item.messageId))

  if (currentSnapshotItems.length === 0) {
    return search
  }

  return {
    ...search,
    items: [...currentSnapshotItems, ...search.items],
  }
}

export function filterChatSearchResults(
  items: ChatSearchResult[],
  filter: ChatSearchAuthorFilter,
) {
  if (filter === 'mine') {
    return items.filter((item) => item.authorRole === 'current_user')
  }

  if (filter === 'support') {
    return items.filter((item) => item.authorRole !== 'current_user')
  }

  return items
}
```

- [ ] **Step 5: Run frontend helper tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/lib/chatSearch.test.ts
```

Expected: pass.

---

### Task 5: Search Panel Hook

**Files:**

- Create: `frontend/src/features/chat/pages/useChatSearchPanel.ts`
- Test: `frontend/src/features/chat/pages/useChatSearchPanel.test.tsx`

- [ ] **Step 1: Add failing hook tests**

Create `frontend/src/features/chat/pages/useChatSearchPanel.test.tsx` with the same Testing Library hook harness style as `useChatMediaPanel.test.tsx`. Cover:

```ts
it('opens without request and loads when the query has at least two characters', async () => {
  const getChatThreadSearch = vi.mocked(chatClient.getChatThreadSearch)
  const { result } = renderHook(() =>
    useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
  )

  act(() => result.current.openChatSearch())
  expect(result.current.state.isOpen).toBe(true)
  expect(getChatThreadSearch).not.toHaveBeenCalled()

  await act(async () => {
    await result.current.updateChatSearchQuery('договор')
  })

  expect(getChatThreadSearch).toHaveBeenCalledWith({
    beforeMessageId: null,
    query: 'договор',
    threadId: 'private:me',
  })
})

it('ignores stale results after close', async () => {
  const deferred = createDeferred<ChatThreadSearchResponse>()
  vi.mocked(chatClient.getChatThreadSearch).mockReturnValueOnce(
    deferred.promise,
  )
  const { result } = renderHook(() =>
    useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
  )

  act(() => result.current.openChatSearch())
  void act(async () => {
    await result.current.updateChatSearchQuery('договор')
  })
  act(() => result.current.closeChatSearch())
  await act(async () => {
    deferred.resolve(readySearchResponse)
    await deferred.promise
  })

  expect(result.current.state.isOpen).toBe(false)
  expect(result.current.state.search).toBeNull()
})

it('appends older search results', async () => {
  vi.mocked(chatClient.getChatThreadSearch)
    .mockResolvedValueOnce({
      ...readySearchResponse,
      hasMoreOlder: true,
      nextOlderCursor: 205,
    })
    .mockResolvedValueOnce({
      ...readySearchResponse,
      items: [olderResult],
      nextOlderCursor: null,
    })

  const { result } = renderHook(() =>
    useChatSearchPanel(createOptions({ selectedThreadId: 'private:me' })),
  )

  act(() => result.current.openChatSearch())
  await act(async () => {
    await result.current.updateChatSearchQuery('договор')
  })
  await act(async () => {
    await result.current.loadOlderChatSearch()
  })

  expect(result.current.state.search?.items).toEqual([
    ...readySearchResponse.items,
    olderResult,
  ])
})

it('merges current snapshot matches when backend returns empty results', async () => {
  vi.mocked(chatClient.getChatThreadSearch).mockResolvedValueOnce({
    ...readySearchResponse,
    items: [],
  })

  const { result } = renderHook(() =>
    useChatSearchPanel(
      createOptions({
        currentSnapshot: snapshotWithFreshMatchingMessage,
        selectedThreadId: 'private:me',
      }),
    ),
  )

  act(() => result.current.openChatSearch())
  await act(async () => {
    await result.current.updateChatSearchQuery('договор')
  })

  expect(result.current.state.search?.items).toEqual([
    expect.objectContaining({ messageId: 777 }),
  ])
})
```

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatSearchPanel.test.tsx
```

Expected: fail because the hook does not exist.

- [ ] **Step 2: Implement hook state and error helpers**

Create `frontend/src/features/chat/pages/useChatSearchPanel.ts`:

```ts
import { useRef, useState, type RefObject } from 'react'

import { ChatApiClientError, getChatThreadSearch } from '../api/chatClient'
import {
  mergeChatSearchWithCurrentSnapshot,
  normalizeChatSearchQuery,
} from '../lib/chatSearch'
import type {
  ChatMessagesSnapshot,
  ChatThreadReason,
  ChatThreadSearchResponse,
} from '../types'

export type ChatSearchPanelState = {
  isLoading: boolean
  isLoadingOlder: boolean
  isOpen: boolean
  query: string
  search: ChatThreadSearchResponse | null
}

const unavailableSearch: ChatThreadSearchResponse = {
  activeThread: null,
  hasMoreOlder: false,
  items: [],
  nextOlderCursor: null,
  query: '',
  reason: 'chatwoot_unavailable',
  result: 'unavailable',
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
```

- [ ] **Step 3: Implement loading methods**

Continue the same file:

```ts
type UseChatSearchPanelOptions = {
  currentSnapshot: ChatMessagesSnapshot | null
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
}

export function useChatSearchPanel({
  currentSnapshot,
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
}: UseChatSearchPanelOptions) {
  const requestSequenceRef = useRef(0)
  const [state, setState] = useState<ChatSearchPanelState>({
    isLoading: false,
    isLoadingOlder: false,
    isOpen: false,
    query: '',
    search: null,
  })

  function isCurrentRequest(requestId: number) {
    return isMountedRef.current && requestSequenceRef.current === requestId
  }

  async function updateChatSearchQuery(nextQuery: string) {
    const normalizedQuery = normalizeChatSearchQuery(nextQuery)

    if (!selectedThreadId) {
      return
    }

    if (normalizedQuery.length < 2) {
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        isLoading: false,
        isLoadingOlder: false,
        query: normalizedQuery,
        search: null,
      }))
      return
    }

    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setState((currentState) => ({
      ...currentState,
      isLoading: true,
      isLoadingOlder: false,
      query: normalizedQuery,
      search: null,
    }))

    try {
      const search = await getChatThreadSearch({
        beforeMessageId: null,
        query: normalizedQuery,
        threadId: selectedThreadId,
      })

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        query: normalizedQuery,
        search: mergeChatSearchWithCurrentSnapshot({
          currentSnapshot,
          search,
          selectedThreadId,
        }),
      })
    } catch (error) {
      if (!isCurrentRequest(requestId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (!isCurrentRequest(requestId)) {
          return
        }

        setState({
          isLoading: false,
          isLoadingOlder: false,
          isOpen: true,
          query: normalizedQuery,
          search: { ...unavailableSearch, query: normalizedQuery },
        })
        return
      }

      handleConnectionUnavailableError(error)
      if (!isCurrentRequest(requestId)) {
        return
      }

      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        query: normalizedQuery,
        search: {
          ...unavailableSearch,
          query: normalizedQuery,
          reason: readUnavailableReason(error),
        },
      })
    }
  }

  async function loadOlderChatSearch() {
    if (
      !selectedThreadId ||
      state.isLoading ||
      state.isLoadingOlder ||
      !state.search?.nextOlderCursor ||
      state.query.length < 2
    ) {
      return
    }

    const requestId = requestSequenceRef.current + 1
    const beforeMessageId = state.search.nextOlderCursor
    const query = state.query
    requestSequenceRef.current = requestId
    setState((currentState) => ({
      ...currentState,
      isLoadingOlder: true,
    }))

    try {
      const olderSearch = await getChatThreadSearch({
        beforeMessageId,
        query,
        threadId: selectedThreadId,
      })

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState((currentState) => {
        if (!currentState.search || olderSearch.result !== 'ready') {
          return {
            ...currentState,
            isLoadingOlder: false,
          }
        }

        return {
          ...currentState,
          isLoadingOlder: false,
          search: {
            ...olderSearch,
            items: [...currentState.search.items, ...olderSearch.items],
          },
        }
      })
    } catch (error) {
      if (!isCurrentRequest(requestId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (!isCurrentRequest(requestId)) {
          return
        }
      } else {
        handleConnectionUnavailableError(error)
      }

      if (!isCurrentRequest(requestId)) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        isLoadingOlder: false,
      }))
    }
  }

  return {
    closeChatSearch: () => {
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        isLoading: false,
        isLoadingOlder: false,
        isOpen: false,
      }))
    },
    loadOlderChatSearch,
    openChatSearch: () => {
      requestSequenceRef.current += 1
      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        query: '',
        search: null,
      })
    },
    retryChatSearch: () => updateChatSearchQuery(state.query),
    state,
    updateChatSearchQuery,
  }
}
```

- [ ] **Step 4: Run hook tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatSearchPanel.test.tsx src/features/chat/lib/chatSearch.test.ts
```

Expected: pass.

---

### Task 6: Search Page Component

**Files:**

- Create: `frontend/src/features/chat/components/ChatSearchPage.tsx`
- Test: `frontend/src/features/chat/components/ChatSearchPage.test.tsx`

- [ ] **Step 1: Add failing component tests**

Create `frontend/src/features/chat/components/ChatSearchPage.test.tsx`:

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatSearchPage } from './ChatSearchPage'
import type { ChatThreadSearchResponse } from '../types'

const readySearch: ChatThreadSearchResponse = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  hasMoreOlder: true,
  items: [
    {
      afterSnippet: 'Спасибо, проверю сегодня.',
      authorName: 'Ольга Support',
      authorRole: 'agent',
      beforeSnippet: 'Добрый день.',
      content: 'Договор готов к подписанию.',
      createdAt: '2026-05-20T08:20:00.000Z',
      direction: 'incoming',
      id: 'message:204',
      matchRanges: [{ start: 0, end: 7 }],
      messageId: 204,
    },
  ],
  nextOlderCursor: 204,
  query: 'договор',
  reason: 'none',
  result: 'ready',
}

describe('ChatSearchPage', () => {
  it('renders search input, highlighted result, context, and load more', async () => {
    const user = userEvent.setup()
    const onLoadOlder = vi.fn()
    const onQueryChange = vi.fn()
    const onResultSelect = vi.fn()

    render(
      <ChatSearchPage
        isLoading={false}
        isLoadingOlder={false}
        onBack={vi.fn()}
        onLoadOlder={onLoadOlder}
        onQueryChange={onQueryChange}
        onRetry={vi.fn()}
        onResultSelect={onResultSelect}
        query="договор"
        search={readySearch}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Поиск по чату' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Поиск по чату')).toHaveValue('договор')
    expect(screen.getByText('Личный чат')).toBeVisible()
    expect(screen.getByText('Добрый день.')).toBeVisible()
    expect(screen.getByText('Спасибо, проверю сегодня.')).toBeVisible()
    expect(screen.getByText('Договор')).toHaveAttribute('data-search-match')

    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(onLoadOlder).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /Открыть место/ }))
    expect(onResultSelect).toHaveBeenCalledWith(readySearch.items[0])
  })

  it('shows initial, short-query, and empty states', () => {
    const props = {
      isLoading: false,
      isLoadingOlder: false,
      onBack: vi.fn(),
      onLoadOlder: vi.fn(),
      onQueryChange: vi.fn(),
      onRetry: vi.fn(),
      onResultSelect: vi.fn(),
      search: null,
    }

    const { rerender } = render(<ChatSearchPage {...props} query="" />)
    expect(screen.getByText('Введите запрос, чтобы найти сообщение')).toBeVisible()

    rerender(<ChatSearchPage {...props} query="д" />)
    expect(screen.getByText('Введите минимум 2 символа')).toBeVisible()

    rerender(
      <ChatSearchPage
        {...props}
        query="нет"
        search={{ ...readySearch, hasMoreOlder: false, items: [], query: 'нет' }}
      />,
    )
    expect(screen.getByText('По этому запросу ничего не найдено')).toBeVisible()
  })

  it('filters by author group on the page only', async () => {
    const user = userEvent.setup()

    render(
      <ChatSearchPage
        isLoading={false}
        isLoadingOlder={false}
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onQueryChange={vi.fn()}
        onRetry={vi.fn()}
        onResultSelect={vi.fn()}
        query="договор"
        search={{
          ...readySearch,
          items: [
            readySearch.items[0],
            {
              ...readySearch.items[0],
              authorName: 'Вы',
              authorRole: 'current_user',
              content: 'Мой договор подписан.',
              direction: 'outgoing',
              id: 'message:205',
              messageId: 205,
            },
          ],
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Мои' }))
    expect(screen.getByText('Мой договор подписан.')).toBeVisible()
    expect(screen.queryByText('Договор готов к подписанию.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Поддержка' }))
    expect(screen.getByText('Договор готов к подписанию.')).toBeVisible()
    expect(screen.queryByText('Мой договор подписан.')).toBeNull()
  })
})
```

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatSearchPage.test.tsx
```

Expected: fail because the component does not exist.

- [ ] **Step 2: Implement `ChatSearchPage`**

Create `frontend/src/features/chat/components/ChatSearchPage.tsx`. Required structure:

```tsx
import { useState, type ReactNode } from 'react'

import { filterChatSearchResults } from '../lib/chatSearch'
import type {
  ChatSearchAuthorFilter,
  ChatSearchMatchRange,
  ChatSearchResult,
  ChatThreadSearchResponse,
} from '../types'
import { ChatFullScreenPanel } from './ChatFullScreenPanel'

type ChatSearchPageProps = {
  isLoading: boolean
  isLoadingOlder?: boolean
  onBack: () => void
  onLoadOlder: () => void
  onQueryChange: (query: string) => void
  onRetry: () => void
  onResultSelect: (result: ChatSearchResult) => void
  query: string
  search: ChatThreadSearchResponse | null
}
```

Implement these helpers inside the file:

```tsx
const searchFilters: Array<{ key: ChatSearchAuthorFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'mine', label: 'Мои' },
  { key: 'support', label: 'Поддержка' },
]

const SEARCH_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
})

function renderHighlightedText(
  content: string,
  matchRanges: ChatSearchMatchRange[],
) {
  if (matchRanges.length === 0) {
    return content
  }

  const nodes: ReactNode[] = []
  let cursor = 0

  for (const range of matchRanges) {
    if (range.start > cursor) {
      nodes.push(content.slice(cursor, range.start))
    }

    nodes.push(
      <mark
        className="rounded bg-amber-100 px-0.5 text-slate-950"
        data-search-match
        key={`${range.start}:${range.end}`}
      >
        {content.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  }

  if (cursor < content.length) {
    nodes.push(content.slice(cursor))
  }

  return nodes
}
```

Render:

- `ChatFullScreenPanel` with `title="Поиск по чату"`, `loadingMessage="Ищем сообщения."`, `unavailableMessage="Не удалось выполнить поиск."`.
- `input` labelled `Поиск по чату`, one-line, `value={query}`, `onChange={(event) => onQueryChange(event.target.value)}`.
- thread identity from `search.activeThread`.
- segmented author filter buttons.
- result count line: `${items.length} совпадений`.
- result cards with author, date, highlighted content, optional previous/next context, and a full-width button `Открыть место в чате`.
- empty states from the spec.
- `Показать ещё` button when `search.hasMoreOlder` is true.

Keep styling aligned with `ChatMediaPage`: `mx-auto max-w-md`, compact neutral surfaces, 8px-ish radii, no nested cards.

- [ ] **Step 3: Run component tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatSearchPage.test.tsx
```

Expected: pass.

---

### Task 7: Chat Page Wiring And Jump Highlight

**Files:**

- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.tsx`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Test: focused frontend page/header tests under `frontend/src/features/chat/pages/`

- [ ] **Step 1: Add failing wiring tests**

Add or create a focused test, for example `frontend/src/features/chat/pages/ChatPage.search.test.tsx`, covering:

```ts
it('opens chat search from the menu and sends query to the selected thread', async () => {
  vi.mocked(chatClient.getChatThreadSearch).mockResolvedValueOnce(readySearch)

  render(<ChatPage />)
  await screen.findByRole('heading', { name: 'Личный чат' })

  await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
  await user.click(screen.getByRole('menuitem', { name: 'Поиск по чату' }))
  await user.type(screen.getByLabelText('Поиск по чату'), 'договор')

  expect(chatClient.getChatThreadSearch).toHaveBeenCalledWith({
    beforeMessageId: null,
    query: 'договор',
    threadId: 'private:me',
  })
  expect(await screen.findByText('Договор готов к подписанию.')).toBeVisible()
})

it('closes search and highlights an already-loaded transcript message', async () => {
  vi.mocked(chatClient.getChatThreadSearch).mockResolvedValueOnce(readySearch)
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView

  render(<ChatPage />)
  await screen.findByText('Договор готов к подписанию.')

  await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
  await user.click(screen.getByRole('menuitem', { name: 'Поиск по чату' }))
  await user.type(screen.getByLabelText('Поиск по чату'), 'договор')
  await user.click(await screen.findByRole('button', { name: /Открыть место/ }))

  expect(screen.queryByRole('heading', { name: 'Поиск по чату' })).toBeNull()
  expect(scrollIntoView).toHaveBeenCalled()
  expect(document.querySelector('[data-message-highlighted="true"]')).not.toBeNull()
})
```

Run the focused test command after choosing the exact file:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.search.test.tsx
```

Expected: fail because search wiring does not exist.

- [ ] **Step 2: Enable menu callback in `ChatHeader`**

In `ChatHeaderProps`, add:

```ts
onOpenThreadSearch: () => void
```

Destructure it and update the search menu item:

```tsx
<ChatMenuItem
  disabled={!selectedThreadId}
  icon={<SearchIcon className="h-5 w-5" />}
  label="Поиск по чату"
  onSelect={() => {
    closeMenus()
    onOpenThreadSearch()
  }}
/>
```

- [ ] **Step 3: Add highlight support to transcript bubbles**

In `MessageBubbleProps`, add:

```ts
isHighlighted?: boolean
```

Destructure it and update the outer wrapper:

```tsx
<div
  className={cn(
    'group flex scroll-mt-20 rounded-[0.9rem] transition-shadow',
    isHighlighted ? 'shadow-[0_0_0_4px_rgb(250_204_21_/_0.28)]' : '',
    isOutgoing ? 'items-end' : 'items-start',
    isOutgoing ? 'justify-end' : 'justify-start',
    getMessageWrapperSpacingClass({
      blockPosition,
      hasDateDivider,
      index,
    }),
  )}
  data-message-highlighted={isHighlighted ? 'true' : undefined}
  data-message-id={message.id}
>
```

In `ChatTranscriptProps`, add:

```ts
highlightedMessageId?: number | null
```

Pass it to `MessageBubble`:

```tsx
isHighlighted={highlightedMessageId === message.id}
```

- [ ] **Step 4: Wire search hook and page in `ChatPage`**

Import:

```ts
import { ChatSearchPage } from '../components/ChatSearchPage'
import type { ChatSearchResult } from '../types'
import { useChatSearchPanel } from './useChatSearchPanel'
```

Add state:

```ts
const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(
  null,
)
```

Create hook after media hook:

```ts
const chatSearchPanel = useChatSearchPanel({
  currentSnapshot: pageState.status === 'ready' ? pageState.snapshot : null,
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId: pageState.selectedThreadId,
})
```

Add helper:

```ts
function handleOpenSearchResult(result: ChatSearchResult) {
  chatSearchPanel.closeChatSearch()

  const isLoadedInTranscript = visibleMessages.some(
    (message) => message.id === result.messageId,
  )

  if (!isLoadedInTranscript) {
    return
  }

  setHighlightedMessageId(result.messageId)
}
```

Add effect:

```ts
useEffect(() => {
  if (highlightedMessageId === null) {
    return
  }

  const frameId = window.requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(`[data-message-id="${highlightedMessageId}"]`)
      ?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
  })
  const timeoutId = window.setTimeout(() => {
    setHighlightedMessageId((currentMessageId) =>
      currentMessageId === highlightedMessageId ? null : currentMessageId,
    )
  }, 1800)

  return () => {
    window.cancelAnimationFrame(frameId)
    window.clearTimeout(timeoutId)
  }
}, [highlightedMessageId])
```

Pass to header:

```tsx
onOpenThreadSearch={chatSearchPanel.openChatSearch}
```

Pass to transcript:

```tsx
highlightedMessageId = { highlightedMessageId }
```

Render the page after media/info pages:

```tsx
{
  chatSearchPanel.state.isOpen ? (
    <ChatSearchPage
      isLoading={chatSearchPanel.state.isLoading}
      isLoadingOlder={chatSearchPanel.state.isLoadingOlder}
      onBack={chatSearchPanel.closeChatSearch}
      onLoadOlder={() => {
        void chatSearchPanel.loadOlderChatSearch()
      }}
      onQueryChange={(query) => {
        void chatSearchPanel.updateChatSearchQuery(query)
      }}
      onRetry={() => {
        void chatSearchPanel.retryChatSearch()
      }}
      onResultSelect={handleOpenSearchResult}
      query={chatSearchPanel.state.query}
      search={chatSearchPanel.state.search}
    />
  ) : null
}
```

- [ ] **Step 5: Run focused frontend wiring tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/ChatPage.search.test.tsx src/features/chat/components/ChatSearchPage.test.tsx src/features/chat/pages/useChatSearchPanel.test.tsx
```

Expected: pass.

---

### Task 8: Playwright Search E2E

**Files:**

- Modify: `tests/e2e/chat-read-model.spec.ts`

- [ ] **Step 1: Add private chat search E2E**

Add a test to `tests/e2e/chat-read-model.spec.ts`:

```ts
test('opens private chat search, finds a visible message, and returns to transcript', async ({
  page,
}) => {
  const searchRequests: string[] = []

  await routePrivateThreads(page)
  await routeStoppedRealtime(page)
  await page.route('**/api/chat/messages**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        createReadySnapshot({
          hasMoreOlder: false,
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Договор готов к подписанию.',
              contentType: 'text',
              createdAt: '2026-05-20T08:20:00.000Z',
              direction: 'incoming',
              id: 204,
              status: 'sent',
            },
          ],
          nextOlderCursor: null,
        }),
      ),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/threads/*/search**', async (route) => {
    const requestUrl = new URL(route.request().url())

    searchRequests.push(`${requestUrl.pathname}${requestUrl.search}`)
    await route.fulfill({
      body: JSON.stringify({
        activeThread: privateThread,
        hasMoreOlder: false,
        items: [
          {
            afterSnippet: null,
            authorName: 'Ольга Support',
            authorRole: 'agent',
            beforeSnippet: null,
            content: 'Договор готов к подписанию.',
            createdAt: '2026-05-20T08:20:00.000Z',
            direction: 'incoming',
            id: 'message:204',
            matchRanges: [{ start: 0, end: 7 }],
            messageId: 204,
          },
        ],
        nextOlderCursor: null,
        query: 'договор',
        reason: 'none',
        result: 'ready',
      }),
      contentType: 'application/json',
      status: 200,
    })
  })

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByText('Договор готов к подписанию.')).toBeVisible()
  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Поиск по чату' }).click()

  const searchPage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Поиск по чату' }),
  })

  await searchPage.getByLabel('Поиск по чату').fill('договор')
  await expect(
    searchPage.getByText('Договор готов к подписанию.'),
  ).toBeVisible()
  await expect(searchPage.locator('[data-search-match]').first()).toHaveText(
    'Договор',
  )

  await searchPage.getByRole('button', { name: /Открыть место/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Поиск по чату' }),
  ).toBeHidden()
  await expect(page.getByText('Договор готов к подписанию.')).toBeVisible()
  expect(searchRequests).toEqual([
    '/api/chat/threads/private%3Ame/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80',
  ])
})
```

- [ ] **Step 2: Add group search E2E with context and load more**

Add a second test for `group:154` that:

- routes group messages;
- opens the group from the nav menu;
- opens `Поиск по чату`;
- returns one result with `beforeSnippet` and `afterSnippet`;
- returns `hasMoreOlder: true` and `nextOlderCursor: 804`;
- clicks `Показать ещё`;
- asserts second request is `/api/chat/threads/group%3A154/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80&beforeMessageId=804`;
- clicks back and sees the group transcript.

Use the same page width assertion as media/info:

```ts
const viewportSize = page.viewportSize()
const searchPageBox = await searchPage.boundingBox()

expect(Math.round(searchPageBox?.width ?? 0)).toBe(
  Math.min(viewportSize?.width ?? 0, 500),
)
```

- [ ] **Step 3: Run targeted Playwright test**

Run:

```bash
pnpm test:e2e -- tests/e2e/chat-read-model.spec.ts
```

Expected: pass.

---

### Task 9: Review, Full Checks, And Work Log

**Files:**

- Modify: `docs/roadmap/work-log.md`

- [ ] **Step 1: Run targeted backend checks**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/search.test.ts src/modules/chat-messages/service.search.test.ts src/modules/chat-messages/routes.search.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run targeted frontend checks**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/lib/chatSearch.test.ts src/features/chat/pages/useChatSearchPanel.test.tsx src/features/chat/components/ChatSearchPage.test.tsx src/features/chat/pages/ChatPage.search.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Run required broader checks**

Run:

```bash
pnpm --dir backend test
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/chat-read-model.spec.ts
git diff --check
```

Expected:

- backend suite passes;
- frontend suite passes;
- frontend typecheck passes;
- root lint/code-health passes;
- full build passes;
- chat read model Playwright spec passes;
- `git diff --check` prints no whitespace errors.

- [ ] **Step 4: Manual code review checklist**

Review the touched area before updating the work log:

- backend route never accepts Chatwoot conversation id from browser;
- backend service uses `getCurrentUserThreadContext`, not writable/recovery methods;
- no search path creates a Chatwoot conversation;
- private/hidden Chatwoot messages are searched only after `mapPortalMessage`;
- query and cursor validation are controlled;
- frontend search page does not use direct Chatwoot URLs or IDs as authority;
- stale request handling increments sequence on close, short query, and thread changes;
- current snapshot merge deduplicates by `messageId`;
- jump only scrolls/highlights messages already loaded in transcript;
- no generated output, `.env`, reports, or runtime artifacts are staged.

- [ ] **Step 5: Update work log**

After implementation, review, fixes, and checks are complete, update `docs/roadmap/work-log.md` with two short bullets:

```md
- Реализован read-only full-screen slice `Поиск по чату`: backend search endpoint
  по текущему thread authority, frontend search page `C. Search page + context
preview`, author filters, context snippets, current snapshot merge и
  jump-back highlight для уже загруженных сообщений.
- Проверки `Поиск по чату` slice пройдены: backend targeted tests, frontend
  targeted tests, full backend/frontend suites, frontend typecheck,
  `pnpm lint`, `pnpm build`, `git diff --check` и Playwright
  `chat-read-model`.
```

Replace the final `Recommended Next Step` block with:

```md
## Recommended Next Step

- Перейти к следующему chat menu slice: `Отключить уведомления`.
```

- [ ] **Step 6: Final status and checkpoint commit**

Run:

```bash
git status --short
```

Expected: only intended search slice files and work-log changes are present.

After the user approves the completed closure, create one checkpoint commit:

```bash
git add backend/src/modules/chat-messages frontend/src/features/chat tests/e2e/chat-read-model.spec.ts docs/roadmap/work-log.md
git commit -m "feat: add chat search page"
```
