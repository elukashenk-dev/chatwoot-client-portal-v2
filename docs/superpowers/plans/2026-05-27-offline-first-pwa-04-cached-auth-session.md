# Offline-first PWA Slice 04: Cached Auth Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow protected shell startup from cached auth only within `offlineAccessUntil`, reject suspicious local clock rollback and provide scoped local-device removal.

**Architecture:** The backend remains session authority. Browser cached auth is a bounded UX fallback, blocked by local signout markers, suspicious device time and scoped logout/device-removal flows. Auth startup uses the same bounded boot deadlines and request-timeout primitives as tenant startup.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

**Part Of:** [Offline-first PWA Implementation Plan](./2026-05-27-offline-first-pwa-implementation.md)

**Slice:** 04 of 9

**Depends On:** Slices 01-03.

**Unlocks:** Slice 05 cached chat read model, Slice 06 outbox core and Slice 07 composer queue UI, because all require a trusted portal user scope.

---

## Task 5: Auth Cached Session And Local Device Signout

**Goal:** Auth provider opens cached protected shell only within
`offlineAccessUntil`, saves online snapshots, clears scoped local data on logout,
and blocks cached reopen after local device data removal.

**Files:**

- Modify: `frontend/src/features/auth/types.ts`
- Modify: `frontend/src/features/auth/api/authClient.ts`
- Modify: `frontend/src/features/auth/api/authClient.test.ts`
- Modify: `frontend/src/features/auth/lib/authSessionContext.ts`
- Modify: `frontend/src/features/auth/lib/AuthSessionProvider.tsx`
- Modify: `frontend/src/app/layouts/ProtectedRoute.tsx`
- Modify: `frontend/src/features/offline/offlineStore.ts`
- Modify: `frontend/src/features/offline/offlineStore.test.ts`
- Modify: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.media.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.search-context-regression.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.search.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx`
- Create: `frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx`
- Create: `frontend/src/features/offline/LocalDeviceDataRemoval.tsx`
- Create: `frontend/src/features/offline/LocalDeviceDataRemoval.test.tsx`

- [ ] **Step 1: Add auth session response types**

In `frontend/src/features/auth/types.ts`, add explicit public session metadata
from Slice 01. Do not add token/cookie material to these types:

```ts
export type AuthenticatedSession = {
  expiresAt: string
}

export type AuthenticatedPortalSession = {
  session: AuthenticatedSession
  user: AuthenticatedPortalUser
}
```

- [ ] **Step 2: Update auth client response parsing without losing `signal`**

In `frontend/src/features/auth/api/authClient.ts`, keep the `AuthRequestOptions`
and `signal` forwarding from Slice 03. Replace the auth response shape with the
session envelope from Slice 01:

```ts
import type {
  AuthenticatedPortalSession,
  AuthenticatedPortalUser,
  LoginFormValues,
  PasswordResetRequestFormValues,
  RegisterRequestFormValues,
} from '../types'

type AuthRequestOptions = {
  signal?: AbortSignal
}

type AuthUserResponse = AuthenticatedPortalSession

async function request<TResponse>(
  path: string,
  init: RequestInit & AuthRequestOptions,
): Promise<TResponse> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
    })
  } catch {
    throw new ApiClientError({
      message: NETWORK_ERROR_MESSAGE,
      statusCode: 0,
    })
  }

  if (response.status === 204) {
    return undefined as TResponse
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new ApiClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? NETWORK_ERROR_MESSAGE,
      statusCode: response.status,
    })
  }

  return payload as TResponse
}

export async function getCurrentSession({ signal }: AuthRequestOptions = {}) {
  try {
    return await request<AuthUserResponse>('/auth/me', {
      method: 'GET',
      signal,
    })
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 401) {
      return null
    }

    throw error
  }
}

export async function getCurrentUser(options: AuthRequestOptions = {}) {
  return (await getCurrentSession(options))?.user ?? null
}

export async function login(credentials: LoginFormValues) {
  return request<AuthUserResponse>('/auth/login', {
    body: JSON.stringify(credentials),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}
```

- [ ] **Step 3: Add auth-only offline invalidation helper**

In `frontend/src/features/offline/offlineStore.ts`, add a helper for backend
session rejection. This helper must not call `clearCurrentUserOfflineData(...)`
because `401` must not delete unsent outbox records:

```ts
export async function clearRejectedAuthSnapshot({
  host,
  tenantSlug,
  userId,
}: OfflineUserScope) {
  const database = await openOfflineDatabase()
  const userPrefix = `${tenantSlug}:${userId}`

  try {
    const transaction = database.transaction(
      ['last_active_identities', 'auth_snapshots'],
      'readwrite',
    )
    const lastActiveStore = transaction.objectStore('last_active_identities')
    const record = await lastActiveStore.get(host)

    await transaction.objectStore('auth_snapshots').delete(userPrefix)

    if (record?.tenantSlug === tenantSlug && record.userId === userId) {
      await lastActiveStore.delete(host)
    }

    await transaction.done
  } finally {
    database.close()
  }
}
```

Add the focused regression to `offlineStore.test.ts`:

```ts
it('clears rejected auth cache without removing unsent outbox', async () => {
  await offlineStore.saveLastActiveIdentity({
    host: 'lk.buhfirma.ru',
    savedAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    userId: 7,
  })
  await offlineStore.saveAuthSnapshot({
    lastVerifiedAt: '2026-05-27T10:00:00.000Z',
    offlineAccessUntil: '2026-05-28T10:00:00.000Z',
    savedAt: '2026-05-27T10:00:00.000Z',
    sessionExpiresAt: '2026-06-10T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    user: {
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
    },
    userId: 7,
  })
  await putRawRecord(
    'chat_text_outbox',
    'buhfirma:7:private:me:portal-send:keep',
    createQueuedOutboxRecord({
      clientMessageKey: 'portal-send:keep',
    }),
  )

  await clearRejectedAuthSnapshot({
    host: 'lk.buhfirma.ru',
    tenantSlug: 'buhfirma',
    userId: 7,
  })

  await expect(offlineStore.readAuthSnapshot('buhfirma', 7)).resolves.toBeNull()
  await expect(
    offlineStore.readLastActiveIdentity('lk.buhfirma.ru'),
  ).resolves.toBeNull()
  await expect(
    readRawRecord('chat_text_outbox', 'buhfirma:7:private:me:portal-send:keep'),
  ).resolves.toMatchObject({
    status: 'queued',
  })
})
```

- [ ] **Step 4: Extend auth context**

In `frontend/src/features/auth/lib/authSessionContext.ts`, extend the context
with source and local-removal controls. `signIn` still returns the user so
existing form code does not need to understand the session envelope:

```ts
export type AuthSessionSource = 'cached' | 'online'

export type AuthSessionStatus =
  | 'authenticated'
  | 'checking'
  | 'error'
  | 'session_check_required'
  | 'unauthenticated'

export type AuthSessionContextValue = {
  errorMessage: string | null
  localDeviceDataRemovalAvailable: boolean
  removeLocalDeviceData: () => Promise<void>
  refreshSession: () => Promise<void>
  sessionSource: AuthSessionSource | null
  signIn: (credentials: LoginFormValues) => Promise<AuthenticatedPortalUser>
  signOut: () => Promise<void>
  status: AuthSessionStatus
  user: AuthenticatedPortalUser | null
}
```

- [ ] **Step 5: Update existing auth success fixtures**

Because `/api/auth/me` and `/api/auth/login` now return `{ session, user }`,
update existing successful auth mock responses before adding new tests. In each
chat test file listed in **Files** that defines `createAuthenticatedUserResponse`,
replace the helper body with this exact shape:

```ts
function createAuthenticatedUserResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'user@example.com',
      fullName: 'Portal User',
      id: 42,
    },
  })
}
```

For each existing helper, preserve that file's current `user` object exactly and
insert the `session.expiresAt` field next to it. The required response contract
is always the same envelope:

```ts
return createJsonResponse({
  session: {
    expiresAt: '2026-06-10T10:00:00.000Z',
  },
  user: existingUserObject,
})
```

In `frontend/src/features/auth/pages/LoginPage.test.tsx`, add this helper near
`createJsonResponse`:

```ts
function createAuthenticatedSessionResponse() {
  return createJsonResponse(
    {
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email: 'user@example.com',
        fullName: 'Portal User',
        id: 42,
      },
    },
    200,
  )
}
```

Replace successful `/api/auth/login` and `/api/auth/me` mock responses in
`LoginPage.test.tsx` with `createAuthenticatedSessionResponse()`. Do not change
`401` mocks.

Update the `frontend/src/features/auth/api/authClient.test.ts` fixture created
in Slice 03 so the successful `/api/auth/me` mock also uses the session
envelope:

```ts
jsonResponse({
  session: {
    expiresAt: '2026-06-10T10:00:00.000Z',
  },
  user: {
    email: 'name@company.ru',
    fullName: 'Portal User',
    id: 7,
  },
})
```

If the test imports `getCurrentSession`, also assert that it preserves the
public session expiry:

```ts
await expect(getCurrentSession({ signal })).resolves.toMatchObject({
  session: {
    expiresAt: '2026-06-10T10:00:00.000Z',
  },
  user: {
    id: 7,
  },
})
```

- [ ] **Step 6: Write cached auth provider tests**

Create `frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx`.
These tests avoid `<App />` because `App` owns `BrowserRouter`; they provide a
tenant context directly and exercise `AuthSessionProvider` plus `ProtectedRoute`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { ProtectedRoute } from '../../../app/layouts/ProtectedRoute'
import {
  BOOT_CACHE_FALLBACK_MS,
  BOOT_ONLINE_REQUIRED_MS,
  BOOT_REQUEST_TIMEOUT_MS,
} from '../../offline/bootCoordinator'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import {
  offlineStore,
  removeLocalDeviceDataAndBlockCachedOpen,
} from '../../offline/offlineStore'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import { useAuthSession } from './authSessionContext'
import { AuthSessionProvider } from './AuthSessionProvider'

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

function createSessionResponse({
  email = 'name@company.ru',
}: {
  email?: string
} = {}) {
  return new Response(
    JSON.stringify({
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email,
        fullName: 'Portal User',
        id: 7,
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 200,
    },
  )
}

function createUnauthorizedResponse() {
  return new Response(
    JSON.stringify({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Требуется вход.',
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 401,
    },
  )
}

async function advanceBootTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
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

function useBootFakeTimers() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-27T10:00:00.000Z'))
}

async function saveTenantAndCachedAuth({
  offlineAccessUntil = '2026-05-28T10:00:00.000Z',
}: {
  offlineAccessUntil?: string
} = {}) {
  await offlineStore.saveTenantContext({
    host: window.location.host,
    savedAt: '2026-05-27T09:55:00.000Z',
    tenant: tenantContextValue.tenant,
  })
  await offlineStore.saveLastActiveIdentity({
    host: window.location.host,
    savedAt: '2026-05-27T09:55:00.000Z',
    tenantSlug: 'buhfirma',
    userId: 7,
  })
  await offlineStore.saveAuthSnapshot({
    lastVerifiedAt: '2026-05-27T09:55:00.000Z',
    offlineAccessUntil,
    savedAt: '2026-05-27T09:55:00.000Z',
    sessionExpiresAt: '2026-06-10T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    user: {
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
    },
    userId: 7,
  })
}

function AuthProbe() {
  const {
    localDeviceDataRemovalAvailable,
    removeLocalDeviceData,
    sessionSource,
    status,
    user,
  } = useAuthSession()

  return (
    <div>
      <span>{status}</span>
      <span>{sessionSource ?? 'no source'}</span>
      <span>{user?.email ?? 'no user'}</span>
      <span>
        {localDeviceDataRemovalAvailable
          ? 'can remove local data'
          : 'no local data scope'}
      </span>
      <button onClick={() => void removeLocalDeviceData()} type="button">
        Remove local data
      </button>
    </div>
  )
}

function renderAuthProbe() {
  render(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>
    </TenantIdentityContext.Provider>,
  )
}

function renderProtectedRoute() {
  render(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <MemoryRouter initialEntries={['/app/chat']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/app/chat" element={<div>Protected chat</div>} />
            </Route>
            <Route
              path={routePaths.auth.login}
              element={<div>Login route</div>}
            />
          </Routes>
        </MemoryRouter>
      </AuthSessionProvider>
    </TenantIdentityContext.Provider>,
  )
}

describe('AuthSessionProvider offline startup', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock)
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('opens protected auth from cached snapshot when /auth/me is slow', async () => {
    await saveTenantAndCachedAuth()
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderAuthProbe()

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

    expect(screen.getByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('cached')).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()

    await advanceBootTimers(BOOT_REQUEST_TIMEOUT_MS - BOOT_CACHE_FALLBACK_MS)

    expect(screen.getByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('cached')).toBeInTheDocument()
  })

  it('does not let delayed cached auth fallback overwrite a fresh online session', async () => {
    await saveTenantAndCachedAuth()
    useBootFakeTimers()
    const signoutRead =
      createDeferred<
        Awaited<ReturnType<typeof offlineStore.readLocalDeviceSignout>>
      >()
    const onlineSession = createDeferred<Response>()

    vi.spyOn(offlineStore, 'readLocalDeviceSignout').mockReturnValueOnce(
      signoutRead.promise,
    )
    fetchMock.mockReturnValueOnce(onlineSession.promise)

    renderAuthProbe()

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

    await act(async () => {
      onlineSession.resolve(
        createSessionResponse({ email: 'online@company.ru' }),
      )
    })

    await vi.waitFor(() => {
      expect(screen.getByText('online')).toBeInTheDocument()
    })

    await act(async () => {
      signoutRead.resolve(null)
    })

    expect(screen.getByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('online')).toBeInTheDocument()
    expect(screen.getByText('online@company.ru')).toBeInTheDocument()
    expect(screen.queryByText('cached')).not.toBeInTheDocument()
  })

  it('requires online session check when cached auth scope does not match tenant', async () => {
    await saveTenantAndCachedAuth()
    await offlineStore.saveLastActiveIdentity({
      host: window.location.host,
      savedAt: '2026-05-27T09:56:00.000Z',
      tenantSlug: 'other-tenant',
      userId: 7,
    })
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('requires online session check when offlineAccessUntil is expired', async () => {
    await saveTenantAndCachedAuth({
      offlineAccessUntil: '2026-05-26T10:00:00.000Z',
    })
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Удалить сохраненные данные с этого устройства',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('requires online session check when the device clock is rolled back', async () => {
    await saveTenantAndCachedAuth()
    useBootFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T09:40:00.000Z'))
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('requires online session check when cached auth storage read fails', async () => {
    await saveTenantAndCachedAuth()
    vi.spyOn(offlineStore, 'readAuthSnapshot').mockRejectedValueOnce(
      new Error('auth cache read failed'),
    )
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('blocks cached protected shell when local device signout marker exists', async () => {
    await saveTenantAndCachedAuth()
    await offlineStore.saveLocalDeviceSignout({
      createdAt: '2026-05-27T10:00:00.000Z',
      host: window.location.host,
      tenantSlug: 'buhfirma',
      userId: 7,
    })
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('completes pending local device signout online instead of reopening the session', async () => {
    await saveTenantAndCachedAuth()
    await offlineStore.saveLocalDeviceSignout({
      createdAt: '2026-05-27T10:00:00.000Z',
      host: window.location.host,
      tenantSlug: 'buhfirma',
      userId: 7,
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createSessionResponse()
      }

      if (url === '/api/auth/logout') {
        return new Response(null, { status: 204 })
      }

      return new Response(null, { status: 404 })
    })

    renderProtectedRoute()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    await expect(
      offlineStore.readLocalDeviceSignout(window.location.host, 'buhfirma', 7),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
  })

  it('does not logout current online session for a stale local signout scope', async () => {
    await saveTenantAndCachedAuth()
    await offlineStore.saveLocalDeviceSignout({
      createdAt: '2026-05-27T10:00:00.000Z',
      host: window.location.host,
      tenantSlug: 'buhfirma',
      userId: 99,
    })
    fetchMock.mockResolvedValueOnce(createSessionResponse())

    renderProtectedRoute()

    expect(await screen.findByText('Protected chat')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.anything(),
    )
  })

  it('removes scoped local data even when the current user is null', async () => {
    await saveTenantAndCachedAuth({
      offlineAccessUntil: '2026-05-26T10:00:00.000Z',
    })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderAuthProbe()

    expect(
      await screen.findByText('session_check_required'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove local data' }))

    await waitFor(async () => {
      await expect(
        offlineStore.readLocalDeviceSignout(
          window.location.host,
          'buhfirma',
          7,
        ),
      ).resolves.toMatchObject({
        tenantSlug: 'buhfirma',
        userId: 7,
      })
    })
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
  })

  it('clears rejected auth snapshot on 401 and routes to login', async () => {
    await saveTenantAndCachedAuth()
    fetchMock.mockResolvedValueOnce(createUnauthorizedResponse())

    renderProtectedRoute()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readLastActiveIdentity(window.location.host),
    ).resolves.toBeNull()
  })

  it('routes to login on 401 even when offline cleanup fails', async () => {
    vi.spyOn(offlineStore, 'readLocalDeviceSignout').mockRejectedValueOnce(
      new Error('IndexedDB read failed'),
    )
    fetchMock.mockResolvedValueOnce(createUnauthorizedResponse())

    renderProtectedRoute()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
  })

  it('clears pending local device signout when online session is already unauthenticated', async () => {
    await saveTenantAndCachedAuth()
    await removeLocalDeviceDataAndBlockCachedOpen({
      host: window.location.host,
      tenantSlug: 'buhfirma',
      userId: 7,
    })
    fetchMock.mockResolvedValueOnce(createUnauthorizedResponse())

    renderProtectedRoute()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
    await expect(
      offlineStore.readLocalDeviceSignout(window.location.host, 'buhfirma', 7),
    ).resolves.toBeNull()
  })

  it('keeps online auth when offline snapshot persistence fails', async () => {
    vi.spyOn(offlineStore, 'saveAuthSnapshot').mockRejectedValueOnce(
      new Error('IndexedDB write failed'),
    )
    fetchMock.mockResolvedValueOnce(createSessionResponse())

    renderAuthProbe()

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('online')).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
  })

  it('saves online session snapshot and stays online-authenticated', async () => {
    fetchMock.mockResolvedValueOnce(createSessionResponse())

    renderAuthProbe()

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('online')).toBeInTheDocument()
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toMatchObject({
      sessionExpiresAt: '2026-06-10T10:00:00.000Z',
      user: {
        id: 7,
      },
    })
  })
})
```

- [ ] **Step 7: Implement cached auth startup in provider**

In `frontend/src/features/auth/lib/AuthSessionProvider.tsx`, replace the
one-shot `resolveCurrentSession()` bootstrap with the bounded startup flow
below. It preserves Slice 03 request timeout behavior and never treats cached
auth as backend authority:

```ts
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  BOOT_CACHE_FALLBACK_MS,
  BOOT_ONLINE_REQUIRED_MS,
  createRequestTimeout,
  isNetworkOrTimeoutError,
} from '../../offline/bootCoordinator'
import {
  clearCurrentUserOfflineData,
  clearRejectedAuthSnapshot,
  offlineStore,
  removeLocalDeviceDataAndBlockCachedOpen,
} from '../../offline/offlineStore'
import {
  OFFLINE_AUTH_GRACE_MS,
  type OfflineAuthSnapshotRecord,
} from '../../offline/types'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import {
  ApiClientError,
  getCurrentSession,
  login,
  logout,
} from '../api/authClient'
import type {
  AuthenticatedPortalSession,
  AuthenticatedPortalUser,
  LoginFormValues,
} from '../types'
import { getAuthRequestErrorMessage } from './authErrors'
import {
  AuthSessionContext,
  type AuthSessionContextValue,
  type AuthSessionSource,
  type AuthSessionStatus,
} from './authSessionContext'
```

Add local scope and helper types:

```ts
type OfflineAuthScope = {
  host: string
  tenantSlug: string
  userId: number
}

const OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000

function calculateOfflineAccessUntil({
  now,
  sessionExpiresAt,
}: {
  now: Date
  sessionExpiresAt: string
}) {
  return new Date(
    Math.min(
      new Date(sessionExpiresAt).getTime(),
      now.getTime() + OFFLINE_AUTH_GRACE_MS,
    ),
  ).toISOString()
}

function isDeviceClockTrustedForSnapshot(
  snapshot: Pick<OfflineAuthSnapshotRecord, 'lastVerifiedAt' | 'savedAt'>,
  nowMs = Date.now(),
) {
  const lastVerifiedAtMs = new Date(snapshot.lastVerifiedAt).getTime()
  const savedAtMs = new Date(snapshot.savedAt).getTime()

  return (
    lastVerifiedAtMs <= nowMs + OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS &&
    savedAtMs <= nowMs + OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS
  )
}

function isStartupNetworkFailure(error: unknown) {
  return (
    isNetworkOrTimeoutError(error) ||
    (error instanceof ApiClientError && error.statusCode === 0)
  )
}

async function completePendingLocalDeviceSignout(scope: OfflineAuthScope) {
  try {
    await logout()
    await clearCurrentUserOfflineData(scope)
    await offlineStore.deleteLocalDeviceSignout(scope.host)
    return true
  } catch {
    return false
  }
}
```

Add provider state, refs and cleanup:

```ts
const { tenant } = useTenantIdentity()
const isMountedRef = useRef(false)
const startupAttemptRef = useRef(0)
const statusRef = useRef<AuthSessionStatus>('checking')
const deadlineTimersRef = useRef<number[]>([])
const requestTimeoutRef = useRef<{ cancel: () => void } | null>(null)

const [status, setStatus] = useState<AuthSessionStatus>('checking')
const [user, setUser] = useState<AuthenticatedPortalUser | null>(null)
const [errorMessage, setErrorMessage] = useState<string | null>(null)
const [sessionSource, setSessionSource] = useState<AuthSessionSource | null>(
  null,
)
const [offlineRemovalScope, setOfflineRemovalScope] =
  useState<OfflineAuthScope | null>(null)

const setAuthStatus = useCallback((nextStatus: AuthSessionStatus) => {
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

Add snapshot save and session-check helpers:

```ts
const saveOnlineSessionSnapshot = useCallback(
  async (currentSession: AuthenticatedPortalSession) => {
    if (!tenant) {
      return null
    }

    const now = new Date()
    const sessionExpiresAt = currentSession.session.expiresAt
    const offlineAccessUntil = calculateOfflineAccessUntil({
      now,
      sessionExpiresAt,
    })
    const scope = {
      host: window.location.host,
      tenantSlug: tenant.slug,
      userId: currentSession.user.id,
    }

    try {
      await offlineStore.saveLastActiveIdentity({
        ...scope,
        savedAt: now.toISOString(),
      })
      await offlineStore.saveAuthSnapshot({
        lastVerifiedAt: now.toISOString(),
        offlineAccessUntil,
        savedAt: now.toISOString(),
        sessionExpiresAt,
        tenantSlug: tenant.slug,
        user: currentSession.user,
        userId: currentSession.user.id,
      })
      await offlineStore.deleteLocalDeviceSignout(scope.host)
    } catch {
      // Online auth remains valid even when local offline persistence is unavailable.
    }

    return scope
  },
  [tenant],
)

const requireOnlineSessionCheck = useCallback(
  (scope: OfflineAuthScope | null) => {
    setUser(null)
    setSessionSource(null)
    setOfflineRemovalScope(scope)
    setErrorMessage('Подключитесь к интернету, чтобы продолжить.')
    setAuthStatus('session_check_required')
  },
  [setAuthStatus],
)
```

Add the cached-open helper. It reads both the last-active identity and the
local-device signout marker so local removal blocks cached reopen even if
`auth_snapshots` still exists:

```ts
const openCachedSession = useCallback(
  async ({
    host,
    isCurrentAttempt,
  }: {
    host: string
    isCurrentAttempt: () => boolean
  }) => {
    let lastKnownScope: OfflineAuthScope | null = null
    const canUseCachedFallback = () =>
      isCurrentAttempt() && statusRef.current === 'checking'

    try {
      if (!canUseCachedFallback()) {
        return false
      }

      if (!tenant) {
        requireOnlineSessionCheck(null)
        return false
      }

      const signout = await offlineStore.readLocalDeviceSignout(host)

      if (!canUseCachedFallback()) {
        return false
      }

      if (signout) {
        lastKnownScope = {
          host,
          tenantSlug: signout.tenantSlug,
          userId: signout.userId,
        }
        requireOnlineSessionCheck(lastKnownScope)
        return false
      }

      const identity = await offlineStore.readLastActiveIdentity(host)

      if (!canUseCachedFallback()) {
        return false
      }

      if (!identity || identity.tenantSlug !== tenant.slug) {
        requireOnlineSessionCheck(null)
        return false
      }

      const scope = {
        host,
        tenantSlug: identity.tenantSlug,
        userId: identity.userId,
      }
      lastKnownScope = scope
      const scopedSignout = await offlineStore.readLocalDeviceSignout(
        host,
        identity.tenantSlug,
        identity.userId,
      )

      if (!canUseCachedFallback()) {
        return false
      }

      if (scopedSignout) {
        requireOnlineSessionCheck(scope)
        return false
      }

      const snapshot = await offlineStore.readAuthSnapshot(
        identity.tenantSlug,
        identity.userId,
      )

      if (!canUseCachedFallback()) {
        return false
      }

      if (
        !snapshot ||
        !isDeviceClockTrustedForSnapshot(snapshot) ||
        new Date(snapshot.offlineAccessUntil).getTime() <= Date.now()
      ) {
        requireOnlineSessionCheck(scope)
        return false
      }

      clearDeadlineTimers()
      setUser(snapshot.user)
      setSessionSource('cached')
      setOfflineRemovalScope(scope)
      setErrorMessage(null)
      setAuthStatus('authenticated')
      return true
    } catch {
      if (canUseCachedFallback()) {
        requireOnlineSessionCheck(lastKnownScope)
      }

      return false
    }
  },
  [clearDeadlineTimers, requireOnlineSessionCheck, setAuthStatus, tenant],
)
```

Add the retryable startup flow:

```ts
const resolveCurrentSession = useCallback(() => {
  const attemptId = startupAttemptRef.current + 1
  startupAttemptRef.current = attemptId
  clearDeadlineTimers()
  cancelStartupRequest()

  const host = window.location.host
  const requestTimeout = createRequestTimeout()
  requestTimeoutRef.current = requestTimeout
  const currentSessionPromise = getCurrentSession({
    signal: requestTimeout.signal,
  })
  const isCurrentAttempt = () =>
    isMountedRef.current && startupAttemptRef.current === attemptId

  setAuthStatus('checking')
  setErrorMessage(null)

  deadlineTimersRef.current.push(
    window.setTimeout(() => {
      void openCachedSession({ host, isCurrentAttempt })
    }, BOOT_CACHE_FALLBACK_MS),
    window.setTimeout(() => {
      if (isCurrentAttempt() && statusRef.current === 'checking') {
        void openCachedSession({ host, isCurrentAttempt })
      }
    }, BOOT_ONLINE_REQUIRED_MS),
  )

  void currentSessionPromise
    .then(async (currentSession) => {
      if (!isCurrentAttempt()) {
        return
      }

      if (!currentSession) {
        let identity: Awaited<
          ReturnType<typeof offlineStore.readLastActiveIdentity>
        > = null
        let signoutScope: OfflineAuthScope | null = null

        try {
          const pendingLocalSignout =
            await offlineStore.readLocalDeviceSignout(host)
          identity = await offlineStore.readLastActiveIdentity(host)
          signoutScope = pendingLocalSignout
            ? {
                host,
                tenantSlug: pendingLocalSignout.tenantSlug,
                userId: pendingLocalSignout.userId,
              }
            : null

          if (signoutScope) {
            await clearCurrentUserOfflineData(signoutScope)
            await offlineStore.deleteLocalDeviceSignout(host)
          } else if (identity) {
            await clearRejectedAuthSnapshot({
              host,
              tenantSlug: identity.tenantSlug,
              userId: identity.userId,
            })
          }
        } catch {
          identity = null
          signoutScope = null
        }

        if (!isCurrentAttempt()) {
          return
        }

        clearDeadlineTimers()
        cancelStartupRequest()
        setUser(null)
        setSessionSource(null)
        setOfflineRemovalScope(
          signoutScope
            ? null
            : identity
              ? {
                  host,
                  tenantSlug: identity.tenantSlug,
                  userId: identity.userId,
                }
              : null,
        )
        setAuthStatus('unauthenticated')
        return
      }

      const pendingLocalSignout =
        await offlineStore.readLocalDeviceSignout(host)

      if (
        pendingLocalSignout &&
        pendingLocalSignout.tenantSlug === tenant?.slug &&
        pendingLocalSignout.userId === currentSession.user.id
      ) {
        const signoutScope = {
          host,
          tenantSlug: pendingLocalSignout.tenantSlug,
          userId: pendingLocalSignout.userId,
        }
        const logoutCompleted =
          await completePendingLocalDeviceSignout(signoutScope)

        if (!isCurrentAttempt()) {
          return
        }

        clearDeadlineTimers()
        cancelStartupRequest()
        setUser(null)
        setSessionSource(null)

        if (logoutCompleted) {
          setOfflineRemovalScope(null)
          setErrorMessage(null)
          setAuthStatus('unauthenticated')
        } else {
          setOfflineRemovalScope(signoutScope)
          setErrorMessage('Не удалось завершить выход. Повторите попытку.')
          setAuthStatus('session_check_required')
        }

        return
      }

      const scope = await saveOnlineSessionSnapshot(currentSession)

      if (!isCurrentAttempt()) {
        return
      }

      clearDeadlineTimers()
      cancelStartupRequest()
      setUser(currentSession.user)
      setSessionSource('online')
      setOfflineRemovalScope(scope)
      setErrorMessage(null)
      setAuthStatus('authenticated')
    })
    .catch(async (error: unknown) => {
      if (!isCurrentAttempt()) {
        return
      }

      if (isStartupNetworkFailure(error)) {
        if (
          statusRef.current === 'authenticated' ||
          statusRef.current === 'session_check_required'
        ) {
          return
        }

        await openCachedSession({ host, isCurrentAttempt })
        return
      }

      clearDeadlineTimers()
      cancelStartupRequest()
      setUser(null)
      setSessionSource(null)
      setErrorMessage(getAuthRequestErrorMessage(error))
      setAuthStatus('error')
    })
}, [
  cancelStartupRequest,
  clearDeadlineTimers,
  openCachedSession,
  requireOnlineSessionCheck,
  saveOnlineSessionSnapshot,
  setAuthStatus,
  tenant,
])
```

Wire the effect and refresh:

```ts
const refreshSession = useCallback(async () => {
  resolveCurrentSession()
}, [resolveCurrentSession])

useEffect(() => {
  isMountedRef.current = true
  resolveCurrentSession()

  return () => {
    isMountedRef.current = false
    clearDeadlineTimers()
    cancelStartupRequest()
  }
}, [cancelStartupRequest, clearDeadlineTimers, resolveCurrentSession])
```

Update sign-in, sign-out and local removal:

```ts
const signIn = useCallback(
  async (credentials: LoginFormValues) => {
    setErrorMessage(null)

    try {
      const authenticatedSession = await login(credentials)
      const scope = await saveOnlineSessionSnapshot(authenticatedSession)

      if (isMountedRef.current) {
        setUser(authenticatedSession.user)
        setSessionSource('online')
        setOfflineRemovalScope(scope)
        setAuthStatus('authenticated')
      }

      return authenticatedSession.user
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(getAuthRequestErrorMessage(error))
      }

      throw error
    }
  },
  [saveOnlineSessionSnapshot, setAuthStatus],
)

const signOut = useCallback(async () => {
  setErrorMessage(null)

  try {
    await logout()

    if (offlineRemovalScope) {
      await clearCurrentUserOfflineData(offlineRemovalScope)
    }

    if (isMountedRef.current) {
      setUser(null)
      setSessionSource(null)
      setOfflineRemovalScope(null)
      setAuthStatus('unauthenticated')
    }
  } catch (error) {
    if (isMountedRef.current) {
      setErrorMessage(getAuthRequestErrorMessage(error))
    }

    throw error
  }
}, [offlineRemovalScope, setAuthStatus])

const removeLocalDeviceData = useCallback(async () => {
  if (!offlineRemovalScope) {
    return
  }

  await removeLocalDeviceDataAndBlockCachedOpen(offlineRemovalScope)

  if (isMountedRef.current) {
    setUser(null)
    setSessionSource(null)
    setOfflineRemovalScope(offlineRemovalScope)
    setAuthStatus('session_check_required')
  }
}, [offlineRemovalScope, setAuthStatus])
```

Update the provider value:

```ts
const value = useMemo<AuthSessionContextValue>(
  () => ({
    errorMessage,
    localDeviceDataRemovalAvailable: offlineRemovalScope !== null,
    removeLocalDeviceData,
    refreshSession,
    sessionSource,
    signIn,
    signOut,
    status,
    user,
  }),
  [
    errorMessage,
    offlineRemovalScope,
    removeLocalDeviceData,
    refreshSession,
    sessionSource,
    signIn,
    signOut,
    status,
    user,
  ],
)
```

- [ ] **Step 8: Implement local device data removal UI**

Create `frontend/src/features/offline/LocalDeviceDataRemoval.tsx`:

```tsx
import { useState } from 'react'

import { PrimaryButton } from '../../shared/ui/PrimaryButton'

export function LocalDeviceDataRemoval({
  disabled,
  onConfirm,
}: {
  disabled?: boolean
  onConfirm: () => Promise<void>
}) {
  const [isConfirming, setIsConfirming] = useState(false)

  if (!isConfirming) {
    return (
      <button
        className="text-sm font-medium text-rose-700 underline-offset-4 hover:underline"
        disabled={disabled}
        onClick={() => setIsConfirming(true)}
        type="button"
      >
        Удалить сохраненные данные с этого устройства
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-[0.8rem] border border-rose-200 bg-rose-50 p-3 text-left">
      <p className="text-sm leading-5 text-rose-800">
        Это удалит сохраненные чаты и неотправленные локальные сообщения для
        текущего пользователя на этом устройстве.
      </p>
      <div className="flex gap-2">
        <PrimaryButton
          onClick={() => {
            void onConfirm()
          }}
          type="button"
        >
          Удалить
        </PrimaryButton>
        <button
          className="text-sm font-medium text-slate-700"
          onClick={() => setIsConfirming(false)}
          type="button"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
```

Create `frontend/src/features/offline/LocalDeviceDataRemoval.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LocalDeviceDataRemoval } from './LocalDeviceDataRemoval'

describe('LocalDeviceDataRemoval', () => {
  it('requires confirmation before removing local device data', () => {
    const onConfirm = vi.fn(async () => undefined)

    render(<LocalDeviceDataRemoval onConfirm={onConfirm} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Удалить сохраненные данные с этого устройства',
      }),
    )

    expect(screen.getByText(/Это удалит сохраненные чаты/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('can cancel confirmation', () => {
    const onConfirm = vi.fn(async () => undefined)

    render(<LocalDeviceDataRemoval onConfirm={onConfirm} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Удалить сохраненные данные с этого устройства',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', {
        name: 'Удалить сохраненные данные с этого устройства',
      }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 9: Render session-check-required and removal actions**

In `frontend/src/app/layouts/ProtectedRoute.tsx`, import and render the local
removal action only when `AuthSessionProvider` has a concrete scope:

```tsx
import { LocalDeviceDataRemoval } from '../../features/offline/LocalDeviceDataRemoval'
```

Add a controlled session-check-required state:

```tsx
function ProtectedSessionCheckRequired({
  canRemoveLocalData,
  onRemoveLocalData,
  onRetry,
}: {
  canRemoveLocalData: boolean
  onRemoveLocalData: () => Promise<void>
  onRetry: () => void
}) {
  return (
    <PortalFrame>
      <section className="mx-auto w-full max-w-md space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Нужно проверить сессию.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Подключитесь к интернету, чтобы продолжить.
          </p>
        </div>

        <PrimaryButton onClick={onRetry} type="button">
          Повторить
        </PrimaryButton>

        {canRemoveLocalData ? (
          <LocalDeviceDataRemoval onConfirm={onRemoveLocalData} />
        ) : null}
      </section>
    </PortalFrame>
  )
}
```

Update `ProtectedRoute` context usage and branching:

```tsx
const {
  errorMessage,
  localDeviceDataRemovalAvailable,
  refreshSession,
  removeLocalDeviceData,
  status,
  user,
} = useAuthSession()

if (status === 'session_check_required') {
  return (
    <ProtectedSessionCheckRequired
      canRemoveLocalData={localDeviceDataRemovalAvailable}
      onRemoveLocalData={removeLocalDeviceData}
      onRetry={() => {
        void refreshSession()
      }}
    />
  )
}
```

Keep the existing login redirect only for `unauthenticated` and missing user:

```tsx
if (status !== 'authenticated' || !user) {
  return (
    <Navigate replace state={{ from: location }} to={routePaths.auth.login} />
  )
}
```

- [ ] **Step 10: Run auth/offline/chat route tests**

```bash
pnpm --dir frontend test -- src/features/offline/offlineStore.test.ts src/features/offline/LocalDeviceDataRemoval.test.tsx src/features/auth/lib/AuthSessionProvider.offline.test.tsx src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx src/features/chat/pages --run
pnpm --dir frontend typecheck
```

Expected: PASS.

Additional acceptance for this slice:

- cached auth opens only when `offlineAccessUntil` is valid and the device clock
  is not rolled back beyond `OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS`;
- blocked, missing or unavailable auth storage maps to
  `session_check_required`, not to a partially authenticated shell;
- failed offline snapshot writes after successful online auth do not block the
  online-authenticated session;
- the rollback guard is a fail-closed UX guard only; backend session authority
  remains unchanged and every later send still goes through backend auth.
