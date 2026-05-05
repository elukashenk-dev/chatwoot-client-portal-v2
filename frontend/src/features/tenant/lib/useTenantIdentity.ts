import { useContext } from 'react'

import { TenantIdentityContext } from './tenantIdentityContext'

export function useTenantIdentity() {
  return useContext(TenantIdentityContext)
}
