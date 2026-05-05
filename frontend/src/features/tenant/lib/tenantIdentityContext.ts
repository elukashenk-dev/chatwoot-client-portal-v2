import { createContext } from 'react'

import type { PublicTenantContext } from '../api/tenantClient'

export type TenantIdentityStatus = 'loading' | 'ready' | 'error'

export type TenantIdentityContextValue = {
  errorMessage: string | null
  status: TenantIdentityStatus
  tenant: PublicTenantContext | null
}

export const fallbackTenantIdentityContext: TenantIdentityContextValue = {
  errorMessage: null,
  status: 'loading',
  tenant: null,
}

export const TenantIdentityContext = createContext<TenantIdentityContextValue>(
  fallbackTenantIdentityContext,
)
