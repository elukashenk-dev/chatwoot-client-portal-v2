# Offline-first PWA Slice 03: Startup UX And Tenant Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop splash-screen hangs by adding startup deadlines, slow-connection UI, cached tenant fallback and controlled local-storage-missing states.

**Architecture:** Tenant remains backend-authoritative online, but network timeout/offline startup can open a saved tenant context. Authoritative tenant rejection still invalidates cached tenant data. Missing, evicted or unavailable IndexedDB data is treated like first access and never leaves the user on splash.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 03 of 9

**Depends On:** Slice 02 IndexedDB foundation.

**Unlocks:** Slice 04 cached auth, because protected shell startup needs tenant context first.

---

## Task 3: Boot Coordinator And Request Timeouts

**Goal:** Centralize startup deadlines and timeout behavior so tenant/auth
providers cannot leave the user on an indefinite splash.

**Files:**

- Create: `frontend/src/features/offline/bootCoordinator.ts`
- Create: `frontend/src/features/offline/bootCoordinator.test.ts`
- Modify: `frontend/src/features/tenant/api/tenantClient.ts`
- Modify: `frontend/src/features/auth/api/authClient.ts`
- Create: `frontend/src/features/auth/api/authClient.test.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/api/chatClient.startup.test.ts`

- [ ] **Step 1: Create failing boot coordinator tests**

Create `frontend/src/features/offline/bootCoordinator.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BOOT_CACHE_FALLBACK_MS,
  BOOT_ONLINE_REQUIRED_MS,
  BOOT_REQUEST_TIMEOUT_MS,
  BOOT_SLOW_NOTICE_MS,
  createRequestTimeout,
  getBootStatusForElapsedMs,
  isNetworkOrTimeoutError,
} from './bootCoordinator'

afterEach(() => {
  vi.useRealTimers()
})

describe('boot coordinator', () => {
  it('moves through slow and fallback deadlines', () => {
    expect(getBootStatusForElapsedMs(0, false)).toBe('checking_online')
    expect(getBootStatusForElapsedMs(BOOT_SLOW_NOTICE_MS, false)).toBe(
      'slow_connection',
    )
    expect(getBootStatusForElapsedMs(BOOT_CACHE_FALLBACK_MS, true)).toBe(
      'opening_saved_data',
    )
    expect(getBootStatusForElapsedMs(BOOT_ONLINE_REQUIRED_MS, false)).toBe(
      'online_required',
    )
  })

  it('creates a timeout handle that aborts after request timeout', () => {
    vi.useFakeTimers()
    const timeout = createRequestTimeout()

    expect(timeout.signal.aborted).toBe(false)
    vi.advanceTimersByTime(BOOT_REQUEST_TIMEOUT_MS)
    expect(timeout.signal.aborted).toBe(true)
  })

  it('can cancel fallback timeout handles', () => {
    vi.useFakeTimers()
    const timeout = createRequestTimeout()

    timeout.cancel()
    vi.advanceTimersByTime(BOOT_REQUEST_TIMEOUT_MS)

    expect(timeout.signal.aborted).toBe(false)
  })

  it('recognizes abort and timeout errors by browser error name', () => {
    expect(new DOMException('Aborted', 'AbortError')).toSatisfy(
      isNetworkOrTimeoutError,
    )
    expect(new DOMException('Timed out', 'TimeoutError')).toSatisfy(
      isNetworkOrTimeoutError,
    )
    expect(new Error('boom')).not.toSatisfy(isNetworkOrTimeoutError)
  })
})
```

- [ ] **Step 2: Run test and verify failure**

```bash
pnpm --dir frontend test -- src/features/offline/bootCoordinator.test.ts --run
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement boot coordinator**

Create `frontend/src/features/offline/bootCoordinator.ts`:

```ts
export const BOOT_SLOW_NOTICE_MS = 1200
export const BOOT_CACHE_FALLBACK_MS = 2500
export const BOOT_ONLINE_REQUIRED_MS = 8000
export const BOOT_REQUEST_TIMEOUT_MS = 10000

export type BootRuntimeState =
  | 'boot_error'
  | 'checking_online'
  | 'online_required'
  | 'opening_saved_data'
  | 'ready_cached'
  | 'ready_online'
  | 'session_check_required'
  | 'slow_connection'

export function getBootStatusForElapsedMs(
  elapsedMs: number,
  hasValidCache: boolean,
): BootRuntimeState {
  if (elapsedMs >= BOOT_ONLINE_REQUIRED_MS && !hasValidCache) {
    return 'online_required'
  }

  if (elapsedMs >= BOOT_CACHE_FALLBACK_MS && hasValidCache) {
    return 'opening_saved_data'
  }

  if (elapsedMs >= BOOT_SLOW_NOTICE_MS) {
    return 'slow_connection'
  }

  return 'checking_online'
}

export function createRequestTimeoutSignal(
  timeoutMs = BOOT_REQUEST_TIMEOUT_MS,
) {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(timeoutMs)
  }

  return createRequestTimeout(timeoutMs).signal
}

export function createRequestTimeout(timeoutMs = BOOT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  return {
    cancel: () => {
      window.clearTimeout(timeoutId)
    },
    signal: controller.signal,
  }
}

export function isNetworkOrTimeoutError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as { name?: unknown }

  return (
    candidate.name === 'AbortError' ||
    candidate.name === 'TimeoutError' ||
    candidate.name === 'NetworkError'
  )
}
```

- [ ] **Step 4: Add optional request `signal` to API clients**

In tenant/auth/chat clients, extend startup-capable exported functions and
internal request functions to accept `signal?: AbortSignal` and pass it to
`fetch`.

Tenant example in `frontend/src/features/tenant/api/tenantClient.ts`:

```ts
export type TenantRequestOptions = {
  signal?: AbortSignal
}

export async function getPublicTenantContext({
  signal,
}: TenantRequestOptions = {}) {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/tenant`, {
      cache: 'no-store',
      credentials: 'include',
      method: 'GET',
      signal,
    })
  } catch {
    throw new TenantClientError({
      message: NETWORK_ERROR_MESSAGE,
      statusCode: 0,
    })
  }
```

Auth example:

```ts
type AuthRequestOptions = {
  signal?: AbortSignal
}

async function request<TResponse>(
  path: string,
  init: RequestInit & AuthRequestOptions,
): Promise<TResponse> {
  response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
  })
}

export async function getCurrentUser({ signal }: AuthRequestOptions = {}) {
  try {
    const response = await request<AuthUserResponse>('/auth/me', {
      method: 'GET',
      signal,
    })

    return response.user
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 401) {
      return null
    }

    throw error
  }
}
```

Chat example:

```ts
async function request<TResponse>(
  path: string,
  {
    body,
    formData,
    method = 'GET',
    networkErrorMessage = NETWORK_ERROR_MESSAGE,
    signal,
  }: {
    body?: unknown
    formData?: FormData
    method?: 'DELETE' | 'GET' | 'PATCH' | 'POST'
    networkErrorMessage?: string
    signal?: AbortSignal
  } = {},
): Promise<TResponse> {
  response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers:
      body === undefined || formData !== undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
          },
    method,
    signal,
    ...(formData !== undefined
      ? { body: formData }
      : body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
  })
}

export async function getChatThreads({
  signal,
}: { signal?: AbortSignal } = {}) {
  return request<ChatThreadsResponse>('/chat/threads', { signal })
}

export async function getChatMessages({
  beforeMessageId,
  signal,
  threadId,
}: {
  beforeMessageId?: number | null
  signal?: AbortSignal
  threadId: string
}) {
  const searchParams = new URLSearchParams()

  searchParams.set('threadId', threadId)

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  const query = searchParams.toString()

  return request<ChatMessagesSnapshot>(
    `/chat/messages${query ? `?${query}` : ''}`,
    {
      signal,
    },
  )
}
```

- [ ] **Step 5: Add API signal forwarding tests**

Create `frontend/src/features/auth/api/authClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCurrentUser } from './authClient'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth API client', () => {
  it('passes abort signals to current user startup request', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        user: {
          email: 'name@company.ru',
          fullName: 'Portal User',
          id: 7,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurrentUser({ signal })).resolves.toMatchObject({
      id: 7,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        signal,
      }),
    )
  })
})
```

Create `frontend/src/features/chat/api/chatClient.startup.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatMessages, getChatThreads } from './chatClient'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat startup API client', () => {
  it('passes abort signals to startup read requests', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          activeThreadId: 'private:me',
          threads: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          activeThread: null,
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
          reason: 'none',
          result: 'ready',
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await getChatThreads({ signal })
    await getChatMessages({ signal, threadId: 'private:me' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chat/threads',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        signal,
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/messages?threadId=private%3Ame',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        signal,
      }),
    )
  })
})
```

- [ ] **Step 6: Run API and coordinator tests**

```bash
pnpm --dir frontend test -- src/features/offline/bootCoordinator.test.ts src/features/auth/api/authClient.test.ts src/features/chat/api/chatClient.startup.test.ts src/features/tenant/lib/TenantProvider.test.tsx src/features/chat/api/chatClient.notifications.test.ts --run
```

Expected: PASS.

## Task 4: Tenant Cached Startup And Anti-hang UI

**Goal:** Tenant provider opens from saved tenant context on network/timeout,
shows slow/offline copy, and invalidates cache on authoritative tenant failure.

**Files:**

- Modify: `frontend/src/features/tenant/lib/tenantIdentityContext.ts`
- Modify: `frontend/src/features/tenant/components/TenantSplashScreen.tsx`
- Modify: `frontend/src/features/tenant/lib/TenantProvider.tsx`
- Modify: `frontend/src/features/tenant/lib/TenantProvider.test.tsx`

- [ ] **Step 1: Extend tenant context types**

In `tenantIdentityContext.ts`:

```ts
export type TenantIdentityStatus =
  | 'error'
  | 'loading'
  | 'online_required'
  | 'ready'
  | 'ready_cached'
  | 'slow_connection'

export type TenantIdentityContextValue = {
  errorMessage: string | null
  isUsingCachedData: boolean
  status: TenantIdentityStatus
  tenant: PublicTenantContext | null
}
```

Set fallback:

```ts
export const fallbackTenantIdentityContext: TenantIdentityContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'loading',
  tenant: null,
}
```

- [ ] **Step 2: Write failing tenant cached startup tests**

Update the existing Testing Library import and add offline imports in
`TenantProvider.test.tsx`:

```ts
import { act, fireEvent, render, screen } from '@testing-library/react'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineStore } from '../../offline/offlineStore'
import {
  BOOT_CACHE_FALLBACK_MS,
  BOOT_ONLINE_REQUIRED_MS,
  BOOT_REQUEST_TIMEOUT_MS,
  BOOT_SLOW_NOTICE_MS,
} from '../../offline/bootCoordinator'
```

Update `TenantProbe` so tests can assert cached-vs-online context:

```tsx
function TenantProbe() {
  const { isUsingCachedData, status, tenant } = useTenantIdentity()

  return (
    <div>
      <span>{status}</span>
      <span>{isUsingCachedData ? 'cached tenant' : 'online tenant'}</span>
      <span>{tenant?.displayName ?? 'no tenant'}</span>
    </div>
  )
}
```

Add test helpers:

```ts
async function advanceBootTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function createTenantResponse(displayName = 'Бухфирма') {
  return createJsonResponse({
    tenant: {
      displayName,
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    },
  })
}

function cachedTenantRecord() {
  return {
    host: window.location.host,
    savedAt: '2026-05-27T10:00:00.000Z',
    tenant: {
      displayName: 'Бухфирма',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}
```

Extend the existing setup without enabling fake timers globally:

```ts
beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock)
  document.head.innerHTML = ''
  document.title = 'Клиентский портал'
  appendMetadata('application-name')
  appendMetadata('apple-mobile-web-app-title')
  appendMetadata('description')
  appendMetadata('theme-color')
  await clearOfflineDatabaseForTests()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})
```

Also update the existing splash test heading expectation in this test step; it
will fail until Step 4 gives the default title its final punctuation:

```ts
expect(
  screen.getByRole('heading', { name: 'Открываем кабинет.' }),
).toBeInTheDocument()
```

Cached open test:

```ts
it('opens cached tenant when online tenant request is slow', async () => {
  vi.useFakeTimers()
  fetchMock.mockReturnValueOnce(new Promise(() => {}))
  await offlineStore.saveTenantContext(cachedTenantRecord())

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  await advanceBootTimers(BOOT_SLOW_NOTICE_MS)

  expect(
    screen.getByText('Связь отвечает медленно. Проверяем сохраненные данные.'),
  ).toBeInTheDocument()

  await advanceBootTimers(BOOT_CACHE_FALLBACK_MS - BOOT_SLOW_NOTICE_MS)

  expect(screen.getByText('ready_cached')).toBeInTheDocument()
  expect(screen.getByText('cached tenant')).toBeInTheDocument()
  expect(screen.getByText('Бухфирма')).toBeInTheDocument()

  await advanceBootTimers(BOOT_REQUEST_TIMEOUT_MS - BOOT_CACHE_FALLBACK_MS)

  expect(screen.getByText('ready_cached')).toBeInTheDocument()
  expect(screen.getByText('cached tenant')).toBeInTheDocument()
})
```

No cache test:

```ts
it('leaves splash with online-required state when tenant cache is missing', async () => {
  vi.useFakeTimers()
  fetchMock.mockReturnValueOnce(new Promise(() => {}))

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

  expect(screen.getByText('Нужно подключение к интернету.')).toBeInTheDocument()
  expect(
    screen.getByText('Для первого входа и проверки доступа требуется соединение.'),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Повторить' }),
  ).toBeInTheDocument()
  expect(screen.queryByText('no tenant')).not.toBeInTheDocument()

  await advanceBootTimers(BOOT_REQUEST_TIMEOUT_MS - BOOT_ONLINE_REQUIRED_MS)

  expect(screen.getByText('Нужно подключение к интернету.')).toBeInTheDocument()
  expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
})
```

Storage-unavailable test:

```ts
it('leaves splash with controlled copy when saved tenant storage is unavailable', async () => {
  vi.useFakeTimers()
  vi.spyOn(offlineStore, 'readTenantContext').mockRejectedValueOnce(
    new DOMException('IndexedDB unavailable', 'InvalidStateError'),
  )
  fetchMock.mockReturnValueOnce(new Promise(() => {}))

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

  expect(
    screen.getByText('Сохраненные данные недоступны. Нужно подключение.'),
  ).toBeInTheDocument()
  expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
})
```

Generic cache-read failure test:

```ts
it('leaves splash with controlled copy when saved tenant cache read fails', async () => {
  vi.useFakeTimers()
  vi.spyOn(offlineStore, 'readTenantContext').mockRejectedValueOnce(
    new Error('cache read failed'),
  )
  fetchMock.mockReturnValueOnce(new Promise(() => {}))

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

  expect(
    screen.getByText('Сохраненные данные недоступны. Нужно подключение.'),
  ).toBeInTheDocument()
  expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
})
```

Authoritative rejection test:

```ts
it('invalidates cached tenant on authoritative rejection', async () => {
  await offlineStore.saveTenantContext(cachedTenantRecord())
  fetchMock.mockResolvedValueOnce(
    createJsonResponse(
      {
        error: {
          code: 'TENANT_NOT_FOUND',
          message: 'Личный кабинет для этого домена не найден.',
        },
      },
      404,
    ),
  )

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  expect(
    await screen.findByText('Нужно подключение к интернету.'),
  ).toBeInTheDocument()
  await expect(
    offlineStore.readTenantContext(window.location.host),
  ).resolves.toBeNull()
})
```

Non-authoritative backend failure test:

```ts
it('opens cached tenant on non-authoritative tenant startup failure', async () => {
  await offlineStore.saveTenantContext(cachedTenantRecord())
  fetchMock.mockResolvedValueOnce(
    createJsonResponse(
      {
        error: {
          code: 'TENANT_SECRET_KEY_INVALID',
          message: 'Tenant secret key is invalid.',
        },
      },
      500,
    ),
  )

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  expect(await screen.findByText('ready_cached')).toBeInTheDocument()
  expect(screen.getByText('cached tenant')).toBeInTheDocument()
  expect(screen.getByText('Бухфирма')).toBeInTheDocument()
  await expect(
    offlineStore.readTenantContext(window.location.host),
  ).resolves.toMatchObject({
    tenant: {
      slug: 'buhfirma',
    },
  })
})
```

Timer race test:

```ts
it('does not let slow-start timers overwrite a fast online tenant', async () => {
  vi.useFakeTimers()
  fetchMock.mockResolvedValueOnce(createTenantResponse())

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  await vi.waitFor(() => {
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  await advanceBootTimers(BOOT_REQUEST_TIMEOUT_MS)

  expect(screen.getByText('ready')).toBeInTheDocument()
  expect(screen.getByText('online tenant')).toBeInTheDocument()
  expect(
    screen.queryByText('Связь отвечает медленно. Проверяем сохраненные данные.'),
  ).not.toBeInTheDocument()
})

it('does not let delayed cache fallback overwrite a fresh online tenant', async () => {
  vi.useFakeTimers()
  const cachedTenant = createDeferred<
    Awaited<ReturnType<typeof offlineStore.readTenantContext>>
  >()
  const onlineTenant = createDeferred<Response>()

  vi.spyOn(offlineStore, 'readTenantContext').mockReturnValueOnce(
    cachedTenant.promise,
  )
  fetchMock.mockReturnValueOnce(onlineTenant.promise)

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

  await act(async () => {
    onlineTenant.resolve(createTenantResponse('Fresh Tenant'))
  })

  await vi.waitFor(() => {
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  await act(async () => {
    cachedTenant.resolve(cachedTenantRecord())
  })

  expect(screen.getByText('ready')).toBeInTheDocument()
  expect(screen.getByText('online tenant')).toBeInTheDocument()
  expect(screen.getByText('Fresh Tenant')).toBeInTheDocument()
  expect(screen.queryByText('cached tenant')).not.toBeInTheDocument()
})
```

Retry test:

```ts
it('retries tenant load from online-required state', async () => {
  vi.useFakeTimers()
  fetchMock.mockReturnValueOnce(new Promise(() => {}))

  render(
    <TenantProvider>
      <TenantProbe />
    </TenantProvider>,
  )

  await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)
  expect(screen.getByText('Нужно подключение к интернету.')).toBeInTheDocument()

  fetchMock.mockResolvedValueOnce(createTenantResponse())
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

  await vi.waitFor(() => {
    expect(screen.getByText('ready')).toBeInTheDocument()
  })
  expect(screen.getByText('online tenant')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 3: Implement tenant provider startup flow**

In `TenantProvider.tsx`, import the shared boot helpers and local store:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  BOOT_CACHE_FALLBACK_MS,
  BOOT_ONLINE_REQUIRED_MS,
  BOOT_SLOW_NOTICE_MS,
  createRequestTimeout,
  isNetworkOrTimeoutError,
} from '../../offline/bootCoordinator'
import { offlineStore } from '../../offline/offlineStore'
import { isOfflineStorageUnavailableError } from '../../offline/storagePersistence'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { PortalFrame } from '../../../shared/ui/PortalFrame'
```

Add a local action state component in the same file:

```tsx
function TenantOnlineRequiredState({
  description = 'Для первого входа и проверки доступа требуется соединение.',
  onRetry,
}: {
  description?: string
  onRetry: () => void
}) {
  return (
    <PortalFrame>
      <section className="mx-auto w-full max-w-md space-y-5 text-center">
        <h1 className="text-2xl font-semibold text-slate-950">
          Нужно подключение к интернету.
        </h1>
        <p className="text-sm leading-6 text-slate-600">{description}</p>
        <PrimaryButton onClick={onRetry} type="button">
          Повторить
        </PrimaryButton>
      </section>
    </PortalFrame>
  )
}
```

Add small helpers before `TenantProvider`:

```ts
const authoritativeTenantFailureCodes = new Set([
  'TENANT_DISABLED',
  'TENANT_DOMAIN_MISMATCH',
  'TENANT_FORBIDDEN',
  'TENANT_HOST_INVALID',
  'TENANT_NOT_FOUND',
  'TENANT_RUNTIME_DISABLED',
  'TENANT_RUNTIME_NOT_READY',
  'TENANT_SLUG_MISMATCH',
])

function isStartupNetworkFailure(error: unknown) {
  return (
    isNetworkOrTimeoutError(error) ||
    (error instanceof TenantClientError && error.statusCode === 0)
  )
}

function isAuthoritativeTenantFailure(error: unknown) {
  if (!(error instanceof TenantClientError)) {
    return false
  }

  if (error.code && authoritativeTenantFailureCodes.has(error.code)) {
    return true
  }

  return (
    error.statusCode === 400 ||
    error.statusCode === 403 ||
    error.statusCode === 404
  )
}

function isTenantStartupUnavailable(error: unknown) {
  return (
    isStartupNetworkFailure(error) ||
    (error instanceof TenantClientError &&
      !isAuthoritativeTenantFailure(error) &&
      (error.statusCode === 408 ||
        error.statusCode === 429 ||
        error.statusCode >= 500))
  )
}
```

Inside `TenantProvider`, replace the existing `let isMounted = true` effect
pattern with explicit cached state, refs and cleanup:

```ts
const isMountedRef = useRef(false)
const startupAttemptRef = useRef(0)
const statusRef = useRef<TenantIdentityStatus>('loading')
const deadlineTimersRef = useRef<number[]>([])
const requestTimeoutRef = useRef<{ cancel: () => void } | null>(null)

const [tenant, setTenant] = useState<PublicTenantContext | null>(null)
const [status, setStatus] = useState<TenantIdentityStatus>('loading')
const [errorMessage, setErrorMessage] = useState<string | null>(null)
const [isUsingCachedData, setIsUsingCachedData] = useState(false)

const setTenantStatus = useCallback((nextStatus: TenantIdentityStatus) => {
  statusRef.current = nextStatus
  setStatus(nextStatus)
}, [])

const clearDeadlineTimers = useCallback(() => {
  for (const timerId of deadlineTimersRef.current) {
    window.clearTimeout(timerId)
  }

  deadlineTimersRef.current = []
}, [])

const cancelStartupRequest = useCallback(() => {
  requestTimeoutRef.current?.cancel()
  requestTimeoutRef.current = null
}, [])
```

Replace the current `loadTenant` function with this retryable startup function;
do not keep the old one-shot `getPublicTenantContext()` effect. This starts the
online request and IndexedDB read together, clears stale timers before state
transitions, maps storage-unavailable errors to controlled online-required
copy, normalizes other cache-read failures into the same controlled path, and
preserves `ready_cached` / `online_required` when a later timeout settles:

```ts
const startTenantLoad = useCallback(() => {
  const attemptId = startupAttemptRef.current + 1
  startupAttemptRef.current = attemptId
  clearDeadlineTimers()
  cancelStartupRequest()

  const host = window.location.host
  const requestTimeout = createRequestTimeout()
  requestTimeoutRef.current = requestTimeout
  const cachedTenantPromise = offlineStore
    .readTenantContext(host)
    .catch((error: unknown) => {
      if (isOfflineStorageUnavailableError(error)) {
        return 'storage_unavailable' as const
      }

      return 'cache_read_failed' as const
    })
  const onlineTenantPromise = getPublicTenantContext({
    signal: requestTimeout.signal,
  })

  setTenant(null)
  setIsUsingCachedData(false)
  setErrorMessage(null)
  setTenantStatus('loading')

  const isCurrentAttempt = () =>
    isMountedRef.current && startupAttemptRef.current === attemptId

  const showStorageUnavailable = () => {
    if (!isCurrentAttempt()) {
      return
    }

    clearDeadlineTimers()
    setTenant(null)
    setIsUsingCachedData(false)
    setErrorMessage('Сохраненные данные недоступны. Нужно подключение.')
    setTenantStatus('online_required')
  }

  const openCachedTenant = (
    cachedTenant: Awaited<typeof cachedTenantPromise>,
  ) => {
    if (
      statusRef.current !== 'loading' &&
      statusRef.current !== 'slow_connection'
    ) {
      return false
    }

    if (
      cachedTenant === 'storage_unavailable' ||
      cachedTenant === 'cache_read_failed'
    ) {
      showStorageUnavailable()
      return false
    }

    if (!cachedTenant || !isCurrentAttempt()) {
      return false
    }

    clearDeadlineTimers()
    applyTenantDocumentMetadata(cachedTenant.tenant)
    setTenant(cachedTenant.tenant)
    setIsUsingCachedData(true)
    setErrorMessage(null)
    setTenantStatus('ready_cached')
    return true
  }

  const showOnlineRequired = () => {
    if (!isCurrentAttempt()) {
      return
    }

    clearDeadlineTimers()
    setTenant(null)
    setIsUsingCachedData(false)
    setErrorMessage(
      'Для первого входа и проверки доступа требуется соединение.',
    )
    setTenantStatus('online_required')
  }

  deadlineTimersRef.current.push(
    window.setTimeout(() => {
      if (isCurrentAttempt() && statusRef.current === 'loading') {
        setTenantStatus('slow_connection')
      }
    }, BOOT_SLOW_NOTICE_MS),
    window.setTimeout(() => {
      void cachedTenantPromise.then(openCachedTenant)
    }, BOOT_CACHE_FALLBACK_MS),
    window.setTimeout(() => {
      void cachedTenantPromise.then((cachedTenant) => {
        if (
          cachedTenant === 'storage_unavailable' ||
          cachedTenant === 'cache_read_failed'
        ) {
          showStorageUnavailable()
          return
        }

        if (!cachedTenant) {
          showOnlineRequired()
        }
      })
    }, BOOT_ONLINE_REQUIRED_MS),
  )

  void onlineTenantPromise
    .then(async (publicTenant) => {
      await offlineStore.saveTenantContext({
        host,
        savedAt: new Date().toISOString(),
        tenant: publicTenant,
      })

      if (!isCurrentAttempt()) {
        return
      }

      clearDeadlineTimers()
      cancelStartupRequest()
      applyTenantDocumentMetadata(publicTenant)
      setTenant(publicTenant)
      setIsUsingCachedData(false)
      setErrorMessage(null)
      setTenantStatus('ready')
    })
    .catch(async (error: unknown) => {
      if (!isCurrentAttempt()) {
        return
      }

      if (isAuthoritativeTenantFailure(error)) {
        await offlineStore.deleteTenantContext(host)

        if (isCurrentAttempt()) {
          cancelStartupRequest()
          showOnlineRequired()
        }

        return
      }

      if (isTenantStartupUnavailable(error)) {
        const cachedTenant = await cachedTenantPromise

        if (!isCurrentAttempt()) {
          return
        }

        if (
          statusRef.current === 'ready_cached' ||
          statusRef.current === 'online_required'
        ) {
          return
        }

        if (openCachedTenant(cachedTenant)) {
          return
        }

        showOnlineRequired()
        return
      }

      clearDeadlineTimers()
      cancelStartupRequest()
      setTenant(null)
      setIsUsingCachedData(false)
      setErrorMessage(
        error instanceof TenantClientError
          ? error.message
          : 'Мы не смогли загрузить данные личного кабинета.',
      )
      setTenantStatus('error')
    })
}, [cancelStartupRequest, clearDeadlineTimers, setTenantStatus])
```

Use the retryable function from the effect and cleanup all timers on unmount:

```ts
useEffect(() => {
  isMountedRef.current = true
  startTenantLoad()

  return () => {
    isMountedRef.current = false
    clearDeadlineTimers()
    cancelStartupRequest()
  }
}, [cancelStartupRequest, clearDeadlineTimers, startTenantLoad])
```

Update context value:

```ts
const value = useMemo<TenantIdentityContextValue>(
  () => ({
    errorMessage,
    isUsingCachedData,
    status,
    tenant,
  }),
  [errorMessage, isUsingCachedData, status, tenant],
)
```

- [ ] **Step 4: Render anti-hang states explicitly**

In `TenantSplashScreen.tsx`, update the default title to match the startup copy:

```tsx
function TenantSplashContent({
  description = 'Загружаем настройки.',
  title = 'Открываем кабинет.',
}: Pick<TenantSplashScreenProps, 'description' | 'title'>) {
```

In `TenantProvider.tsx`, replace the current `status === 'loading'` render
branch with explicit controlled states:

```tsx
const shouldRenderChildren =
  status === 'ready' || status === 'ready_cached' || status === 'error'

return (
  <TenantIdentityContext.Provider value={value}>
    {status === 'loading' ? <TenantSplashScreen /> : null}
    {status === 'slow_connection' ? (
      <TenantSplashScreen
        description="Связь отвечает медленно. Проверяем сохраненные данные."
        title="Открываем кабинет."
      />
    ) : null}
    {status === 'online_required' ? (
      <TenantOnlineRequiredState
        description={errorMessage ?? undefined}
        onRetry={startTenantLoad}
      />
    ) : null}
    {shouldRenderChildren ? children : null}
  </TenantIdentityContext.Provider>
)
```

- [ ] **Step 5: Run tenant tests**

```bash
pnpm --dir frontend test -- src/features/tenant/lib/TenantProvider.test.tsx --run
pnpm --dir frontend typecheck
```

Expected: PASS.

Additional acceptance for this slice:

- tenant startup always leaves splash through ready, cached, online-required or
  error UI;
- storage-unavailable tenant fallback shows user-facing copy, not a raw browser
  error;
- any boot diagnostics added in this slice use category-level values such as
  `ready_online`, `ready_cached`, `online_required` or
  `storage_unavailable`, without tenant secrets or cached payloads.
