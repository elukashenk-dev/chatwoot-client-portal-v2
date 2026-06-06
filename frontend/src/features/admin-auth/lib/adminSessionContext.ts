import { createContext, useContext } from 'react'

import type {
  AdminSessionResponse,
  PublicTenantAdmin,
} from '../api/adminAuthClient'

export type AdminSessionStatus =
  | 'checking'
  | 'unauthenticated'
  | 'authenticated'
  | 'error'

export type AdminSessionContextValue = {
  admin: PublicTenantAdmin | null
  errorMessage: string | null
  refreshSession: () => Promise<void>
  setVerifiedSession: (session: AdminSessionResponse) => void
  signOut: () => Promise<void>
  status: AdminSessionStatus
}

export const AdminSessionContext =
  createContext<AdminSessionContextValue | null>(null)

export function useAdminSession() {
  const context = useContext(AdminSessionContext)

  if (!context) {
    throw new Error('useAdminSession must be used inside AdminSessionProvider')
  }

  return context
}
