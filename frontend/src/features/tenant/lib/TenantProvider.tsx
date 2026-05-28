import type { ReactNode } from 'react'
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
import {
  getPublicTenantContext,
  type PublicTenantContext,
  TenantClientError,
} from '../api/tenantClient'
import {
  TenantIdentityContext,
  type TenantIdentityContextValue,
  type TenantIdentityStatus,
} from './tenantIdentityContext'
import { applyTenantDocumentMetadata } from './tenantIdentityMetadata'
import { TenantSplashScreen } from '../components/TenantSplashScreen'

type TenantProviderProps = {
  children: ReactNode
}

type CachedTenantReadResult =
  | Awaited<ReturnType<typeof offlineStore.readTenantContext>>
  | 'cache_read_failed'
  | 'storage_unavailable'

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

export function TenantProvider({ children }: TenantProviderProps) {
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

  const startTenantLoad = useCallback(() => {
    const attemptId = startupAttemptRef.current + 1
    startupAttemptRef.current = attemptId
    clearDeadlineTimers()
    cancelStartupRequest()

    const host = window.location.host
    const requestTimeout = createRequestTimeout()
    requestTimeoutRef.current = requestTimeout
    const cachedTenantPromise: Promise<CachedTenantReadResult> = offlineStore
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

    const openCachedTenant = (cachedTenant: CachedTenantReadResult) => {
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
        try {
          await offlineStore.saveTenantContext({
            host,
            savedAt: new Date().toISOString(),
            tenant: publicTenant,
          })
        } catch {
          // Online tenant success remains authoritative; cache is best effort.
        }

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
          try {
            await offlineStore.deleteTenantContext(host)
          } catch {
            // Authoritative tenant rejection still wins over cache cleanup errors.
          }

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

  useEffect(() => {
    isMountedRef.current = true
    let isStartupQueued = true

    queueMicrotask(() => {
      if (isStartupQueued) {
        startTenantLoad()
      }
    })

    return () => {
      isStartupQueued = false
      isMountedRef.current = false
      clearDeadlineTimers()
      cancelStartupRequest()
    }
  }, [cancelStartupRequest, clearDeadlineTimers, startTenantLoad])

  const value = useMemo<TenantIdentityContextValue>(
    () => ({
      errorMessage,
      isUsingCachedData,
      status,
      tenant,
    }),
    [errorMessage, isUsingCachedData, status, tenant],
  )

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
}
