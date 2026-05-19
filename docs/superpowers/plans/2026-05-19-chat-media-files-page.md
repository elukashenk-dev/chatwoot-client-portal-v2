# Chat Media And Files Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only full-screen `Медиа и файлы` page for the selected portal chat thread.

**Chosen UI:** `C. Mixed View` — render images/videos as a compact visual
section and audio/documents/other files as a dense file list, preserving the
same filter set across both sections.

**Architecture:** Keep browser authority thread-id based. Backend first adds a portal attachment proxy and changes existing transcript attachment URLs to portal-authorized URLs, then adds a read-only media endpoint in the chat messages boundary. Frontend reuses `ChatFullScreenPanel`, adds a media page hook and component, and opens it from the existing chat menu without ever receiving direct Chatwoot attachment URLs.

**Tech Stack:** Fastify, Zod, Chatwoot Application API wrapper, React 19, React Router, Tailwind CSS 4, Vitest, Testing Library, Playwright.

---

## File Structure

- Modify `backend/src/modules/chat-messages/types.ts`: add `PortalChatMediaItem` and `ChatThreadMediaResponse`.
- Modify `backend/src/modules/chat-messages/messageMapping.ts`: build portal proxy URLs for transcript attachments instead of returning Chatwoot `data_url` / `thumb_url`.
- Modify `backend/src/modules/chat-messages/messageMapping.test.ts`: cover portal proxy URL mapping.
- Modify `backend/src/modules/chat-messages/service.ts`: add attachment proxy resolution/streaming support and `getCurrentUserChatMedia`.
- Create `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`: focused proxy authority and streaming tests.
- Modify `backend/src/modules/chat-messages/routes.ts`: add attachment proxy routes and `GET /api/chat/threads/:threadId/media`.
- Create `backend/src/modules/chat-messages/routes.attachment-proxy.test.ts`: focused proxy route coverage.
- Create `backend/src/modules/chat-messages/media.ts`: flatten mapped portal messages into stable media items and classify file categories.
- Create `backend/src/modules/chat-messages/media.test.ts`: pure helper coverage.
- Create `backend/src/modules/chat-messages/service.media.test.ts`: focused service coverage for media loading.
- Create `backend/src/modules/chat-messages/routes.media.test.ts`: focused route coverage.
- Modify `frontend/src/features/chat/types.ts`: add media response/item types.
- Modify `frontend/src/features/chat/api/chatClient.ts`: add `getChatThreadMedia`.
- Create `frontend/src/features/chat/components/ChatMediaPage.tsx`: render filters, media list, empty/loading/unavailable states inside `ChatFullScreenPanel`.
- Create `frontend/src/features/chat/components/ChatMediaPage.test.tsx`: component coverage.
- Create `frontend/src/features/chat/pages/useChatMediaPanel.ts`: load/retry/load-more/close state with stale request invalidation.
- Create `frontend/src/features/chat/pages/useChatMediaPanel.test.tsx`: hook coverage.
- Modify `frontend/src/features/chat/components/ChatHeader.tsx`: enable `Медиа и файлы` menu item through a new callback.
- Modify `frontend/src/features/chat/pages/ChatPage.tsx`: wire media panel hook and page render.
- Modify `frontend/src/features/chat/pages/ChatPage.test.tsx`: menu wiring test only if file line budget allows; otherwise add a focused test file for media-page wiring.
- Modify `tests/e2e/chat-read-model.spec.ts`: add Playwright coverage for group media page opening, rendered file, back, and shell width.
- Modify `docs/roadmap/work-log.md`: update only after implementation, review, fixes, and checks are complete.

Repo rule for implementation: do not commit after individual tasks unless the user explicitly asks. Use one checkpoint commit after the whole media/files slice passes closure checks.

---

### Task 1: Portal Attachment Proxy Foundation

**Files:**

- Modify: `backend/src/modules/chat-messages/messageMapping.ts`
- Test: `backend/src/modules/chat-messages/messageMapping.test.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Test: `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`
- Modify: `backend/src/modules/chat-messages/routes.ts`
- Test: `backend/src/modules/chat-messages/routes.attachment-proxy.test.ts`

- [ ] **Step 1: Add failing message mapping test for portal URLs**

Add a test to `backend/src/modules/chat-messages/messageMapping.test.ts` that
maps a visible message with one attachment and asserts:

```ts
expect(mappedMessage?.attachments[0]).toMatchObject({
  id: 91,
  thumbUrl: '/api/chat/threads/group%3A154/attachments/501/91/thumb',
  url: '/api/chat/threads/group%3A154/attachments/501/91',
})
```

The mapper context in this test must include `threadId: 'group:154'`. Expected:
fail because the mapper currently returns Chatwoot direct URLs.

- [ ] **Step 2: Add portal attachment URL helper**

In `backend/src/modules/chat-messages/messageMapping.ts`, add:

```ts
function buildPortalAttachmentUrl({
  attachmentId,
  messageId,
  threadId,
  variant = 'original',
}: {
  attachmentId: number
  messageId: number
  threadId: string
  variant?: 'original' | 'thumb'
}) {
  const basePath = `/api/chat/threads/${encodeURIComponent(threadId)}/attachments/${messageId}/${attachmentId}`

  return variant === 'thumb' ? `${basePath}/thumb` : basePath
}
```

Extend `MessageThreadContext` with `threadId: string`, pass it from
`createMessageMapperContext`, and map attachments like this:

```ts
attachments: message.attachments.map((attachment) => ({
  fileSize: attachment.fileSize,
  fileType: attachment.fileType,
  id: attachment.id,
  name: attachment.name,
  thumbUrl: attachment.thumbUrl
    ? buildPortalAttachmentUrl({
        attachmentId: attachment.id,
        messageId: message.id,
        threadId: context.threadId,
        variant: 'thumb',
      })
    : '',
  url: buildPortalAttachmentUrl({
    attachmentId: attachment.id,
    messageId: message.id,
    threadId: context.threadId,
  }),
})),
```

- [ ] **Step 3: Run mapping tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/messageMapping.test.ts
```

Expected: pass.

- [ ] **Step 4: Add failing proxy service tests**

Create `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`.
Cover:

- valid user/thread/message/attachment resolves a stream response source;
- revoked/inaccessible thread returns the existing not-ready/denied behavior;
- missing conversation returns 404-style `attachment_unavailable`;
- missing attachment returns 404-style `attachment_unavailable`;
- private Chatwoot message is rejected;
- `Range` header is forwarded to the server-side attachment fetch.

Use a fake `attachmentFetchFn` dependency that records URL and headers and
returns a `Response` with `body`, `Content-Type`, and `Content-Length`.

- [ ] **Step 5: Implement proxy service method**

In `createChatMessagesService`, accept an optional dependency:

```ts
attachmentFetchFn?: typeof fetch
```

Default it to `fetch`. Add `getCurrentUserChatAttachment` that:

1. Calls `chatThreadsService.getCurrentUserThreadContext({ threadId, userId })`.
2. Requires `context.result === 'ready'` and `context.chatwootConversation`.
3. Calls `chatwootClient.findConversationMessageById(conversationId, messageId)`.
4. Rejects missing/private/non-visible messages.
5. Finds the requested attachment by `attachmentId`.
6. Chooses `attachment.thumbUrl` for `variant: 'thumb'`, otherwise
   `attachment.url`.
7. Server-side fetches that URL and forwards the browser `Range` header when
   provided.
8. Returns a controlled object with upstream status, headers, and body for the
   route to stream.

Do not return the Chatwoot URL to the browser and do not redirect.

- [ ] **Step 6: Add proxy routes**

In `backend/src/modules/chat-messages/routes.ts`, add:

```text
GET /api/chat/threads/:threadId/attachments/:messageId/:attachmentId
GET /api/chat/threads/:threadId/attachments/:messageId/:attachmentId/thumb
```

Both routes must enforce tenant origin, session auth, thread ID validation,
positive integer `messageId` and `attachmentId`, and call
`getCurrentUserChatAttachment`. The handler must copy safe upstream headers and
stream the body through Fastify without exposing the upstream URL.

- [ ] **Step 7: Run proxy tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/messageMapping.test.ts src/modules/chat-messages/service.attachment-proxy.test.ts src/modules/chat-messages/routes.attachment-proxy.test.ts
```

Expected: pass.

### Task 2: Backend Media Types And Pure Mapping

**Files:**

- Modify: `backend/src/modules/chat-messages/types.ts`
- Create: `backend/src/modules/chat-messages/media.ts`
- Test: `backend/src/modules/chat-messages/media.test.ts`

- [ ] **Step 1: Write failing pure helper tests**

Create `backend/src/modules/chat-messages/media.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { buildPortalChatMediaItems, getMediaItemCategory } from './media.js'
import type { PortalChatMessage } from './types.js'

function createMessage(
  overrides: Partial<PortalChatMessage> = {},
): PortalChatMessage {
  return {
    attachments: [],
    authorName: 'Ольга Support',
    authorRole: 'agent',
    content: 'Файлы по заявке',
    contentType: 'text',
    createdAt: '2026-05-19T10:20:00.000Z',
    direction: 'incoming',
    id: 501,
    replyTo: null,
    status: 'sent',
    ...overrides,
  }
}

describe('chat media mapping', () => {
  it('flattens message attachments into stable media items', () => {
    expect(
      buildPortalChatMediaItems([
        createMessage({
          attachments: [
            {
              fileSize: 2048,
              fileType: 'image',
              id: 91,
              name: 'receipt.png',
              thumbUrl:
                '/api/chat/threads/private%3Ame/attachments/501/91/thumb',
              url: '/api/chat/threads/private%3Ame/attachments/501/91',
            },
            {
              fileSize: null,
              fileType: 'pdf',
              id: 92,
              name: 'contract.pdf',
              thumbUrl: '',
              url: '/api/chat/threads/private%3Ame/attachments/501/92',
            },
          ],
        }),
      ]),
    ).toEqual([
      {
        attachmentId: 91,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        category: 'image',
        createdAt: '2026-05-19T10:20:00.000Z',
        direction: 'incoming',
        fileSize: 2048,
        fileType: 'image',
        id: 'attachment:501:91',
        messageId: 501,
        name: 'receipt.png',
        thumbUrl: '/api/chat/threads/private%3Ame/attachments/501/91/thumb',
        url: '/api/chat/threads/private%3Ame/attachments/501/91',
      },
      {
        attachmentId: 92,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        category: 'file',
        createdAt: '2026-05-19T10:20:00.000Z',
        direction: 'incoming',
        fileSize: null,
        fileType: 'pdf',
        id: 'attachment:501:92',
        messageId: 501,
        name: 'contract.pdf',
        thumbUrl: '',
        url: '/api/chat/threads/private%3Ame/attachments/501/92',
      },
    ])
  })

  it('ignores messages without attachments', () => {
    expect(buildPortalChatMediaItems([createMessage()])).toEqual([])
  })

  it('classifies media categories from Chatwoot file types', () => {
    expect(getMediaItemCategory('image')).toBe('image')
    expect(getMediaItemCategory('image/png')).toBe('image')
    expect(getMediaItemCategory('video')).toBe('video')
    expect(getMediaItemCategory('audio')).toBe('audio')
    expect(getMediaItemCategory('pdf')).toBe('file')
    expect(getMediaItemCategory('')).toBe('file')
  })
})
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/media.test.ts
```

Expected: fail because `media.ts`, `buildPortalChatMediaItems`, and
`getMediaItemCategory` do not exist.

- [ ] **Step 3: Add backend media types**

Append to `backend/src/modules/chat-messages/types.ts`:

```ts
export type PortalChatMediaCategory = 'audio' | 'file' | 'image' | 'video'

export type PortalChatMediaItem = {
  attachmentId: number
  authorName: string
  authorRole: PortalChatMessageAuthorRole
  category: PortalChatMediaCategory
  createdAt: string
  direction: 'incoming' | 'outgoing'
  fileSize: number | null
  fileType: string
  id: `attachment:${number}:${number}`
  messageId: number
  name: string
  thumbUrl: string
  url: string
}

export type ChatThreadMediaResponse = {
  activeThread: PublicChatThreadSummary | null
  hasMoreOlder: boolean
  items: PortalChatMediaItem[]
  nextOlderCursor: number | null
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
}
```

- [ ] **Step 4: Implement pure media mapper**

Create `backend/src/modules/chat-messages/media.ts`:

```ts
import type {
  PortalChatMediaCategory,
  PortalChatMediaItem,
  PortalChatMessage,
} from './types.js'

export function getMediaItemCategory(
  fileType: string,
): PortalChatMediaCategory {
  const normalizedFileType = fileType.trim().toLowerCase()

  if (
    normalizedFileType === 'image' ||
    normalizedFileType.startsWith('image/')
  ) {
    return 'image'
  }

  if (
    normalizedFileType === 'video' ||
    normalizedFileType.startsWith('video/')
  ) {
    return 'video'
  }

  if (
    normalizedFileType === 'audio' ||
    normalizedFileType.startsWith('audio/')
  ) {
    return 'audio'
  }

  return 'file'
}

export function buildPortalChatMediaItems(
  messages: PortalChatMessage[],
): PortalChatMediaItem[] {
  return messages.flatMap((message) =>
    message.attachments.map((attachment) => ({
      attachmentId: attachment.id,
      authorName: message.authorName,
      authorRole: message.authorRole,
      category: getMediaItemCategory(attachment.fileType),
      createdAt: message.createdAt,
      direction: message.direction,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      id: `attachment:${message.id}:${attachment.id}`,
      messageId: message.id,
      name: attachment.name,
      thumbUrl: attachment.thumbUrl,
      url: attachment.url,
    })),
  )
}
```

- [ ] **Step 5: Run helper tests and verify they pass**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/media.test.ts
```

Expected: pass.

---

### Task 3: Backend Media Service

**Files:**

- Modify: `backend/src/modules/chat-messages/service.ts`
- Test: `backend/src/modules/chat-messages/service.media.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `backend/src/modules/chat-messages/service.media.test.ts` with three
focused cases:

```ts
import { describe, expect, it, vi } from 'vitest'

import {
  ChatwootClientConfigurationError,
  ChatwootInvalidHistoryCursorError,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'
import { createChatMessagesService } from './service.js'

function createReadyContext() {
  return {
    activeThread: {
      id: PRIVATE_CHAT_THREAD_ID,
      subtitle: 'Только вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    chatwootConversation: {
      id: 1001,
      createdAt: 1779145200,
      lastActivityAt: 1779148800,
    },
    currentUserEmail: 'user@example.test',
    currentUserName: 'Portal User',
    portalChatThreadId: 10,
    reason: 'none',
    result: 'ready',
    threadType: 'private',
  } as const
}

function createService({
  context = createReadyContext(),
  listConversationMessages,
}: {
  context?: ReturnType<typeof createReadyContext>
  listConversationMessages: ReturnType<typeof vi.fn>
}) {
  return createChatMessagesService({
    chatThreadsRepository: {
      findSendLedgerAuthorsByMessageIds: vi.fn(async () => new Map()),
    },
    chatThreadsService: {
      ensureCurrentUserWritableThreadContext: vi.fn(),
      getCurrentUserThreadContext: vi.fn(async () => context),
      recoverCurrentUserWritableThreadContext: vi.fn(),
    },
    chatwootClient: {
      createConversationIncomingAttachmentMessage: vi.fn(),
      createConversationIncomingMessage: vi.fn(),
      findConversationMessageById: vi.fn(),
      findConversationMessageBySourceId: vi.fn(),
      listConversationMessages,
    },
  })
}

describe('chat media service', () => {
  it('returns flattened media items without creating a conversation', async () => {
    const listConversationMessages = vi.fn(async () => ({
      hasMoreOlder: false,
      messages: [
        {
          attachments: [
            {
              fileSize: 4096,
              fileType: 'image',
              id: 71,
              name: 'receipt.png',
              thumbUrl: 'https://chatwoot.test/thumb.png',
              url: 'https://chatwoot.test/receipt.png',
            },
          ],
          content: 'Фото',
          contentAttributes: {},
          contentType: 'text',
          createdAt: 1779148800,
          id: 501,
          messageType: 1,
          private: false,
          sender: { avatarUrl: '', name: 'Ольга Support' },
          sourceId: null,
          status: 'sent',
        },
      ],
      nextOlderCursor: null,
    }))
    const service = createService({ listConversationMessages })

    await expect(
      service.getCurrentUserChatMedia({
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [
        {
          attachmentId: 71,
          authorName: 'Ольга Support',
          category: 'image',
          id: 'attachment:501:71',
          messageId: 501,
          name: 'receipt.png',
        },
      ],
      result: 'ready',
    })
    expect(listConversationMessages).toHaveBeenCalledWith(1001, {
      beforeMessageId: null,
    })
  })

  it('returns a ready empty page when the thread has no conversation yet', async () => {
    const context = {
      ...createReadyContext(),
      chatwootConversation: null,
    }
    const listConversationMessages = vi.fn()
    const service = createService({ context, listConversationMessages })

    await expect(
      service.getCurrentUserChatMedia({
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      items: [],
      nextOlderCursor: null,
      result: 'ready',
    })
    expect(listConversationMessages).not.toHaveBeenCalled()
  })

  it('maps Chatwoot failures and invalid cursors to controlled outcomes', async () => {
    const unavailableService = createService({
      listConversationMessages: vi.fn(async () => {
        throw new ChatwootClientConfigurationError('missing config')
      }),
    })

    await expect(
      unavailableService.getCurrentUserChatMedia({
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      items: [],
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })

    const invalidCursorService = createService({
      listConversationMessages: vi.fn(async () => {
        throw new ChatwootInvalidHistoryCursorError()
      }),
    })

    await expect(
      invalidCursorService.getCurrentUserChatMedia({
        beforeMessageId: 123,
        threadId: PRIVATE_CHAT_THREAD_ID,
        userId: 7,
      }),
    ).rejects.toMatchObject<ApiError>({
      code: 'invalid_history_cursor',
      statusCode: 400,
    })
  })
})
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/service.media.test.ts
```

Expected: fail because `getCurrentUserChatMedia` does not exist.

- [ ] **Step 3: Implement `getCurrentUserChatMedia`**

In `backend/src/modules/chat-messages/service.ts`:

- import `buildPortalChatMediaItems` from `./media.js`;
- export `ChatThreadMediaResponse` from `./types.js`;
- add `getCurrentUserChatMedia` to the object returned by
  `createChatMessagesService`.

Use this behavior:

```ts
async getCurrentUserChatMedia({
  beforeMessageId = null,
  threadId = PRIVATE_CHAT_THREAD_ID,
  userId,
}: {
  beforeMessageId?: number | null
  threadId?: string
  userId: number
}): Promise<ChatThreadMediaResponse> {
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (context.result !== 'ready' || !context.chatwootConversation) {
    return {
      activeThread: context.activeThread,
      hasMoreOlder: false,
      items: [],
      nextOlderCursor: null,
      reason: context.reason,
      result: context.result,
    }
  }

  try {
    const conversationId = context.chatwootConversation.id
    let cursor = beforeMessageId
    let hasMoreOlder = false
    let nextOlderCursor: number | null = null
    const mediaItems: PortalChatMediaItem[] = []

    for (let scannedPages = 0; scannedPages < 4; scannedPages += 1) {
      const page = await chatwootClient.listConversationMessages(conversationId, {
        beforeMessageId: cursor,
      })

      if (page === null) {
        return {
          activeThread: context.activeThread,
          hasMoreOlder: false,
          items: [],
          nextOlderCursor: null,
          reason: 'conversation_missing',
          result: 'not_ready',
        }
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
      const visibleMessages = page.messages
        .map((message) => mapPortalMessage(message, messageMapperContext))
        .filter((message): message is PortalChatMessage => message !== null)

      mediaItems.push(...buildPortalChatMediaItems(visibleMessages))
      hasMoreOlder = page.hasMoreOlder
      nextOlderCursor = page.nextOlderCursor

      if (mediaItems.length > 0 || !page.hasMoreOlder || !page.nextOlderCursor) {
        break
      }

      cursor = page.nextOlderCursor
    }

    return {
      activeThread: context.activeThread,
      hasMoreOlder,
      items: mediaItems,
      nextOlderCursor,
      reason: context.reason,
      result: context.result,
    }
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
      return {
        activeThread: context.activeThread,
        hasMoreOlder: false,
        items: [],
        nextOlderCursor: null,
        reason: 'chatwoot_unavailable',
        result: 'unavailable',
      }
    }

    throw error
  }
}
```

Keep imports sorted and reuse existing private helpers in `service.ts` instead
of duplicating message-author logic.

- [ ] **Step 4: Run service tests and verify they pass**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/service.media.test.ts src/modules/chat-messages/media.test.ts
```

Expected: pass.

---

### Task 4: Backend Media Route

**Files:**

- Modify: `backend/src/modules/chat-messages/routes.ts`
- Test: `backend/src/modules/chat-messages/routes.media.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `backend/src/modules/chat-messages/routes.media.test.ts` with:

- authenticated `GET /api/chat/threads/private%3Ame/media` calls
  `getCurrentUserChatMedia({ threadId: 'private:me', userId })`;
- query `beforeMessageId=501` is passed as number;
- invalid cursor returns a 400 response from the service error;
- missing auth returns the existing auth error.

Use the route-test helper style from
`backend/src/modules/chat-messages/routes.test.ts`; keep this as a separate file
to avoid growing that test file.

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/routes.media.test.ts
```

Expected: fail because the route is not registered.

- [ ] **Step 3: Add route schema and handler**

In `backend/src/modules/chat-messages/routes.ts`, add:

```ts
const chatMediaParamsSchema = z
  .object({
    threadId: publicThreadIdSchema,
  })
  .strict()

const chatMediaQuerySchema = z
  .object({
    beforeMessageId: z.coerce.number().int().positive().optional(),
  })
  .strict()
```

Register:

```ts
app.get('/api/chat/threads/:threadId/media', async (request, reply) => {
  assertAllowedTenantOrigin(request, env)
  const user = await resolveAuthenticatedPortalUser(request, authService)
  const params = chatMediaParamsSchema.parse(request.params)
  const query = chatMediaQuerySchema.parse(request.query)
  const service = createChatMessagesService(request)

  return reply.send(
    await service.getCurrentUserChatMedia({
      beforeMessageId: query.beforeMessageId ?? null,
      threadId: params.threadId,
      userId: user.id,
    }),
  )
})
```

- [ ] **Step 4: Run backend route/service/media tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/routes.media.test.ts src/modules/chat-messages/service.media.test.ts src/modules/chat-messages/media.test.ts
```

Expected: pass.

---

### Task 5: Frontend Types, API, And Media Page Component

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/components/ChatMediaPage.tsx`
- Test: `frontend/src/features/chat/components/ChatMediaPage.test.tsx`

- [ ] **Step 1: Add failing component and API tests**

Create `frontend/src/features/chat/components/ChatMediaPage.test.tsx` with
coverage for:

- title `Медиа и файлы`;
- image/file/audio rows render name, type, size, author/date;
- `Все`, `Фото`, `Видео`, `Аудио`, `Файлы` filters hide/show categories;
- empty state `В этом чате пока нет файлов`;
- unavailable state retry button;
- load-more button calls `onLoadOlder`.

Add an API test in an existing small API test file if one exists; otherwise
create `frontend/src/features/chat/api/chatClient.media.test.ts` and mock
`fetch` to assert:

```ts
await getChatThreadMedia({ beforeMessageId: 501, threadId: 'group:154' })
expect(fetch).toHaveBeenCalledWith(
  '/api/chat/threads/group%3A154/media?beforeMessageId=501',
  expect.objectContaining({ credentials: 'include', method: 'GET' }),
)
```

- [ ] **Step 2: Run frontend tests and verify they fail**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatMediaPage.test.tsx src/features/chat/api/chatClient.media.test.ts
```

Expected: fail because the media types, API function, and component do not
exist.

- [ ] **Step 3: Add frontend media types**

Append to `frontend/src/features/chat/types.ts`:

```ts
export type ChatMediaCategory = 'audio' | 'file' | 'image' | 'video'

export type ChatMediaItem = {
  attachmentId: number
  authorName: string
  authorRole: ChatMessageAuthorRole
  category: ChatMediaCategory
  createdAt: string
  direction: 'incoming' | 'outgoing'
  fileSize: number | null
  fileType: string
  id: `attachment:${number}:${number}`
  messageId: number
  name: string
  thumbUrl: string
  url: string
}

export type ChatThreadMediaResponse = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  items: ChatMediaItem[]
  nextOlderCursor: number | null
  reason: ChatThreadReason
  result: ChatThreadResult
}
```

- [ ] **Step 4: Add API client**

In `frontend/src/features/chat/api/chatClient.ts`, import
`ChatThreadMediaResponse` and add:

```ts
export async function getChatThreadMedia({
  beforeMessageId,
  threadId,
}: {
  beforeMessageId?: number | null
  threadId: string
}) {
  const searchParams = new URLSearchParams()

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  const query = searchParams.toString()

  return request<ChatThreadMediaResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/media${
      query ? `?${query}` : ''
    }`,
  )
}
```

- [ ] **Step 5: Implement `ChatMediaPage`**

Create `frontend/src/features/chat/components/ChatMediaPage.tsx`:

- render through `ChatFullScreenPanel` with title `Медиа и файлы`;
- derive loaded items from `media?.items ?? []`;
- keep filter state local with labels `Все`, `Фото`, `Видео`, `Аудио`,
  `Файлы`;
- implement `C. Mixed View`: image/video items in a compact visual grid and
  audio/document/other items in a dense list;
- use `formatAttachmentSize` from chat transcript utils;
- use icon components from `frontend/src/shared/ui/icons`;
- avoid `<audio>` native controls in this page for MVP so
  `F-CHAT-UI-003` does not leak into the new layout;
- render links only when `item.url.trim()` is non-empty.

Filter map:

```ts
const mediaFilters = [
  { key: 'all', label: 'Все' },
  { key: 'image', label: 'Фото' },
  { key: 'video', label: 'Видео' },
  { key: 'audio', label: 'Аудио' },
  { key: 'file', label: 'Файлы' },
] as const
```

- [ ] **Step 6: Run component/API tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatMediaPage.test.tsx src/features/chat/api/chatClient.media.test.ts
```

Expected: pass.

---

### Task 6: Frontend Media Hook And Chat Menu Wiring

**Files:**

- Create: `frontend/src/features/chat/pages/useChatMediaPanel.ts`
- Test: `frontend/src/features/chat/pages/useChatMediaPanel.test.tsx`
- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Test: `frontend/src/features/chat/pages/ChatPage.test.tsx` or a focused
  media wiring test file if `ChatPage.test.tsx` would exceed code-health
  allowlist.

- [ ] **Step 1: Write failing hook tests**

Create `frontend/src/features/chat/pages/useChatMediaPanel.test.tsx` with:

- `loadChatMedia` opens loading state, calls `getChatThreadMedia`, stores items;
- `loadOlderChatMedia` appends older items and uses `nextOlderCursor`;
- `closeChatMedia` hides the panel;
- stale response after close is ignored.

Mirror the request-sequence pattern already used in `useChatInfoPanel.test.tsx`.

- [ ] **Step 2: Run hook tests and verify they fail**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatMediaPanel.test.tsx
```

Expected: fail because `useChatMediaPanel.ts` does not exist.

- [ ] **Step 3: Implement `useChatMediaPanel`**

Create `frontend/src/features/chat/pages/useChatMediaPanel.ts` with:

```ts
export type ChatMediaPanelState = {
  hasMoreOlder: boolean
  info: ChatThreadMediaResponse | null
  isLoading: boolean
  isLoadingOlder: boolean
  isOpen: boolean
  nextOlderCursor: number | null
}
```

Expose:

- `closeChatMedia`;
- `loadChatMedia`;
- `loadOlderChatMedia`;
- `retryChatMedia`;
- `state`.

Use the same stale request invalidation approach as `useChatInfoPanel`: a
`requestSequenceRef`, `isCurrentRequest(requestId)`, and increment on close.

- [ ] **Step 4: Run hook tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatMediaPanel.test.tsx
```

Expected: pass.

- [ ] **Step 5: Wire chat menu and page render**

In `ChatHeader.tsx`:

- add prop `onOpenThreadMedia: () => void`;
- change `Медиа и файлы` menu item to call `closeMenus()` and
  `onOpenThreadMedia()`;
- keep it disabled when `selectedThreadId` is absent.

In `ChatPage.tsx`:

- import `ChatMediaPage` and `useChatMediaPanel`;
- create the hook next to `chatInfoPanel`;
- pass `onOpenThreadMedia={() => void chatMediaPanel.loadChatMedia()}` to
  `ChatHeader`;
- render `ChatMediaPage` after `ChatInfoPage` with:
  `info`, `isLoading`, `isLoadingOlder`, `onBack`, `onLoadOlder`, `onRetry`.

- [ ] **Step 6: Add/adjust wiring tests**

Add a test that:

- renders a ready chat;
- opens the chat menu;
- clicks `Медиа и файлы`;
- sees heading `Медиа и файлы`;
- clicks `Вернуться к чату`;
- sees the transcript again and no media heading.

If `frontend/src/features/chat/pages/ChatPage.test.tsx` exceeds its code-health
allowlist, place the wiring test in
`frontend/src/features/chat/pages/ChatPage.media.test.tsx` with the same route
render helper pattern.

- [ ] **Step 7: Run frontend media wiring tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/pages/useChatMediaPanel.test.tsx src/features/chat/components/ChatMediaPage.test.tsx src/features/chat/pages/ChatPage.test.tsx
```

If a focused `ChatPage.media.test.tsx` was created, include it in the command.

Expected: pass and code-health line limits remain acceptable.

---

### Task 7: Playwright E2E And Runtime Validation

**Files:**

- Modify: `tests/e2e/chat-read-model.spec.ts`

- [ ] **Step 1: Add e2e coverage**

Add a Playwright test that:

- routes group threads and group messages with an attachment;
- opens group chat;
- opens `Медиа и файлы` from the chat menu;
- verifies the file name, sender, and page title;
- checks the full-screen panel width is `Math.min(viewport.width, 500)`;
- verifies media item links use `/api/chat/threads/.../attachments/...`
  portal proxy URLs, not Chatwoot URLs;
- clicks back and verifies the group transcript is visible again;
- asserts the browser requested only portal `/api/chat/threads/.../media`.

Also extend the existing attachment-send/transcript e2e coverage to assert that
rendered transcript attachment links use portal proxy URLs.

Use the same `infoPage.boundingBox()` pattern already present in the chat info
e2e test.

- [ ] **Step 2: Run targeted e2e**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 \
E2E_TENANT_SLUG=buhfirma \
pnpm exec playwright test tests/e2e/chat-read-model.spec.ts -g "media"
```

Expected: pass.

- [ ] **Step 3: Run runtime measurement if local services are available**

Use a short Playwright script against
`http://buhfirma.127.0.0.1.nip.io:5173` to login with an existing seeded portal
user, open `Медиа и файлы` for private and group chats, and verify:

- mobile `390px` viewport panel width is `390`;
- desktop `1280px` viewport panel width is `500` and x is `390`;
- back returns to the transcript.

If runtime services are unavailable, record the exact blocker in the final
closure note and `docs/roadmap/work-log.md`.

---

### Task 8: Closure Checks, Review, Work Log, And Commit

**Files:**

- Modify: `docs/roadmap/work-log.md`

- [ ] **Step 1: Run targeted backend checks**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/messageMapping.test.ts src/modules/chat-messages/service.attachment-proxy.test.ts src/modules/chat-messages/routes.attachment-proxy.test.ts src/modules/chat-messages/media.test.ts src/modules/chat-messages/service.media.test.ts src/modules/chat-messages/routes.media.test.ts
```

Expected: pass.

- [ ] **Step 2: Run targeted frontend checks**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatMediaPage.test.tsx src/features/chat/pages/useChatMediaPanel.test.tsx src/features/chat/pages/ChatPage.test.tsx
```

Include `src/features/chat/api/chatClient.media.test.ts` and
`src/features/chat/pages/ChatPage.media.test.tsx` if those files were created.

Expected: pass.

- [ ] **Step 3: Run required project checks**

Run:

```bash
pnpm --dir frontend typecheck
pnpm build
pnpm lint
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 E2E_TENANT_SLUG=buhfirma pnpm test:e2e
git diff --check
```

Expected:

- typecheck exits 0;
- build exits 0;
- lint/code-health exits 0;
- Playwright e2e exits 0;
- `git diff --check` exits 0 with no output.

- [ ] **Step 4: Self-review affected areas**

Review:

- `backend/src/modules/chat-messages/service.ts`: no writable context call in
  media endpoint, no conversation creation, controlled errors preserved;
- `backend/src/modules/chat-messages/service.ts`: attachment proxy validates
  thread/message/attachment access on every request and never returns upstream
  Chatwoot URLs to the browser;
- `backend/src/modules/chat-messages/routes.ts`: tenant origin/auth enforced on
  media and proxy routes;
- `backend/src/modules/chat-messages/messageMapping.ts`: transcript
  attachments use portal proxy URLs;
- `frontend/src/features/chat/pages/useChatMediaPanel.ts`: stale responses
  ignored after close;
- `frontend/src/features/chat/components/ChatMediaPage.tsx`: no horizontal
  overflow and no transcript audio min-width reuse;
- `tests/e2e/chat-read-model.spec.ts`: e2e checks portal endpoint only.

- [ ] **Step 5: Update work log**

Add a short completed-work entry to `docs/roadmap/work-log.md` after all
implementation, review, fixes, and checks are complete. Replace the
`Recommended Next Step` block with the next menu slice recommendation.

- [ ] **Step 6: Create checkpoint commit**

After the user approves commit timing or requests commit, run:

```bash
git status --short
git add backend/src/modules/chat-messages/types.ts \
  backend/src/modules/chat-messages/messageMapping.ts \
  backend/src/modules/chat-messages/messageMapping.test.ts \
  backend/src/modules/chat-messages/service.attachment-proxy.test.ts \
  backend/src/modules/chat-messages/routes.attachment-proxy.test.ts \
  backend/src/modules/chat-messages/media.ts \
  backend/src/modules/chat-messages/media.test.ts \
  backend/src/modules/chat-messages/service.ts \
  backend/src/modules/chat-messages/service.media.test.ts \
  backend/src/modules/chat-messages/routes.ts \
  backend/src/modules/chat-messages/routes.media.test.ts \
  frontend/src/features/chat/types.ts \
  frontend/src/features/chat/api/chatClient.ts \
  frontend/src/features/chat/components/ChatMediaPage.tsx \
  frontend/src/features/chat/components/ChatMediaPage.test.tsx \
  frontend/src/features/chat/pages/useChatMediaPanel.ts \
  frontend/src/features/chat/pages/useChatMediaPanel.test.tsx \
  frontend/src/features/chat/components/ChatHeader.tsx \
  frontend/src/features/chat/pages/ChatPage.tsx \
  frontend/src/features/chat/pages/ChatPage.test.tsx \
  tests/e2e/chat-read-model.spec.ts \
  docs/roadmap/work-log.md
git commit -m "feat: add chat media files page"
```

Adjust the `git add` list only to match files that were actually created or
modified in the implementation.

---

## Execution Notes

- Start implementation from `main` or a fresh feature branch
  `feature/phase-media-files-page`.
- Keep Chatwoot as an external service; do not modify Chatwoot core.
- Browser runtime must never receive direct Chatwoot authority.
- This plan does not implement search, notifications, support center, delete,
  upload, or admin-managed content.
