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

function saveStartupAuthSnapshot({
  offlineAccessUntil = '2099-05-28T10:00:00.000Z',
}: {
  offlineAccessUntil?: string
} = {}) {
  window.localStorage.setItem(
    `portal.startup.auth:${window.location.host}`,
    JSON.stringify({
      record: {
        host: window.location.host,
        snapshot: {
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
        },
        tenantSlug: 'buhfirma',
        userId: 7,
      },
      version: 1,
    }),
  )
}

function AuthProbe() {
  const { removeLocalDeviceData, sessionSource, signOut, status, user } =
    useAuthSession()

  return (
    <div>
      <span>{status}</span>
      <span>{sessionSource ?? 'no source'}</span>
      <span>{user?.email ?? 'no user'}</span>
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
    await saveTenantAndCachedAuth({
      offlineAccessUntil: '2099-05-28T10:00:00.000Z',
    })
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

  it('does not open protected auth from an invalid startup auth expiry', () => {
    saveStartupAuthSnapshot({
      offlineAccessUntil: 'not-a-date',
    })
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

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

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
