# Chat Notification Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить безопасный контекст push-уведомлений и локальную красную точку непрочитанного чата в меню переключения чатов.

**Architecture:** Backend продолжает быть единственной authority-зоной: он формирует tenant/thread-scoped push payload без текста сообщения. Service worker показывает системный push с безопасным названием чата и пересылает push payload открытым portal-клиентам. Frontend хранит только локальный `Set<threadId>` для unread-точек и очищает точку при открытии чата.

**Tech Stack:** Fastify, TypeScript, Vitest, React 19, Vite, Service Worker, Tailwind utility classes.

---

## Baseline

- Branch: `feature/chat-notifications`.
- Approved spec: `docs/superpowers/specs/2026-05-27-chat-notification-context-design.md`.
- Existing related finding: `docs/findings/F-TEST-001-backend-suite-pglite-migration-cost.md`.
- Because of `F-TEST-001`, full backend suite is not a routine local gate for this slice. Use targeted backend tests plus targeted frontend/SW tests.
- Project rule: do not commit each task. Do one checkpoint commit after implementation, review, fixes, targeted checks, and required tests are complete.

Run before implementation:

```bash
git status --short --branch
```

Expected:

```text
## feature/chat-notifications
```

with no unstaged unrelated changes.

## File Map

Backend:

- `backend/src/modules/chat-notifications/recipientResolver.ts`
  - Extend push recipients with safe `threadTitle` and `threadType`.
  - Derive group title from the same safe Chatwoot contact source used by chat thread list, but do not use the `Группа <id>` fallback in push payload.
- `backend/src/modules/chat-notifications/recipientResolver.test.ts`
  - Cover private/group thread metadata and fail-closed group metadata.
- `backend/src/modules/chat-notifications/pushDeliveryService.ts`
  - Include `threadTitle` and `threadType` in push payload.
  - Keep message text, author, attachments, Chatwoot URLs, and raw internal data out of payload.
- `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`
  - Verify safe payload shape.

Service worker/runtime:

- `frontend/public/sw.js`
  - Parse `threadTitle` and `threadType`.
  - Show safe title/body.
  - Forward push payload to open same-origin ready clients, but suppress system notification only when a visible client for the same thread acknowledges it.
- `frontend/src/pwa/serviceWorkerAsset.test.ts`
  - Cover safe copy and other-thread forwarding.
- `frontend/src/pwa/serviceWorkerRuntime.ts`
  - Add `threadTitle` and `threadType` to parsed page payload.
- `frontend/src/pwa/serviceWorkerRuntime.test.ts`
  - Cover runtime parsing of new fields.

Frontend chat UI:

- `frontend/src/features/chat/pages/useChatPageNotifications.ts`
  - Add `onOtherThreadPush(threadId)` callback.
  - Mark other-thread push as not handled so OS push still appears.
- `frontend/src/features/chat/pages/useChatPageNotifications.test.tsx`
  - Cover same-thread refresh and other-thread local mark callback.
- `frontend/src/features/chat/pages/ChatPage.tsx`
  - Own local `unreadThreadIds` state.
  - Mark known other threads from push payload.
  - Clear selected thread id from unread set when opened.
  - Pass unread set to `ChatHeader`.
- `frontend/src/features/chat/components/ChatHeader.tsx`
  - Render approved red dot after title, slightly above baseline.
  - Add screen-reader suffix for unread menu items.
- `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`
  - New integration-style frontend test for dot appearance and clear-on-open.

Docs:

- `docs/roadmap/work-log.md`
  - Update only after closure if the implementation changes stable notification baseline.

## Task 1: Backend Recipient Metadata

**Files:**

- Modify: `backend/src/modules/chat-notifications/recipientResolver.ts`
- Modify: `backend/src/modules/chat-notifications/recipientResolver.test.ts`

- [ ] **Step 1: Write failing tests for private and group metadata**

Update expected private recipient objects in `recipientResolver.test.ts`:

```ts
await expect(
  resolver.resolveRecipients({
    chatwootMessageId: 9001,
    threadMapping: {
      chatwootConversationId: 11,
      portalChatThreadId: 22,
      threadId: 'private:me',
      threadType: 'private',
      userId: 7,
    },
  }),
).resolves.toEqual([
  {
    portalChatThreadId: 22,
    portalUserId: 7,
    threadId: 'private:me',
    threadTitle: 'Личный чат',
    threadType: 'private',
  },
])
```

Add a group contact helper:

```ts
import type { ChatwootContact } from '../../integrations/chatwoot/client.js'

function groupContact(id: number, name: string | null = `Group ${id}`) {
  return {
    customAttributes: {
      portal_contact_type: 'group',
      portal_enabled: true,
    },
    email: null,
    id,
    name,
  } satisfies ChatwootContact
}
```

Update `createResolver` so `contacts` can hold either person or group contacts:

```ts
contacts = new Map<number, ChatwootContact | null>(),
```

For group-recipient tests, include the target group contact in the `contacts`
map:

```ts
const contacts = new Map([
  [155, groupContact(155, 'ООО Уточки')],
  [101, personContact(101, [155])],
  [102, personContact(102, [999])],
])
```

Expected group recipient:

```ts
{
  portalChatThreadId: 22,
  portalUserId: 1,
  threadId: 'group:155',
  threadTitle: 'ООО Уточки',
  threadType: 'group',
}
```

Add one more group test where the target group contact has `name: null`; the
recipient should still be resolved, but `threadTitle` must be `null` so push UI
falls back to generic copy instead of exposing `Группа 155`:

```ts
const contacts = new Map<number, ChatwootContact | null>([
  [155, groupContact(155, null)],
  [101, personContact(101, [155])],
])

await expect(
  resolver.resolveRecipients({
    chatwootMessageId: 9001,
    threadMapping: {
      chatwootConversationId: 11,
      portalChatThreadId: 22,
      threadId: 'group:155',
      threadType: 'group',
      userId: null,
    },
  }),
).resolves.toEqual([
  {
    portalChatThreadId: 22,
    portalUserId: 1,
    threadId: 'group:155',
    threadTitle: null,
    threadType: 'group',
  },
])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/recipientResolver.test.ts --run
```

Expected: FAIL because `PushRecipient` does not include `threadTitle` and `threadType`.

- [ ] **Step 3: Implement recipient metadata**

In `recipientResolver.ts`, import the same authority helpers used by public
thread list:

```ts
import {
  assertPortalGroupContactEnabled,
  assertPortalPersonContactEnabled,
} from '../chat-threads/contactAttributes.js'
import { buildPrivateThread } from '../chat-threads/types.js'
```

Add a push-specific safe title helper. This intentionally does not call
`buildGroupThread(groupContact)`, because that helper falls back to
`Группа ${contact.id}` and push notifications must not expose raw Chatwoot
contact IDs:

```ts
function buildGroupPushThreadTitle(contact: ChatwootContact) {
  const title = contact.name?.trim()

  return title ? title.slice(0, 120) : null
}
```

Extend the public type:

```ts
export type PushRecipient = {
  portalChatThreadId: number
  portalUserId: number
  threadId: string
  threadTitle: string | null
  threadType: 'group' | 'private' | null
}
```

Private branch returns metadata from `buildPrivateThread()`:

```ts
const privateThread = buildPrivateThread()

return [
  {
    portalChatThreadId: threadMapping.portalChatThreadId,
    portalUserId: threadMapping.userId,
    threadId: threadMapping.threadId,
    threadTitle: privateThread.title,
    threadType: privateThread.type,
  },
]
```

Group branch resolves the group contact before member fanout:

```ts
const groupContact = await chatwootClient.findContactById(groupContactId)

if (!groupContact) {
  return []
}

try {
  assertPortalGroupContactEnabled(groupContact)
} catch {
  return []
}

const groupThreadTitle = buildGroupPushThreadTitle(groupContact)
```

Each accepted group recipient includes:

```ts
return {
  portalChatThreadId: threadMapping.portalChatThreadId,
  portalUserId: link.userId,
  threadId: threadMapping.threadId,
  threadTitle: groupThreadTitle,
  threadType: 'group',
}
```

- [ ] **Step 4: Run targeted backend test**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/recipientResolver.test.ts --run
```

Expected: PASS.

## Task 2: Backend Push Payload

**Files:**

- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.ts`
- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`

- [ ] **Step 1: Write failing payload tests**

Update `sends a generic payload to active subscriptions` so the expected JSON includes:

```ts
threadTitle: 'Личный чат',
threadType: 'private',
```

Update `createRecipientResolver()` so it returns the new metadata:

```ts
function createRecipientResolver() {
  return {
    resolveRecipients: vi.fn(async () => [
      {
        portalChatThreadId: 22,
        portalUserId: 7,
        threadId: 'private:me',
        threadTitle: 'Личный чат',
        threadType: 'private' as const,
      },
    ]),
  }
}
```

Add a dedicated test that parses the payload and asserts unsafe fields are absent:

```ts
const [, payload] = transport.sendNotification.mock.calls[0] ?? []
const parsedPayload = JSON.parse(String(payload))

expect(parsedPayload).toMatchObject({
  chatwootMessageId: 9001,
  notificationTag: 'portal-chat-message-default-9001',
  tenantSlug: 'default',
  threadId: 'private:me',
  threadTitle: 'Личный чат',
  threadType: 'private',
  type: 'chat_message',
  url: '/',
})
expect(parsedPayload).not.toHaveProperty('content')
expect(parsedPayload).not.toHaveProperty('text')
expect(parsedPayload).not.toHaveProperty('authorName')
expect(parsedPayload).not.toHaveProperty('attachments')
expect(parsedPayload).not.toHaveProperty('chatwootBaseUrl')
```

Add a fallback metadata test by returning a recipient with `threadTitle: null`
and `threadType: null`; the payload should keep those safe nulls and must still
avoid unsafe fields:

```ts
const recipientResolver = {
  resolveRecipients: vi.fn(async () => [
    {
      portalChatThreadId: 22,
      portalUserId: 7,
      threadId: 'group:155',
      threadTitle: null,
      threadType: null,
    },
  ]),
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/pushDeliveryService.test.ts --run
```

Expected: FAIL because payload does not include `threadTitle` and `threadType`.

- [ ] **Step 3: Implement payload metadata**

Change `buildPayload` input:

```ts
function buildPayload({
  chatwootMessageId,
  tenantSlug,
  threadId,
  threadTitle,
  threadType,
}: {
  chatwootMessageId: number
  tenantSlug: string
  threadId: string
  threadTitle: string | null
  threadType: 'group' | 'private' | null
}) {
  return JSON.stringify({
    chatwootMessageId,
    notificationTag: `portal-chat-message-${tenantSlug}-${chatwootMessageId}`,
    tenantSlug,
    threadId,
    threadTitle,
    threadType,
    type: 'chat_message',
    url: '/',
  })
}
```

Move payload building inside the recipient loop so it uses recipient metadata:

```ts
const payload = buildPayload({
  chatwootMessageId: input.chatwootMessageId,
  tenantSlug: input.tenantSlug,
  threadId: recipient.threadId,
  threadTitle: recipient.threadTitle,
  threadType: recipient.threadType,
})
```

The payload must still be sent only after effective settings and active subscription checks pass.

- [ ] **Step 4: Run targeted backend tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/recipientResolver.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts --run
```

Expected: PASS.

## Task 3: Service Worker Safe Copy And Forwarding

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/src/pwa/serviceWorkerAsset.test.ts`

- [ ] **Step 1: Write failing service worker tests**

Update same-thread postMessage expectations to include:

```js
threadTitle: 'ООО Уточки',
threadType: 'group',
```

Add or update tests:

```ts
it('uses safe chat title and type in the system notification copy', async () => {
  const { listeners, showNotification } = loadServiceWorker()
  const pushListener = listeners.get('push')?.[0]

  await dispatchPush(pushListener!, {
    chatwootMessageId: 9007,
    notificationTag: 'portal-chat-message-default-9007',
    tenantSlug: 'default',
    threadId: 'group:155',
    threadTitle: 'ООО Уточки',
    threadType: 'group',
    type: 'chat_message',
    url: '/',
  })

  expect(showNotification).toHaveBeenCalledWith(
    'ООО Уточки',
    expect.objectContaining({
      body: 'Новое сообщение в групповом чате',
      tag: 'portal-chat-message-default-9007',
    }),
  )
})
```

Add a generic fallback copy test for null/empty metadata:

```ts
it('falls back to generic copy when chat metadata is unavailable', async () => {
  const { listeners, showNotification } = loadServiceWorker()
  const pushListener = listeners.get('push')?.[0]

  await dispatchPush(pushListener!, {
    chatwootMessageId: 9008,
    notificationTag: 'portal-chat-message-default-9008',
    tenantSlug: 'default',
    threadId: 'group:155',
    threadTitle: null,
    threadType: null,
    type: 'chat_message',
    url: '/',
  })

  expect(showNotification).toHaveBeenCalledWith(
    'Новое сообщение',
    expect.objectContaining({
      body: 'Откройте портал, чтобы посмотреть чат.',
      tag: 'portal-chat-message-default-9008',
    }),
  )
})
```

Update the existing "another chat is active" tests:

- `postMessage` must be called for the open ready client;
- `showNotification` must still be called;
- if the client answers `handled: true` while active thread differs, notification is still shown.

Expected assertion shape:

```ts
expect(postMessage).toHaveBeenCalledWith(
  expect.objectContaining({
    payload: expect.objectContaining({
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
    }),
    type: 'PORTAL_PUSH_MESSAGE',
  }),
  expect.arrayContaining([expect.any(MessagePort)]),
)
expect(showNotification).toHaveBeenCalled()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerAsset.test.ts --run
```

Expected: FAIL because current service worker neither parses the new fields nor forwards other-thread pushes.

- [ ] **Step 3: Implement payload parsing and safe notification copy**

In `readPushPayload`, add sanitized fields:

```js
threadTitle:
  typeof payload.threadTitle === 'string' &&
  payload.threadTitle.trim().length > 0
    ? payload.threadTitle.trim().slice(0, 120)
    : null,
threadType:
  payload.threadType === 'private' || payload.threadType === 'group'
    ? payload.threadType
    : null,
```

Add fallback values in every catch/default return:

```js
threadTitle: null,
threadType: null,
```

Add a copy helper:

```js
function buildNotificationCopy(payload) {
  if (payload.threadTitle && payload.threadType === 'group') {
    return {
      body: 'Новое сообщение в групповом чате',
      title: payload.threadTitle,
    }
  }

  if (payload.threadTitle && payload.threadType === 'private') {
    return {
      body: 'Новое сообщение в личном чате',
      title: payload.threadTitle,
    }
  }

  return {
    body: 'Откройте портал, чтобы посмотреть чат.',
    title: 'Новое сообщение',
  }
}
```

Use it in `handlePushEvent`:

```js
const notificationCopy = buildNotificationCopy(payload)
const notificationOptions = {
  body: notificationCopy.body,
  data: {
    url: normalizeNotificationUrl(payload.url),
  },
  icon: '/pwa-icons/icon-192.png',
}

await self.registration.showNotification(
  notificationCopy.title,
  notificationOptions,
)
```

- [ ] **Step 4: Implement forwarding to open ready clients**

Replace the current visible same-thread-only filter with ready same-origin clients:

```js
function isReadyPortalClient(client) {
  return PUSH_READY_CLIENT_IDS.has(client.id) && isSameOriginUrl(client.url)
}

function canClientSuppressPush(client, threadId) {
  return (
    client.visibilityState === 'visible' &&
    isPushReadyForThread(client, threadId)
  )
}
```

Then `notifyPortalClients` should:

```js
const portalClients = clientsList.filter(isReadyPortalClient)

if (portalClients.length === 0) {
  return false
}

const results = await Promise.all(
  portalClients.map(async (client) => ({
    handled: await postPushMessageToClient(client, payload),
    suppressible: canClientSuppressPush(client, payload.threadId),
  })),
)

return results.some((result) => result.handled && result.suppressible)
```

This preserves the existing rule: only a visible client on the target thread may suppress the system notification.

- [ ] **Step 5: Run targeted frontend SW asset test**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerAsset.test.ts --run
```

Expected: PASS.

## Task 4: Runtime Payload Parsing

**Files:**

- Modify: `frontend/src/pwa/serviceWorkerRuntime.ts`
- Modify: `frontend/src/pwa/serviceWorkerRuntime.test.ts`

- [ ] **Step 1: Write failing runtime test**

Update the existing `registers the page as push-ready while a message listener is active` payload fixture:

```ts
payload: {
  chatwootMessageId: 9004,
  tenantSlug: 'buhfirma',
  threadId: 'group:155',
  threadTitle: 'ООО Уточки',
  threadType: 'group',
  type: 'chat_message',
  url: '/',
},
```

Expected handler call:

```ts
expect(handler).toHaveBeenCalledWith({
  chatwootMessageId: 9004,
  tenantSlug: 'buhfirma',
  threadId: 'group:155',
  threadTitle: 'ООО Уточки',
  threadType: 'group',
  type: 'chat_message',
  url: '/',
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerRuntime.test.ts --run
```

Expected: FAIL because runtime strips `threadTitle` and `threadType`.

- [ ] **Step 3: Implement runtime types and parser**

Extend `PortalPushMessagePayload`:

```ts
export type PortalPushMessagePayload = {
  chatwootMessageId: number | null
  tenantSlug: string | null
  threadId: string | null
  threadTitle: string | null
  threadType: 'group' | 'private' | null
  type: 'chat_message'
  url: string
}
```

Extend `handleMessage` parser:

```ts
threadTitle:
  typeof event.data.payload?.threadTitle === 'string' &&
  event.data.payload.threadTitle.trim().length > 0
    ? event.data.payload.threadTitle.trim()
    : null,
threadType:
  event.data.payload?.threadType === 'private' ||
  event.data.payload?.threadType === 'group'
    ? event.data.payload.threadType
    : null,
```

- [ ] **Step 4: Run targeted runtime test**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerRuntime.test.ts --run
```

Expected: PASS.

## Task 5: Frontend Local Unread State

**Files:**

- Modify: `frontend/src/features/chat/pages/useChatPageNotifications.ts`
- Modify: `frontend/src/features/chat/pages/useChatPageNotifications.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`

- [ ] **Step 1: Write failing hook test**

Update the hook input type in the test by passing a callback:

```ts
const onOtherThreadPush = vi.fn()

useChatPageNotifications({
  chatNotificationsPanel,
  messages: [],
  onOtherThreadPush,
  refreshChatSnapshot,
  selectedThreadId: 'group:155',
})
```

Assert behavior:

```ts
expect(
  handler?.({
    chatwootMessageId: 9001,
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    threadTitle: 'Личный чат',
    threadType: 'private',
    type: 'chat_message',
    url: '/',
  }),
).toBe(false)
expect(onOtherThreadPush).toHaveBeenCalledWith('private:me')
expect(refreshChatSnapshot).not.toHaveBeenCalled()

expect(
  handler?.({
    chatwootMessageId: 9002,
    tenantSlug: 'buhfirma',
    threadId: 'group:155',
    threadTitle: 'ООО Уточки',
    threadType: 'group',
    type: 'chat_message',
    url: '/',
  }),
).toBe(true)
expect(refreshChatSnapshot).toHaveBeenCalledTimes(1)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/useChatPageNotifications.test.tsx --run
```

Expected: FAIL because hook has no `onOtherThreadPush`.

- [ ] **Step 3: Implement hook callback**

Update hook options:

```ts
type UseChatPageNotificationsOptions = {
  chatNotificationsPanel: ReturnType<typeof useChatNotificationsPanel>
  messages: ChatMessage[]
  onOtherThreadPush: (threadId: string) => void
  refreshChatSnapshot: () => Promise<void>
  selectedThreadId: string | null
}
```

Update handler:

```ts
if (!payload.threadId) {
  return false
}

if (payload.threadId !== selectedThreadId) {
  onOtherThreadPush(payload.threadId)
  return false
}

void refreshChatSnapshot()

return true
```

Add `onOtherThreadPush` to the effect dependency array.

- [ ] **Step 4: Add ChatPage local state**

In `ChatPage.tsx`, add:

```ts
const [unreadThreadIds, setUnreadThreadIds] = useState<ReadonlySet<string>>(
  () => new Set(),
)
```

Add callback:

```ts
const markUnreadThread = useCallback(
  (threadId: string) => {
    setUnreadThreadIds((currentValue) => {
      if (
        threadId === pageState.selectedThreadId ||
        !pageState.threads.some((thread) => thread.id === threadId) ||
        currentValue.has(threadId)
      ) {
        return currentValue
      }

      const nextValue = new Set(currentValue)
      nextValue.add(threadId)

      return nextValue
    })
  },
  [pageState.selectedThreadId, pageState.threads],
)
```

Clear selected thread on open:

```ts
useEffect(() => {
  const selectedThreadId = pageState.selectedThreadId

  if (
    !selectedThreadId ||
    pageState.status !== 'ready' ||
    pageState.snapshot.activeThread?.id !== selectedThreadId
  ) {
    return
  }

  setUnreadThreadIds((currentValue) => {
    if (!currentValue.has(selectedThreadId)) {
      return currentValue
    }

    const nextValue = new Set(currentValue)
    nextValue.delete(selectedThreadId)

    return nextValue
  })
}, [pageState])
```

Pass callback into `useChatPageNotifications`:

```ts
const selectedThreadNotificationSettings = useChatPageNotifications({
  chatNotificationsPanel,
  messages: visibleMessages,
  onOtherThreadPush: markUnreadThread,
  refreshChatSnapshot,
  selectedThreadId: pageState.selectedThreadId,
})
```

Pass state into `ChatHeader`:

```tsx
<ChatHeader
  activeThread={headerThread}
  onOpenThreadSearch={() => {
    clearSearchResultOpenError()
    chatSearchPanel.openChatSearch()
  }}
  onOpenThreadMedia={() => {
    void chatMediaPanel.loadChatMedia()
  }}
  onOpenThreadInfo={() => {
    void chatInfoPanel.loadChatInfo()
  }}
  onOpenThreadNotifications={() => {
    void chatNotificationsPanel.loadChatNotifications()
  }}
  onSelectThread={(threadId) => {
    clearHighlightedMessage()
    clearHistoryFragment()
    void handleSelectThread(threadId)
  }}
  selectedThreadId={pageState.selectedThreadId}
  supportAvailability={supportAvailability.state.availability}
  threadNotificationSettings={selectedThreadNotificationSettings}
  threads={pageState.threads}
  unreadThreadIds={unreadThreadIds}
/>
```

- [ ] **Step 5: Run targeted hook test**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/useChatPageNotifications.test.tsx --run
```

Expected: PASS.

## Task 6: Header Unread Dot UI

**Files:**

- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Create: `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`

- [ ] **Step 1: Write failing ChatPage unread indicator test**

Create `ChatPage.unread-indicators.test.tsx`.

Mock service worker runtime at top level:

```ts
import type { PortalPushMessagePayload } from '../../../pwa/serviceWorkerRuntime'

const serviceWorkerRuntimeMock = vi.hoisted(() => ({
  registerPortalPushMessageListener: vi.fn(() => vi.fn()),
}))

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  registerPortalPushMessageListener:
    serviceWorkerRuntimeMock.registerPortalPushMessageListener,
}))
```

Use the same render/fetch helpers pattern as `ChatPage.thread-selection.test.tsx`.

Add local helpers for endpoints that load after the chat becomes ready:

```ts
function createSupportAvailabilityResponse() {
  return createJsonResponse({
    currentStatus: 'online',
    outOfOfficeMessage: null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: false,
      isWithinWorkingHours: null,
      rows: [],
      timezone: 'UTC',
    },
  })
}

function createNotificationSettings(threadId: string) {
  return {
    effective: {
      newMessagesEnabled: true,
      pushEnabled: true,
      soundEnabled: true,
    },
    global: {
      newMessagesEnabled: true,
      pushEnabled: true,
      soundEnabled: true,
    },
    overrides: {
      newMessagesEnabled: null,
      pushEnabled: null,
      soundEnabled: null,
    },
    threadId,
  }
}
```

Test flow:

```ts
it('shows and clears a local unread dot for another chat push', async () => {
  const user = userEvent.setup()

  renderChatRoute()

  await screen.findByText(
    'Здравствуйте, вижу ваше обращение.',
    {},
    CHAT_PAGE_LOAD_TIMEOUT,
  )

  const handler =
    serviceWorkerRuntimeMock.registerPortalPushMessageListener.mock
      .calls[0]?.[0]
  expect(handler).toBeDefined()

  const otherThreadPush = {
    chatwootMessageId: 9001,
    tenantSlug: 'buhfirma',
    threadId: 'group:154',
    threadTitle: 'ООО "Ромашка"',
    threadType: 'group',
    type: 'chat_message',
    url: '/',
  } satisfies PortalPushMessagePayload

  expect(handler?.(otherThreadPush)).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))

  expect(
    screen.getByRole('menuitem', {
      name: /ООО "Ромашка".*есть новое сообщение/i,
    }),
  ).toBeInTheDocument()
  expect(screen.getByTestId('thread-unread-dot-group:154')).toBeInTheDocument()

  await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

  expect(
    await screen.findByRole(
      'heading',
      { name: 'ООО "Ромашка"' },
      CHAT_PAGE_LOAD_TIMEOUT,
    ),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
  expect(
    screen.queryByTestId('thread-unread-dot-group:154'),
  ).not.toBeInTheDocument()
})
```

Expected fetch routes that should be handled in the test mock:

- `/api/auth/me`
- `/api/chat/threads`
- `/api/chat/messages?threadId=private%3Ame`
- `/api/chat/support-availability`
- `/api/chat/threads/private%3Ame/notification-settings`
- `/api/chat/messages?threadId=group%3A154`
- `/api/chat/threads/group%3A154/notification-settings`

Add a second test for the failure path:

```ts
it('keeps the unread dot when the marked chat fails to open', async () => {
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

    if (url === '/api/chat/support-availability') {
      return createSupportAvailabilityResponse()
    }

    if (url === '/api/chat/threads/private%3Ame/notification-settings') {
      return createJsonResponse(createNotificationSettings('private:me'))
    }

    if (url === '/api/chat/messages?threadId=group%3A154') {
      return createJsonResponse(
        {
          error: {
            code: 'chatwoot_unavailable',
            message: 'Chatwoot unavailable.',
          },
        },
        503,
      )
    }

    if (url === '/api/chat/threads/group%3A154/notification-settings') {
      return createJsonResponse(createNotificationSettings('group:154'))
    }

    throw new Error(`Unexpected request: ${url}`)
  })

  const user = userEvent.setup()

  renderChatRoute()

  await screen.findByText(
    'Здравствуйте, вижу ваше обращение.',
    {},
    CHAT_PAGE_LOAD_TIMEOUT,
  )

  const handler =
    serviceWorkerRuntimeMock.registerPortalPushMessageListener.mock
      .calls[0]?.[0]

  expect(
    handler?.({
      chatwootMessageId: 9001,
      tenantSlug: 'buhfirma',
      threadId: 'group:154',
      threadTitle: 'ООО "Ромашка"',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    }),
  ).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
  expect(screen.getByTestId('thread-unread-dot-group:154')).toBeInTheDocument()

  await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

  expect(
    await screen.findByText(
      'Чат временно недоступен',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    ),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
  expect(screen.getByTestId('thread-unread-dot-group:154')).toBeInTheDocument()
})
```

This protects the intended clear-on-open behavior: the dot clears after the
target transcript is actually ready, not merely after a click or loading state.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/ChatPage.unread-indicators.test.tsx --run
```

Expected: FAIL because `ChatHeader` has no unread dot prop/UI.

- [ ] **Step 3: Implement `ChatHeader` prop and UI**

Extend props:

```ts
type ChatHeaderProps = {
  activeThread: ChatThreadSummary | null
  onOpenThreadInfo: () => void
  onOpenThreadMedia: () => void
  onOpenThreadNotifications: () => void
  onOpenThreadSearch: () => void
  onSelectThread: (threadId: string) => void
  selectedThreadId: string | null
  supportAvailability: ChatSupportAvailabilityResponse | null
  threadNotificationSettings: ChatNotificationSettings | null
  threads: ChatThreadSummary[]
  unreadThreadIds?: ReadonlySet<string>
}
```

Default it:

```ts
unreadThreadIds = new Set(),
```

Inside `availableThreads.map`:

```ts
const hasUnread = !isSelected && unreadThreadIds.has(thread.id)
```

Replace title span:

```tsx
<span className="flex min-w-0 flex-1 items-start gap-1.5">
  <span className="min-w-0 truncate">{thread.title}</span>
  {hasUnread ? (
    <span
      aria-hidden="true"
      className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_2px_rgb(239_68_68_/_0.14)]"
      data-testid={`thread-unread-dot-${thread.id}`}
    />
  ) : null}
  {hasUnread ? <span className="sr-only">, есть новое сообщение</span> : null}
</span>
```

Keep the existing check icon/placeholder at the start of the row.

- [ ] **Step 4: Run targeted ChatPage unread test**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/ChatPage.unread-indicators.test.tsx --run
```

Expected: PASS.

## Task 7: Combined Verification And Review

**Files:**

- Review all modified files from Tasks 1-6.
- Modify: `docs/roadmap/work-log.md` only if implementation is complete and changes stable baseline.

- [ ] **Step 1: Run backend targeted tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/recipientResolver.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts --run
```

Expected: PASS.

- [ ] **Step 2: Run frontend targeted tests**

Run:

```bash
pnpm --dir frontend test -- src/pwa/serviceWorkerAsset.test.ts src/pwa/serviceWorkerRuntime.test.ts src/features/chat/pages/useChatPageNotifications.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx --run
```

Expected: PASS.

- [ ] **Step 3: Run type checks**

Run:

```bash
pnpm --dir backend build
pnpm --dir frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Run formatting/diff checks**

Run:

```bash
pnpm format:check
git diff --check
```

Expected:

- `git diff --check`: PASS.
- `pnpm format:check`: PASS, unless it still reports known unrelated legacy files. If unrelated legacy files fail, record exact blocker in final answer and verify touched files are formatted.

- [ ] **Step 5: Code review**

Review checklist:

- Backend push payload contains only safe routing/context metadata.
- Group title source matches current safe thread list behavior.
- Service worker forwards other-thread pushes to page clients but only visible same-thread clients can suppress system notification.
- Hidden/background clients cannot suppress push.
- Frontend unread state is local, tenant/session scoped by loaded page state, and does not persist across reloads.
- Selected thread clear-on-open cannot clear a different thread.
- UI dot is next to title, not at the far right, and has screen-reader text.
- No direct Chatwoot authority reaches browser.

- [ ] **Step 6: Fix review findings and repeat targeted checks**

If review finds issues, fix them before moving on and repeat:

```bash
pnpm --dir backend test -- src/modules/chat-notifications/recipientResolver.test.ts src/modules/chat-notifications/pushDeliveryService.test.ts --run
pnpm --dir frontend test -- src/pwa/serviceWorkerAsset.test.ts src/pwa/serviceWorkerRuntime.test.ts src/features/chat/pages/useChatPageNotifications.test.tsx src/features/chat/pages/ChatPage.unread-indicators.test.tsx --run
pnpm --dir backend build
pnpm --dir frontend typecheck
git diff --check
```

- [ ] **Step 7: Update work-log if stable baseline changed**

If all checks/review pass, update the existing notifications bullet in `docs/roadmap/work-log.md` to mention safe chat-title push context and local unread dots. Do not list test details.

- [ ] **Step 8: Checkpoint commit**

Run:

```bash
git status --short --branch
git add backend/src/modules/chat-notifications/recipientResolver.ts backend/src/modules/chat-notifications/recipientResolver.test.ts backend/src/modules/chat-notifications/pushDeliveryService.ts backend/src/modules/chat-notifications/pushDeliveryService.test.ts frontend/public/sw.js frontend/src/pwa/serviceWorkerAsset.test.ts frontend/src/pwa/serviceWorkerRuntime.ts frontend/src/pwa/serviceWorkerRuntime.test.ts frontend/src/features/chat/pages/useChatPageNotifications.ts frontend/src/features/chat/pages/useChatPageNotifications.test.tsx frontend/src/features/chat/pages/ChatPage.tsx frontend/src/features/chat/components/ChatHeader.tsx frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx docs/roadmap/work-log.md
git commit -m "feat: add chat notification context"
```

Expected:

- Commit includes only current slice files.
- No `.env`, generated runtime output, `dist`, `node_modules`, Playwright reports, or local visual companion files are staged.

## Manual Smoke After Implementation

Use a local or production tenant with at least one private chat and one group chat.

1. Open portal in private chat.
2. From Chatwoot/agent side, send a new group message.
3. Expected: OS/browser push title is the group name; body has no message text.
4. Expected: opening the portal chat switcher shows a red dot immediately after the group title.
5. Open the group chat.
6. Expected: dot disappears.
7. Repeat in reverse: stay in group chat, send private message.
8. Expected: private chat gets the dot and push title is `Личный чат`.
9. Stay in the target chat and send another message to that same chat.
10. Expected: no local dot for the active chat; visible-client push suppression still works.

Backend unread-state is not validated here because it is out of scope for this slice.
