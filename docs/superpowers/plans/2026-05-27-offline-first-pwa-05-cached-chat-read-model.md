# Offline-first PWA Slice 05: Cached Chat Read Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save and reopen recent chat thread/message snapshots when chat bootstrap is offline, then refresh them on reconnect even when no push stale marker exists.

**Architecture:** The cached read model is display-only and never becomes send authority. It is scoped to `tenantSlug:userId`, selected threads are validated against the cached thread list, and every cached state is clearly marked in the UI. Online thread/message loads, reconnect refreshes, manual refreshes, realtime updates and canonical send results refresh the same bounded IndexedDB snapshot through a small chat-domain cache helper.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 05 of 9

**Depends On:** Slices 02-04.

**Unlocks:** Slice 09 runtime e2e; it can run before or alongside Slice 06 as long as auth scope is ready.

---

## Task 6: Cached Chat Read Model

**Goal:** Save thread list and latest selected-thread snapshots after successful
backend loads, then open cached chat when online chat loading fails and cached
tenant/auth scope is available.

**Files:**

- Modify: `frontend/src/features/chat/pages/chatPageState.ts`
- Create: `frontend/src/features/chat/pages/offlineChatCache.ts`
- Create: `frontend/src/features/chat/pages/offlineChatCache.test.ts`
- Modify: `frontend/src/features/chat/pages/useChatThreadSelection.ts`
- Modify: `frontend/src/features/chat/lib/useChatResumeResync.ts`
- Modify: `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts`
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
- Modify: `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
- Modify: `frontend/src/features/chat/pages/useChatAttachmentSend.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/components/ChatRuntimeAlerts.tsx`
- Create: `frontend/src/features/chat/pages/ChatPage.offline-cache.test.tsx`

- [ ] **Step 1: Extend chat page state with explicit cache metadata**

In `frontend/src/features/chat/pages/chatPageState.ts`, replace the current
state definitions with cache metadata and reusable transition helpers:

```ts
import type { ChatMessagesSnapshot, ChatThreadSummary } from '../types'

export type ChatPageCacheState = {
  cachedSavedAt: string | null
  isUsingCachedData: boolean
}

export const ONLINE_CHAT_PAGE_CACHE_STATE = {
  cachedSavedAt: null,
  isUsingCachedData: false,
} satisfies ChatPageCacheState

type ChatPageThreadState = ChatPageCacheState & {
  selectedThreadId: string | null
  threads: ChatThreadSummary[]
}

export type ChatPageState =
  | (ChatPageThreadState & {
      status: 'error'
      errorMessage: string
      snapshot: ChatMessagesSnapshot | null
    })
  | (ChatPageThreadState & {
      status: 'loading'
      snapshot: ChatMessagesSnapshot | null
    })
  | (ChatPageThreadState & {
      status: 'ready'
      snapshot: ChatMessagesSnapshot
    })

export function readChatPageCacheState(
  state: ChatPageState,
): ChatPageCacheState {
  return {
    cachedSavedAt: state.cachedSavedAt,
    isUsingCachedData: state.isUsingCachedData,
  }
}
```

Every `ChatPageState` object returned by this slice must include either
`...ONLINE_CHAT_PAGE_CACHE_STATE`, `...readChatPageCacheState(currentState)`, or
explicit cached values. Do not leave any transition object without these fields.

- [ ] **Step 2: Add chat-domain offline cache helper**

Create `frontend/src/features/chat/pages/offlineChatCache.ts`:

```ts
import { OFFLINE_MESSAGE_SNAPSHOT_LIMIT } from '../../offline/types'
import { offlineStore } from '../../offline/offlineStore'
import type { OfflineChatThreadListRecord } from '../../offline/types'
import { isFirstConversationBootstrapReady } from '../lib/chatSnapshot'
import type { ChatMessagesSnapshot, ChatThreadSummary } from '../types'

type OfflineChatScope = {
  tenantSlug: string
  userId: number
}

type SaveOfflineThreadListInput = OfflineChatScope & {
  activeThreadId: string
  savedAt?: string
  threads: ChatThreadSummary[]
}

type SaveOfflineMessageSnapshotInput = OfflineChatScope & {
  savedAt?: string
  snapshot: ChatMessagesSnapshot
  threadId: string
}

export type OfflineChatFallback = {
  cachedSavedAt: string
  selectedThreadId: string
  snapshot: ChatMessagesSnapshot
  threads: ChatThreadSummary[]
}

export function shouldSaveOfflineMessageSnapshot(
  snapshot: ChatMessagesSnapshot,
) {
  return (
    snapshot.result === 'ready' || isFirstConversationBootstrapReady(snapshot)
  )
}

export function toBoundedOfflineMessageSnapshot(
  snapshot: ChatMessagesSnapshot,
): ChatMessagesSnapshot {
  const messages = snapshot.messages.slice(-OFFLINE_MESSAGE_SNAPSHOT_LIMIT)
  const wasTrimmed = messages.length < snapshot.messages.length

  return {
    ...snapshot,
    hasMoreOlder: snapshot.hasMoreOlder || wasTrimmed,
    messages,
    nextOlderCursor: wasTrimmed
      ? (messages[0]?.id ?? snapshot.nextOlderCursor)
      : snapshot.nextOlderCursor,
  }
}

export async function saveOfflineThreadList({
  activeThreadId,
  savedAt = new Date().toISOString(),
  tenantSlug,
  threads,
  userId,
}: SaveOfflineThreadListInput) {
  await offlineStore.saveThreadList({
    activeThreadId,
    savedAt,
    tenantSlug,
    threads,
    userId,
  })
}

export async function saveOfflineMessageSnapshot({
  savedAt = new Date().toISOString(),
  snapshot,
  tenantSlug,
  threadId,
  userId,
}: SaveOfflineMessageSnapshotInput) {
  if (!shouldSaveOfflineMessageSnapshot(snapshot)) {
    return
  }

  await offlineStore.saveMessageSnapshot({
    savedAt,
    snapshot: toBoundedOfflineMessageSnapshot(snapshot),
    tenantSlug,
    threadId,
    userId,
  })
}

export function selectCachedThreadId({
  cachedThreads,
  preferredThreadId,
}: {
  cachedThreads: OfflineChatThreadListRecord
  preferredThreadId: string | null
}) {
  const threadIds = new Set(cachedThreads.threads.map((thread) => thread.id))

  if (preferredThreadId && threadIds.has(preferredThreadId)) {
    return preferredThreadId
  }

  if (threadIds.has(cachedThreads.activeThreadId)) {
    return cachedThreads.activeThreadId
  }

  return cachedThreads.threads[0]?.id ?? null
}

export async function readOfflineChatFallback({
  preferredThreadId,
  tenantSlug,
  userId,
}: OfflineChatScope & {
  preferredThreadId: string | null
}): Promise<OfflineChatFallback | null> {
  try {
    const cachedThreads = await offlineStore.readThreadList(tenantSlug, userId)

    if (!cachedThreads) {
      return null
    }

    const selectedThreadId = selectCachedThreadId({
      cachedThreads,
      preferredThreadId,
    })

    if (!selectedThreadId) {
      return null
    }

    const cachedSnapshot = await offlineStore.readMessageSnapshot(
      tenantSlug,
      userId,
      selectedThreadId,
    )

    if (!cachedSnapshot) {
      return null
    }

    if (!shouldSaveOfflineMessageSnapshot(cachedSnapshot.snapshot)) {
      return null
    }

    if (
      cachedSnapshot.snapshot.result === 'ready' &&
      !cachedSnapshot.snapshot.activeThread
    ) {
      return null
    }

    if (
      cachedSnapshot.snapshot.activeThread &&
      cachedSnapshot.snapshot.activeThread.id !== selectedThreadId
    ) {
      return null
    }

    return {
      cachedSavedAt: cachedSnapshot.savedAt,
      selectedThreadId,
      snapshot: cachedSnapshot.snapshot,
      threads: cachedThreads.threads,
    }
  } catch {
    return null
  }
}
```

The helper is intentionally in the chat frontend domain. It composes
`offlineStore` primitives from Slice 02 but keeps chat-specific rules out of
`offlineStore`.

- [ ] **Step 3: Write cache helper tests**

Create `frontend/src/features/chat/pages/offlineChatCache.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineStore } from '../../offline/offlineStore'
import type { ChatMessagesSnapshot } from '../types'
import {
  readOfflineChatFallback,
  saveOfflineMessageSnapshot,
  selectCachedThreadId,
  shouldSaveOfflineMessageSnapshot,
  toBoundedOfflineMessageSnapshot,
} from './offlineChatCache'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
} as const

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-04-21T09:12:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

describe('offlineChatCache', () => {
  beforeEach(async () => {
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('selects only a cached thread id from the cached thread list', () => {
    const cachedThreads = {
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThread, groupThread],
      userId: 7,
    }

    expect(
      selectCachedThreadId({
        cachedThreads,
        preferredThreadId: groupThread.id,
      }),
    ).toBe(groupThread.id)
    expect(
      selectCachedThreadId({
        cachedThreads,
        preferredThreadId: 'group:999',
      }),
    ).toBe(privateThread.id)
  })

  it('falls back to the first cached thread when activeThreadId is stale', () => {
    expect(
      selectCachedThreadId({
        cachedThreads: {
          activeThreadId: 'group:999',
          savedAt: '2026-05-27T10:00:00.000Z',
          tenantSlug: 'buhfirma',
          threads: [privateThread],
          userId: 7,
        },
        preferredThreadId: null,
      }),
    ).toBe(privateThread.id)
  })

  it('ignores unavailable snapshots and saves bounded ready snapshots', async () => {
    const readySnapshot = createReadySnapshot({
      messages: Array.from({ length: 55 }, (_, index) => ({
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent' as const,
        content: `Сообщение ${index}`,
        contentType: 'text',
        createdAt: `2026-04-21T09:${String(index).padStart(2, '0')}:00.000Z`,
        direction: 'incoming' as const,
        id: index + 1,
        status: 'sent',
      })),
    })

    expect(shouldSaveOfflineMessageSnapshot(readySnapshot)).toBe(true)
    expect(
      toBoundedOfflineMessageSnapshot(readySnapshot).messages,
    ).toHaveLength(50)

    await saveOfflineMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: readySnapshot,
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    await expect(
      offlineStore.readMessageSnapshot('buhfirma', 7, privateThread.id),
    ).resolves.toMatchObject({
      snapshot: {
        hasMoreOlder: true,
        messages: expect.arrayContaining([
          expect.objectContaining({ id: 6 }),
          expect.objectContaining({ id: 55 }),
        ]),
      },
    })

    await saveOfflineMessageSnapshot({
      snapshot: createReadySnapshot({
        activeThread: null,
        messages: [],
        reason: 'chatwoot_unavailable',
        result: 'unavailable',
      }),
      tenantSlug: 'buhfirma',
      threadId: 'group:154',
      userId: 7,
    })

    await expect(
      offlineStore.readMessageSnapshot('buhfirma', 7, 'group:154'),
    ).resolves.toBeNull()
  })

  it('returns null when the cached selected snapshot does not match cached threads', async () => {
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThread],
      userId: 7,
    })
    await offlineStore.saveMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot({
        activeThread: groupThread,
      }),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    await expect(
      readOfflineChatFallback({
        preferredThreadId: 'group:999',
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    ).resolves.toBeNull()
  })

  it('returns null when the cached fallback read fails', async () => {
    vi.spyOn(offlineStore, 'readThreadList').mockRejectedValueOnce(
      new Error('IndexedDB read failed'),
    )

    await expect(
      readOfflineChatFallback({
        preferredThreadId: privateThread.id,
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    ).resolves.toBeNull()
  })
})
```

- [ ] **Step 4: Update existing state transitions to include cache metadata**

In `frontend/src/features/chat/pages/useChatThreadSelection.ts`, import the
state/cache helpers:

```ts
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  readChatPageCacheState,
  type ChatPageState,
} from './chatPageState'
import {
  readOfflineChatFallback,
  saveOfflineThreadList,
} from './offlineChatCache'
```

Extend the hook input:

```ts
type UseChatThreadSelectionInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  pageState: ChatPageState
  setHistoryErrorMessage: Dispatch<SetStateAction<string | null>>
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  setReplyTarget: Dispatch<SetStateAction<MessageComposerReplyTarget | null>>
  setSendErrorMessage: Dispatch<SetStateAction<string | null>>
  tenantSlug: string | null
  userId: number | null
}
```

Add a local cached fallback helper inside `useChatThreadSelection` after
`loadRequestIdRef`:

```ts
const openCachedChatFallback = useCallback(
  async ({
    preferredThreadId,
    requestId,
  }: {
    preferredThreadId: string | null
    requestId: number
  }) => {
    if (!tenantSlug || userId === null) {
      return false
    }

    const fallback = await readOfflineChatFallback({
      preferredThreadId,
      tenantSlug,
      userId,
    })

    if (
      !fallback ||
      !isMountedRef.current ||
      loadRequestIdRef.current !== requestId
    ) {
      return false
    }

    setPageState({
      cachedSavedAt: fallback.cachedSavedAt,
      isUsingCachedData: true,
      selectedThreadId: fallback.selectedThreadId,
      snapshot: fallback.snapshot,
      status: 'ready',
      threads: fallback.threads,
    })

    return true
  },
  [isMountedRef, setPageState, tenantSlug, userId],
)
```

Update `loadInitialChat()` state transitions:

```ts
setPageState((currentState) => ({
  ...readChatPageCacheState(currentState),
  selectedThreadId: currentState.selectedThreadId,
  snapshot: currentState.snapshot,
  status: 'loading',
  threads: currentState.threads,
}))
```

Inside the successful online path, save the thread list and reset cache metadata:

```ts
const threadsResponse = await getChatThreads()
const selectedThreadId =
  threadsResponse.activeThreadId ?? getFallbackThreadId(threadsResponse.threads)

if (tenantSlug && userId !== null) {
  void saveOfflineThreadList({
    activeThreadId: selectedThreadId,
    tenantSlug,
    threads: threadsResponse.threads,
    userId,
  }).catch(() => undefined)
}

const snapshot = await getChatMessages({ threadId: selectedThreadId })
```

```ts
setPageState({
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  selectedThreadId,
  snapshot,
  status: 'ready',
  threads: threadsResponse.threads,
})
```

In the `catch` branch, only open cached chat for network failures and keep the
existing controlled error state when no valid cache exists:

```ts
const canUseOfflineFallback = handleConnectionUnavailableError(error)

if (
  canUseOfflineFallback &&
  (await openCachedChatFallback({
    preferredThreadId: pageState.selectedThreadId,
    requestId,
  }))
) {
  return
}

setPageState((currentState) => ({
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  errorMessage:
    error instanceof Error
      ? error.message
      : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
  selectedThreadId: currentState.selectedThreadId,
  snapshot: null,
  status: 'error',
  threads: currentState.threads,
}))
```

Update `handleSelectThread()` transitions:

```ts
setPageState((currentState) => ({
  ...readChatPageCacheState(currentState),
  selectedThreadId: threadId,
  snapshot: null,
  status: 'loading',
  threads: currentState.threads,
}))
```

```ts
setPageState((currentState) => ({
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  selectedThreadId: threadId,
  snapshot,
  status: 'ready',
  threads: currentState.threads,
}))
```

```ts
const canUseOfflineFallback = handleConnectionUnavailableError(error)

if (
  canUseOfflineFallback &&
  (await openCachedChatFallback({
    preferredThreadId: threadId,
    requestId,
  }))
) {
  return
}

setPageState((currentState) => ({
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  errorMessage:
    error instanceof Error
      ? error.message
      : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
  selectedThreadId: threadId,
  snapshot: null,
  status: 'error',
  threads: currentState.threads,
}))
```

Update `loadInitialChat` dependencies to include `openCachedChatFallback`,
`pageState.selectedThreadId`, `tenantSlug` and `userId`. Update
`handleSelectThread` dependencies to include `openCachedChatFallback`.

In `frontend/src/features/chat/pages/useChatSnapshotRefresh.ts`, import
`ONLINE_CHAT_PAGE_CACHE_STATE` and add it to both successful return objects:

```ts
return {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  snapshot: mergeRealtimeSnapshot({
    currentSnapshot: currentState.snapshot,
    realtimeSnapshot: latestSnapshot,
  }),
  selectedThreadId: currentState.selectedThreadId,
  status: 'ready',
  threads: currentState.threads,
}
```

```ts
return {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  snapshot: latestSnapshot,
  selectedThreadId: currentState.selectedThreadId,
  status: 'ready',
  threads: currentState.threads,
}
```

In `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`, import
`ONLINE_CHAT_PAGE_CACHE_STATE` and add it to both realtime return objects:

```ts
return {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  snapshot: realtimeSnapshot,
  selectedThreadId: currentState.selectedThreadId,
  status: 'ready',
  threads: currentState.threads,
}
```

```ts
return {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  snapshot: mergeRealtimeSnapshot({
    currentSnapshot: currentState.snapshot,
    realtimeSnapshot,
  }),
  selectedThreadId: currentState.selectedThreadId,
  status: 'ready',
  threads: currentState.threads,
}
```

In `frontend/src/features/chat/pages/useOptimisticTextSend.ts`, import
`ONLINE_CHAT_PAGE_CACHE_STATE` and add it to the canonical send success return:

```ts
return {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  snapshot: buildSnapshotFromSendResult({
    currentSnapshot,
    sendResult,
  }),
  selectedThreadId: currentState.selectedThreadId,
  status: 'ready',
  threads: currentState.threads,
}
```

In `frontend/src/features/chat/pages/useChatAttachmentSend.ts`, import
`ONLINE_CHAT_PAGE_CACHE_STATE` and add it to the attachment send success return:

```ts
return {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  snapshot: buildSnapshotFromSendResult({
    currentSnapshot,
    sendResult,
  }),
  selectedThreadId: currentState.selectedThreadId,
  status: 'ready',
  threads: currentState.threads,
}
```

- [ ] **Step 5: Wire tenant/user scope and best-effort cache persistence in ChatPage**

In `frontend/src/features/chat/pages/ChatPage.tsx`, import the tenant hook, state
constant and cache helpers:

```ts
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  type ChatPageState,
} from './chatPageState'
import {
  saveOfflineMessageSnapshot,
  saveOfflineThreadList,
} from './offlineChatCache'
```

Initialize `pageState` with online cache metadata:

```ts
const { tenant } = useTenantIdentity()
const { refreshSession, user } = useAuthSession()
const [pageState, setPageState] = useState<ChatPageState>({
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  selectedThreadId: null,
  snapshot: null,
  status: 'loading',
  threads: [],
})
```

Pass tenant/user scope into `useChatThreadSelection`:

```ts
const tenantSlug = tenant?.slug ?? null
const userId = user?.id ?? null

const { handleSelectThread, loadInitialChat } = useChatThreadSelection({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  pageState,
  setHistoryErrorMessage,
  setPageState,
  setReplyTarget,
  setSendErrorMessage,
  tenantSlug,
  userId,
})
```

Update `useChatResumeResync` so cached-open reconnect performs a full chat
bootstrap instead of only refreshing the selected thread:

```ts
type UseChatResumeResyncInput = {
  canAttemptResync: boolean
  forceFullReloadOnResync?: boolean
  loadInitialChat: () => Promise<void>
  refreshChatSnapshot: () => Promise<void>
  snapshotExists: boolean
}
```

```ts
export function useChatResumeResync({
  canAttemptResync,
  forceFullReloadOnResync = false,
  loadInitialChat,
  refreshChatSnapshot,
  snapshotExists,
}: UseChatResumeResyncInput) {
```

Inside `resyncChatAfterResume`, reload the full bootstrap when the current UI is
showing cached data:

```ts
if (forceFullReloadOnResync || !snapshotExists) {
  await loadInitialChat()
  return
}
```

In `ChatPage.tsx`, pass the current cached state:

```ts
const resyncStatus = useChatResumeResync({
  canAttemptResync: isBrowserOnline || navigatorHintIsOnline,
  forceFullReloadOnResync: pageState.isUsingCachedData,
  loadInitialChat,
  refreshChatSnapshot,
  snapshotExists: Boolean(pageState.snapshot),
})
```

Add a best-effort effect that refreshes the cached thread list after every
online state transition. It must not write cached fallback data back as if it
were fresh online data. When the app upgrades from cached to online after a
successful backend request, refresh the thread list and selected thread even if
there is no push stale marker; push is an optimization, not the freshness
boundary.

```ts
useEffect(() => {
  if (
    !tenantSlug ||
    userId === null ||
    pageState.isUsingCachedData ||
    !pageState.selectedThreadId ||
    pageState.threads.length === 0
  ) {
    return
  }

  void saveOfflineThreadList({
    activeThreadId: pageState.selectedThreadId,
    tenantSlug,
    threads: pageState.threads,
    userId,
  }).catch(() => undefined)
}, [
  pageState.isUsingCachedData,
  pageState.selectedThreadId,
  pageState.threads,
  tenantSlug,
  userId,
])
```

Add a best-effort effect that saves latest ready/bootstrap-ready message
snapshots after online initial load, thread switch, refresh/resync, realtime,
text send and attachment send transitions:

```ts
useEffect(() => {
  if (
    !tenantSlug ||
    userId === null ||
    pageState.status !== 'ready' ||
    pageState.isUsingCachedData ||
    !pageState.selectedThreadId
  ) {
    return
  }

  void saveOfflineMessageSnapshot({
    snapshot: pageState.snapshot,
    tenantSlug,
    threadId: pageState.selectedThreadId,
    userId,
  }).catch(() => undefined)
}, [
  pageState.isUsingCachedData,
  pageState.selectedThreadId,
  pageState.snapshot,
  pageState.status,
  tenantSlug,
  userId,
])
```

Update the `handleLoadOlderMessages()` merge transition in `ChatPage.tsx`:

```ts
return {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  snapshot: mergeOlderMessages(currentState.snapshot, olderSnapshot),
  selectedThreadId: currentState.selectedThreadId,
  status: 'ready',
  threads: currentState.threads,
}
```

Wire cached state into `ChatRuntimeAlerts`:

```tsx
<ChatRuntimeAlerts
  cachedSavedAt={pageState.cachedSavedAt}
  isOnline={isBrowserOnline}
  isRealtimeSupported={isRealtimeSupported}
  isUsingCachedData={pageState.isUsingCachedData}
  resyncStatus={resyncStatus}
/>
```

- [ ] **Step 6: Render cached-data runtime alert**

In `frontend/src/features/chat/components/ChatRuntimeAlerts.tsx`, update props:

```ts
type ChatRuntimeAlertsProps = {
  cachedSavedAt?: string | null
  hasQueuedSends?: boolean
  isOnline: boolean
  isRealtimeSupported: boolean
  isUsingCachedData?: boolean
  resyncStatus: 'idle' | 'resyncing' | 'error'
}
```

Update function parameters:

```ts
export function ChatRuntimeAlerts({
  cachedSavedAt,
  hasQueuedSends = false,
  isOnline,
  isRealtimeSupported,
  isUsingCachedData = false,
  resyncStatus,
}: ChatRuntimeAlertsProps) {
```

Add cached/outbox messages before realtime support messages:

```ts
if (isUsingCachedData) {
  messages.push({
    message: cachedSavedAt
      ? 'Нет соединения. Показываем сохраненные данные. Обновим чат после восстановления связи.'
      : 'Нет соединения. Показываем сохраненные данные.',
    tone: 'info' as const,
  })
}

if (hasQueuedSends) {
  messages.push({
    message: 'Сообщения будут отправлены, когда соединение восстановится.',
    tone: 'info' as const,
  })
}
```

- [ ] **Step 7: Write cached chat route tests**

Create `frontend/src/features/chat/pages/ChatPage.offline-cache.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineStore } from '../../offline/offlineStore'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import type { ChatMessagesSnapshot } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createAuthenticatedUserResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [privateThread],
  }
}

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-04-21T09:12:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

function renderChatRoute() {
  renderWithRouter(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <AppRoutes />
      </AuthSessionProvider>
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}

describe('ChatPage offline cache', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock)
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('opens cached thread list and messages when chat bootstrap is offline', async () => {
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThread],
      userId: 7,
    })
    await offlineStore.saveMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot(),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        /Нет соединения\. Показываем сохраненные данные\./,
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
  })

  it('keeps controlled unavailable state when chat bootstrap is offline without cache', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Чат временно недоступен',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Нет соединения\. Показываем сохраненные данные\./),
    ).not.toBeInTheDocument()
  })

  it('keeps controlled unavailable state when cached fallback read fails', async () => {
    vi.spyOn(offlineStore, 'readThreadList').mockRejectedValueOnce(
      new Error('IndexedDB read failed'),
    )
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Чат временно недоступен',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Нет соединения\. Показываем сохраненные данные\./),
    ).not.toBeInTheDocument()
  })

  it('refreshes thread list and selected messages on reconnect from cached open', async () => {
    const onlineThread = {
      ...privateThread,
      subtitle: 'Обновлено онлайн',
      title: 'Личный чат онлайн',
    }
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThread],
      userId: 7,
    })
    await offlineStore.saveMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot(),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    let threadRequestCount = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        threadRequestCount += 1

        if (threadRequestCount === 1) {
          throw new TypeError('network down')
        }

        return createJsonResponse({
          activeThreadId: onlineThread.id,
          threads: [onlineThread],
        })
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(
          createReadySnapshot({
            activeThread: onlineThread,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Онлайн обновление после восстановления связи.',
                contentType: 'text',
                createdAt: '2026-04-21T09:15:00.000Z',
                direction: 'incoming',
                id: 202,
                status: 'sent',
              },
            ],
          }),
        )
      }

      if (url === '/api/chat/support-availability') {
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

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        /Нет соединения\. Показываем сохраненные данные\./,
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    window.dispatchEvent(new Event('online'))

    expect(
      await screen.findByText(
        'Онлайн обновление после восстановления связи.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Личный чат онлайн')).toBeInTheDocument()
    expect(
      screen.queryByText(/Нет соединения\. Показываем сохраненные данные\./),
    ).not.toBeInTheDocument()
  })

  it('saves online chat snapshots for later offline open', async () => {
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

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Здравствуйте, вижу ваше обращение.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    await waitFor(async () => {
      await expect(
        offlineStore.readThreadList('buhfirma', 7),
      ).resolves.toMatchObject({
        activeThreadId: privateThread.id,
        threads: [privateThread],
      })
    })
    await waitFor(async () => {
      await expect(
        offlineStore.readMessageSnapshot('buhfirma', 7, privateThread.id),
      ).resolves.toMatchObject({
        snapshot: {
          messages: [expect.objectContaining({ id: 101 })],
        },
      })
    })
  })
})
```

- [ ] **Step 8: Run cached chat tests**

```bash
pnpm --dir frontend test -- src/features/chat/pages/offlineChatCache.test.ts src/features/chat/pages/ChatPage.offline-cache.test.tsx src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.thread-selection.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx --run
pnpm --dir frontend typecheck
```

Expected: PASS.

Additional acceptance for this slice:

- cached chat data is visibly marked as saved data until a backend refresh
  succeeds;
- reconnect after cached open refreshes thread list and selected thread before
  the UI treats cached messages as fresh;
- the refresh path does not require a push stale marker, because push may be
  disabled, delayed or unsupported on the device.
