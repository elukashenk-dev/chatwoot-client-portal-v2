import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getCurrentAdminSession,
  logoutAdmin,
  type AdminSessionResponse,
  type PublicTenantAdmin,
} from '../api/adminAuthClient'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
  type AdminSessionStatus,
} from './adminSessionContext'

type AdminSessionProviderProps = {
  children: ReactNode
}

export function AdminSessionProvider({ children }: AdminSessionProviderProps) {
  const isMountedRef = useRef(false)
  const [admin, setAdmin] = useState<PublicTenantAdmin | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [status, setStatus] = useState<AdminSessionStatus>('checking')

  const refreshSession = useCallback(async () => {
    setErrorMessage(null)
    setStatus('checking')

    try {
      const session = await getCurrentAdminSession()

      if (!isMountedRef.current) {
        return
      }

      if (!session) {
        setAdmin(null)
        setStatus('unauthenticated')
        return
      }

      setAdmin(session.admin)
      setStatus('authenticated')
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setAdmin(null)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось проверить вход администратора.',
      )
      setStatus('error')
    }
  }, [])

  const setVerifiedSession = useCallback((session: AdminSessionResponse) => {
    setErrorMessage(null)
    setAdmin(session.admin)
    setStatus('authenticated')
  }, [])

  const signOut = useCallback(async () => {
    setErrorMessage(null)

    try {
      await logoutAdmin()

      if (!isMountedRef.current) {
        return
      }

      setAdmin(null)
      setStatus('unauthenticated')
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось выйти из админ-консоли.',
      )
      throw error
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    let isStartupQueued = true

    void Promise.resolve().then(() => {
      if (isStartupQueued) {
        void refreshSession()
      }
    })

    return () => {
      isStartupQueued = false
      isMountedRef.current = false
    }
  }, [refreshSession])

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      admin,
      errorMessage,
      refreshSession,
      setVerifiedSession,
      signOut,
      status,
    }),
    [admin, errorMessage, refreshSession, setVerifiedSession, signOut, status],
  )

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  )
}
