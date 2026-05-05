import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

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

type TenantProviderProps = {
  children: ReactNode
}

export function TenantProvider({ children }: TenantProviderProps) {
  const [tenant, setTenant] = useState<PublicTenantContext | null>(null)
  const [status, setStatus] = useState<TenantIdentityStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadTenant() {
      try {
        const publicTenant = await getPublicTenantContext()

        if (!isMounted) {
          return
        }

        applyTenantDocumentMetadata(publicTenant)
        setTenant(publicTenant)
        setErrorMessage(null)
        setStatus('ready')
      } catch (error) {
        if (!isMounted) {
          return
        }

        setTenant(null)
        setErrorMessage(
          error instanceof TenantClientError
            ? error.message
            : 'Мы не смогли загрузить данные личного кабинета.',
        )
        setStatus('error')
      }
    }

    void loadTenant()

    return () => {
      isMounted = false
    }
  }, [])

  const value = useMemo<TenantIdentityContextValue>(
    () => ({
      errorMessage,
      status,
      tenant,
    }),
    [errorMessage, status, tenant],
  )

  return (
    <TenantIdentityContext.Provider value={value}>
      {children}
    </TenantIdentityContext.Provider>
  )
}
