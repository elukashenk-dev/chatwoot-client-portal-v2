import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getCurrentUser, login, logout } from '../api/authClient'
import type { AuthenticatedPortalUser, LoginFormValues } from '../types'
import { getAuthRequestErrorMessage } from './authErrors'
import {
  AuthSessionContext,
  type AuthSessionContextValue,
  type AuthSessionStatus,
} from './authSessionContext'

type AuthSessionProviderProps = {
  children: ReactNode
}

export function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  const isMountedRef = useRef(false)
  const [status, setStatus] = useState<AuthSessionStatus>('checking')
  const [user, setUser] = useState<AuthenticatedPortalUser | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resolveCurrentSession = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser()

      if (!isMountedRef.current) {
        return
      }

      setUser(currentUser)
      setStatus(currentUser ? 'authenticated' : 'unauthenticated')
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setUser(null)
      setErrorMessage(getAuthRequestErrorMessage(error))
      setStatus('error')
    }
  }, [])

  const refreshSession = useCallback(async () => {
    setStatus('checking')
    setErrorMessage(null)
    await resolveCurrentSession()
  }, [resolveCurrentSession])

  const signIn = useCallback(async (credentials: LoginFormValues) => {
    setErrorMessage(null)

    try {
      const authenticatedUser = await login(credentials)

      if (isMountedRef.current) {
        setUser(authenticatedUser)
        setStatus('authenticated')
      }

      return authenticatedUser
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(getAuthRequestErrorMessage(error))
      }

      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    setErrorMessage(null)

    try {
      await logout()

      if (isMountedRef.current) {
        setUser(null)
        setStatus('unauthenticated')
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(getAuthRequestErrorMessage(error))
      }

      throw error
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    const bootstrapTimerId = window.setTimeout(() => {
      void resolveCurrentSession()
    }, 0)

    return () => {
      window.clearTimeout(bootstrapTimerId)
      isMountedRef.current = false
    }
  }, [resolveCurrentSession])

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      errorMessage,
      refreshSession,
      signIn,
      signOut,
      status,
      user,
    }),
    [errorMessage, refreshSession, signIn, signOut, status, user],
  )

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  )
}
