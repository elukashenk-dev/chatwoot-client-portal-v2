import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  BOOT_LOCAL_CACHE_READ_DEADLINE_MS,
  BOOT_ONLINE_REQUIRED_MS,
  createRequestTimeout,
  withBootReadDeadline,
} from '../../offline/bootCoordinator'
import {
  clearCurrentUserOfflineData,
  clearRejectedAuthSnapshot,
  offlineStore,
  removeLocalDeviceDataAndBlockCachedOpen,
} from '../../offline/offlineStore'
import { readStartupAuthSession } from '../../offline/startupCache'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { getCurrentSession, login, logout } from '../api/authClient'
import type { AuthenticatedPortalUser, LoginFormValues } from '../types'
import { getAuthRequestErrorMessage } from './authErrors'
import {
  AuthSessionContext,
  type AuthSessionContextValue,
  type AuthSessionSource,
  type AuthSessionStatus,
} from './authSessionContext'
import {
  completePendingLocalDeviceSignout,
  type CachedAuthSessionReadResult,
  type OfflineAuthScope,
  readCachedAuthSession,
  saveOnlineAuthSnapshot,
  isStartupNetworkFailure,
} from './offlineAuthSession'

type AuthSessionProviderProps = {
  children: ReactNode
}

type CachedSessionOpenMode =
  | 'allow_session_check_required'
  | 'authenticated_only'

export function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  const { tenant } = useTenantIdentity()
  const [startupAuthSession] = useState(() =>
    readStartupAuthSession({
      host: window.location.host,
      tenantSlug: tenant?.slug ?? null,
    }),
  )
  const initialStatus: AuthSessionStatus = startupAuthSession
    ? 'authenticated'
    : 'checking'
  const isMountedRef = useRef(false)
  const startupAttemptRef = useRef(0)
  const statusRef = useRef<AuthSessionStatus>(initialStatus)
  const deadlineTimersRef = useRef<number[]>([])
  const requestTimeoutRef = useRef<{ cancel: () => void } | null>(null)

  const [status, setStatus] = useState<AuthSessionStatus>(initialStatus)
  const [user, setUser] = useState<AuthenticatedPortalUser | null>(
    startupAuthSession?.snapshot.user ?? null,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionSource, setSessionSource] = useState<AuthSessionSource | null>(
    startupAuthSession ? 'cached' : null,
  )
  const [offlineRemovalScope, setOfflineRemovalScope] =
    useState<OfflineAuthScope | null>(startupAuthSession?.scope ?? null)

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

  const saveOnlineSessionSnapshot = useCallback(
    async (
      currentSession: Parameters<
        typeof saveOnlineAuthSnapshot
      >[0]['currentSession'],
    ) => {
      if (!tenant) {
        return null
      }

      try {
        return await saveOnlineAuthSnapshot({
          currentSession,
          host: window.location.host,
          tenantSlug: tenant.slug,
        })
      } catch {
        // Online auth remains valid even if local offline persistence fails.
        return null
      }
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

  const openCachedSession = useCallback(
    async ({
      cachedSessionPromise,
      isCurrentAttempt,
      mode,
    }: {
      cachedSessionPromise: ReturnType<typeof readCachedAuthSession>
      isCurrentAttempt: () => boolean
      mode: CachedSessionOpenMode
    }) => {
      const canUseCachedFallback = () =>
        isCurrentAttempt() && statusRef.current === 'checking'

      if (!canUseCachedFallback()) {
        return false
      }

      const cachedSession = await cachedSessionPromise

      if (!canUseCachedFallback()) {
        return false
      }

      if (cachedSession.status === 'session_check_required') {
        if (mode === 'allow_session_check_required') {
          clearDeadlineTimers()
          cancelStartupRequest()
          requireOnlineSessionCheck(cachedSession.scope)
        }

        return false
      }

      clearDeadlineTimers()
      setUser(cachedSession.snapshot.user)
      setSessionSource('cached')
      setOfflineRemovalScope(cachedSession.scope)
      setErrorMessage(null)
      setAuthStatus('authenticated')
      return true
    },
    [
      cancelStartupRequest,
      clearDeadlineTimers,
      requireOnlineSessionCheck,
      setAuthStatus,
    ],
  )

  const resolveCurrentSession = useCallback(() => {
    const attemptId = startupAttemptRef.current + 1
    startupAttemptRef.current = attemptId
    clearDeadlineTimers()
    cancelStartupRequest()

    const host = window.location.host
    const requestTimeout = createRequestTimeout()
    requestTimeoutRef.current = requestTimeout
    const cachedSessionPromise =
      withBootReadDeadline<CachedAuthSessionReadResult>(
        readCachedAuthSession({
          host,
          tenantSlug: tenant?.slug ?? null,
        }),
        {
          scope: null,
          status: 'session_check_required',
        },
        BOOT_LOCAL_CACHE_READ_DEADLINE_MS,
      )
    const currentSessionPromise = getCurrentSession({
      signal: requestTimeout.signal,
    })
    const isCurrentAttempt = () =>
      isMountedRef.current && startupAttemptRef.current === attemptId

    setErrorMessage(null)

    if (statusRef.current !== 'authenticated') {
      setAuthStatus('checking')
    }

    void openCachedSession({
      cachedSessionPromise,
      isCurrentAttempt,
      mode: 'authenticated_only',
    })

    deadlineTimersRef.current.push(
      window.setTimeout(() => {
        if (isCurrentAttempt() && statusRef.current === 'checking') {
          void openCachedSession({
            cachedSessionPromise,
            isCurrentAttempt,
            mode: 'allow_session_check_required',
          })
        }
      }, BOOT_ONLINE_REQUIRED_MS),
    )

    return currentSessionPromise
      .then(async (currentSession) => {
        if (!isCurrentAttempt()) {
          return
        }

        if (!currentSession) {
          let identity: Awaited<
            ReturnType<typeof offlineStore.readLastActiveIdentity>
          > = null
          let rejectedScope: OfflineAuthScope | null =
            startupAuthSession?.scope ?? null
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
            rejectedScope = identity
              ? {
                  host,
                  tenantSlug: identity.tenantSlug,
                  userId: identity.userId,
                }
              : rejectedScope

            if (signoutScope) {
              await clearCurrentUserOfflineData(signoutScope)
              await offlineStore.deleteLocalDeviceSignout(host)
            } else if (rejectedScope) {
              await clearRejectedAuthSnapshot(rejectedScope)
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
              : rejectedScope,
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

          await openCachedSession({
            cachedSessionPromise,
            isCurrentAttempt,
            mode: 'allow_session_check_required',
          })
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
    saveOnlineSessionSnapshot,
    setAuthStatus,
    startupAuthSession,
    tenant,
  ])

  const refreshSession = useCallback(async () => {
    await resolveCurrentSession()
  }, [resolveCurrentSession])

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

  useEffect(() => {
    isMountedRef.current = true
    let isStartupQueued = true

    void Promise.resolve().then(() => {
      if (isStartupQueued) {
        void resolveCurrentSession()
      }
    })

    return () => {
      isStartupQueued = false
      isMountedRef.current = false
      clearDeadlineTimers()
      cancelStartupRequest()
    }
  }, [cancelStartupRequest, clearDeadlineTimers, resolveCurrentSession])

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

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  )
}
