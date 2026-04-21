import { createContext, useContext } from 'react'

import type { AuthenticatedPortalUser, LoginFormValues } from '../types'

export type AuthSessionStatus =
  | 'authenticated'
  | 'checking'
  | 'error'
  | 'unauthenticated'

export type AuthSessionContextValue = {
  errorMessage: string | null
  refreshSession: () => Promise<void>
  signIn: (credentials: LoginFormValues) => Promise<AuthenticatedPortalUser>
  signOut: () => Promise<void>
  status: AuthSessionStatus
  user: AuthenticatedPortalUser | null
}

export const AuthSessionContext =
  createContext<AuthSessionContextValue | null>(null)

export function useAuthSession() {
  const context = useContext(AuthSessionContext)

  if (!context) {
    throw new Error('useAuthSession must be used inside AuthSessionProvider')
  }

  return context
}
