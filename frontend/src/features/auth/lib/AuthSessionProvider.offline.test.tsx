import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProtectedRoute } from '../../../app/layouts/ProtectedRoute'
import { routePaths } from '../../../app/routePaths'
import { BOOT_ONLINE_REQUIRED_MS } from '../../offline/bootCoordinator'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import {
  offlineStore,
  removeLocalDeviceDataAndBlockCachedOpen,
} from '../../offline/offlineStore'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import { AuthSessionProvider } from './AuthSessionProvider'
import { useAuthSession } from './authSessionContext'

const VALID_SESSION_EXPIRES_AT = '2099-06-10T10:00:00.000Z'
const EXPIRED_SESSION_EXPIRES_AT = '2026-05-26T10:00:00.000Z'

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Buhfirma',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

function createSessionResponse({
  email = 'name@company.ru',
  expiresAt = VALID_SESSION_EXPIRES_AT,
}: {
  email?: string
  expiresAt?: string
} = {}) {
  return new Response(
    JSON.stringify({
      session: {
        expiresAt,
      },
      user: {
        email,
        fullName: 'Portal User',
        id: 7,
        passwordConfigured: true,
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

    for (let index = 0; index < 20; index += 1) {
      await vi.advanceTimersByTimeAsync(0)
    }
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
  lastClockSeenAt = '2026-05-27T09:55:00.000Z',
  sessionExpiresAt = VALID_SESSION_EXPIRES_AT,
}: {
  lastClockSeenAt?: string
  sessionExpiresAt?: string
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
    lastClockSeenAt,
    lastVerifiedAt: '2026-05-27T09:55:00.000Z',
    savedAt: '2026-05-27T09:55:00.000Z',
    sessionExpiresAt,
    tenantSlug: 'buhfirma',
    user: {
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
      passwordConfigured: true,
    },
    userId: 7,
  })
}

function saveStartupAuthSnapshot({
  lastClockSeenAt = '2026-05-27T09:55:00.000Z',
  sessionExpiresAt = VALID_SESSION_EXPIRES_AT,
}: {
  lastClockSeenAt?: string
  sessionExpiresAt?: string
} = {}) {
  window.localStorage.setItem(
    `portal.startup.auth:${window.location.host}`,
    JSON.stringify({
      record: {
        host: window.location.host,
        snapshot: {
          lastClockSeenAt,
          lastVerifiedAt: '2026-05-27T09:55:00.000Z',
          savedAt: '2026-05-27T09:55:00.000Z',
          sessionExpiresAt,
          tenantSlug: 'buhfirma',
          user: {
            email: 'name@company.ru',
            fullName: 'Portal User',
            id: 7,
            passwordConfigured: true,
          },
          userId: 7,
        },
        tenantSlug: 'buhfirma',
        userId: 7,
      },
      version: 1,
    }),
  )
}

function AuthProbe() {
  const {
    completeAuthenticatedSession,
    removeLocalDeviceData,
    sessionSource,
    signOut,
    status,
    user,
  } = useAuthSession()

  return (
    <div>
      <span>{status}</span>
      <span>{sessionSource ?? 'no source'}</span>
      <span>{user?.email ?? 'no user'}</span>
      <button
        onClick={() =>
          void completeAuthenticatedSession({
            session: {
              expiresAt: VALID_SESSION_EXPIRES_AT,
            },
            user: {
              email: 'skip@company.ru',
              fullName: null,
              id: 8,
              passwordConfigured: false,
            },
          })
        }
        type="button"
      >
        Complete authenticated session
      </button>
      <button onClick={() => void removeLocalDeviceData()} type="button">
        Remove local data
      </button>
      <button onClick={() => void signOut()} type="button">
        Sign out
      </button>
    </div>
  )
}

function renderAuthProbe() {
  return render(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>
    </TenantIdentityContext.Provider>,
  )
}

function renderProtectedRoute() {
  return render(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <MemoryRouter initialEntries={['/app/chat']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/app/chat" element={<div>Protected chat</div>} />
            </Route>
            <Route
              element={<div>Login route</div>}
              path={routePaths.auth.login}
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
    window.localStorage.clear()
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    window.localStorage.clear()
    fetchMock.mockReset()
  })

  it('opens protected auth from cached snapshot when /auth/me is slow', async () => {
    await saveTenantAndCachedAuth()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderAuthProbe()

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('cached')).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
  })

  it('opens protected auth from cached snapshot without obsolete offline auth window field', async () => {
    await saveTenantAndCachedAuth()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderAuthProbe()

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('cached')).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
  })

  it('opens protected auth on the first render from startup cache', () => {
    saveStartupAuthSnapshot()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    expect(screen.getByText('Protected chat')).toBeInTheDocument()
    expect(screen.queryByText('Login route')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Нужно проверить сессию.'),
    ).not.toBeInTheDocument()
  })

  it('does not open protected auth from an invalid startup session expiry', () => {
    saveStartupAuthSnapshot({
      sessionExpiresAt: 'not-a-date',
    })
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
    expect(screen.queryByText('Login route')).not.toBeInTheDocument()
  })

  it('does not open protected auth from startup cache after backend session expiry', () => {
    saveStartupAuthSnapshot({
      sessionExpiresAt: EXPIRED_SESSION_EXPIRES_AT,
    })
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
    expect(screen.queryByText('Login route')).not.toBeInTheDocument()
  })

  it('does not let delayed cached auth fallback overwrite a fresh online session', async () => {
    await saveTenantAndCachedAuth()
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

    await act(async () => {
      onlineSession.resolve(
        createSessionResponse({ email: 'online@company.ru' }),
      )
    })

    await waitFor(() => {
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

  it('stores refreshed backend session expiry after successful online check', async () => {
    const renewedSessionExpiresAt = '2026-06-09T09:30:00.000Z'

    await saveTenantAndCachedAuth({
      sessionExpiresAt: '2026-05-21T12:00:00.000Z',
    })
    fetchMock.mockResolvedValueOnce(
      createSessionResponse({
        expiresAt: renewedSessionExpiresAt,
      }),
    )

    renderAuthProbe()

    await waitFor(() => {
      expect(screen.getByText('online')).toBeInTheDocument()
    })

    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toMatchObject({
      sessionExpiresAt: renewedSessionExpiresAt,
    })

    const startupAuthSession = JSON.parse(
      window.localStorage.getItem(
        `portal.startup.auth:${window.location.host}`,
      ) ?? 'null',
    ) as { record?: { snapshot?: { sessionExpiresAt?: string } } } | null

    expect(startupAuthSession?.record?.snapshot?.sessionExpiresAt).toBe(
      renewedSessionExpiresAt,
    )
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

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('requires online session check when cached backend session is expired', async () => {
    await saveTenantAndCachedAuth({
      sessionExpiresAt: EXPIRED_SESSION_EXPIRES_AT,
    })
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('requires online session check when the device clock is rolled back', async () => {
    await saveTenantAndCachedAuth()
    useBootFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T09:40:00.000Z'))
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('keeps cached auth blocked after an expired clock observation is rolled back', async () => {
    await saveTenantAndCachedAuth({
      sessionExpiresAt: '2026-05-27T10:30:00.000Z',
    })
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))
    vi.setSystemTime(new Date('2026-05-27T10:35:00.000Z'))

    const expiredRender = renderProtectedRoute()

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()

    expiredRender.unmount()
    vi.setSystemTime(new Date('2026-05-27T10:05:00.000Z'))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('keeps startup auth blocked after an expired clock observation is rolled back', async () => {
    saveStartupAuthSnapshot({
      sessionExpiresAt: '2026-05-27T10:30:00.000Z',
    })
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))
    vi.setSystemTime(new Date('2026-05-27T10:35:00.000Z'))

    const expiredRender = renderProtectedRoute()

    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()

    expiredRender.unmount()
    vi.setSystemTime(new Date('2026-05-27T10:05:00.000Z'))

    renderProtectedRoute()

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

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(screen.getByText('Нужно проверить сессию.')).toBeInTheDocument()
    expect(screen.queryByText('Protected chat')).not.toBeInTheDocument()
  })

  it('requires online session check when cached auth read never settles', async () => {
    vi.spyOn(offlineStore, 'readLocalDeviceSignout').mockReturnValueOnce(
      new Promise(() => {}),
    )
    useBootFakeTimers()
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))

    renderProtectedRoute()

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

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

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

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
      sessionExpiresAt: EXPIRED_SESSION_EXPIRES_AT,
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

  it('blocks cached chat writes after explicit sign out', async () => {
    await saveTenantAndCachedAuth()
    await offlineStore.saveThreadList({
      activeThreadId: 'private:me',
      savedAt: '2026-05-27T09:55:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
          unreadCount: 0,
        },
      ],
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

    renderAuthProbe()

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(await screen.findByText('online')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(screen.getByText('unauthenticated')).toBeInTheDocument()
    })
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
    await expect(offlineStore.readThreadList('buhfirma', 7)).resolves.toBeNull()
    await expect(
      offlineStore.readLocalDeviceSignout(window.location.host, 'buhfirma', 7),
    ).resolves.toMatchObject({
      tenantSlug: 'buhfirma',
      userId: 7,
    })

    await offlineStore.saveThreadList({
      activeThreadId: 'private:me',
      savedAt: '2026-05-27T10:01:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
          unreadCount: 0,
        },
      ],
      userId: 7,
    })

    await expect(offlineStore.readThreadList('buhfirma', 7)).resolves.toBeNull()
  })

  it('clears rejected auth snapshot on 401 and routes to login', async () => {
    await saveTenantAndCachedAuth()
    saveStartupAuthSnapshot()
    window.localStorage.setItem(
      `portal.startup.chat:${window.location.host}:buhfirma:7`,
      'stale chat mirror',
    )
    fetchMock.mockResolvedValueOnce(createUnauthorizedResponse())

    renderProtectedRoute()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
    await expect(
      offlineStore.readAuthSnapshot('buhfirma', 7),
    ).resolves.toBeNull()
    await expect(
      offlineStore.readLastActiveIdentity(window.location.host),
    ).resolves.toBeNull()
    expect(
      window.localStorage.getItem(
        `portal.startup.auth:${window.location.host}`,
      ),
    ).toBeNull()
    expect(
      window.localStorage.getItem(
        `portal.startup.chat:${window.location.host}:buhfirma:7`,
      ),
    ).toBeNull()
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

  it('completes authenticated session from backend handoff and persists snapshot', async () => {
    const startupSession = createDeferred<Response>()
    const startupIdentity =
      createDeferred<Awaited<ReturnType<typeof offlineStore.readLastActiveIdentity>>>()
    vi.spyOn(offlineStore, 'readLastActiveIdentity').mockReturnValueOnce(
      startupIdentity.promise,
    )
    fetchMock.mockReturnValueOnce(startupSession.promise)

    renderAuthProbe()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => {
      startupSession.resolve(createUnauthorizedResponse())
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(offlineStore.readLastActiveIdentity).toHaveBeenCalled(),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Complete authenticated session',
      }),
    )

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('online')).toBeInTheDocument()
    expect(screen.getByText('skip@company.ru')).toBeInTheDocument()

    await waitFor(async () => {
      await expect(offlineStore.readAuthSnapshot('buhfirma', 8)).resolves
        .toMatchObject({
          sessionExpiresAt: VALID_SESSION_EXPIRES_AT,
          user: {
            passwordConfigured: false,
          },
        })
    })

    await act(async () => {
      startupIdentity.resolve({
        host: window.location.host,
        savedAt: '2026-05-27T09:55:00.000Z',
        tenantSlug: 'buhfirma',
        userId: 8,
      })
      await new Promise((resolve) => window.setTimeout(resolve, 20))
    })

    expect(screen.getByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('skip@company.ru')).toBeInTheDocument()
    await expect(offlineStore.readAuthSnapshot('buhfirma', 8)).resolves
      .toMatchObject({
        user: {
          email: 'skip@company.ru',
        },
      })
  })

  it('saves online session snapshot and stays online-authenticated', async () => {
    fetchMock.mockResolvedValueOnce(createSessionResponse())

    renderAuthProbe()

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('online')).toBeInTheDocument()
    const cachedSnapshot = await offlineStore.readAuthSnapshot('buhfirma', 7)

    expect(cachedSnapshot).toMatchObject({
      sessionExpiresAt: VALID_SESSION_EXPIRES_AT,
      user: {
        id: 7,
      },
    })
    expect(Object.keys(cachedSnapshot ?? {})).not.toContain(
      'offline' + 'AccessUntil',
    )
  })
})
