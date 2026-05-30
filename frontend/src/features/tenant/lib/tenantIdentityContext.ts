import { createContext } from 'react'

import type { PublicTenantContext } from '../api/tenantClient'

export type TenantIdentityStatus =
  | 'error'
  | 'loading'
  | 'online_required'
  | 'ready'
  | 'ready_cached'

export type TenantIdentityContextValue = {
  errorMessage: string | null
  isUsingCachedData: boolean
  status: TenantIdentityStatus
  tenant: PublicTenantContext | null
}

export const fallbackTenantIdentityContext: TenantIdentityContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'loading',
  tenant: null,
}

export const TenantIdentityContext = createContext<TenantIdentityContextValue>(
  fallbackTenantIdentityContext,
)
