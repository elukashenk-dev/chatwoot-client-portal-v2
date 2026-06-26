import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { useTenantIdentity } from '../features/tenant/lib/useTenantIdentity'
import {
  type BrowserBeforeInstallPromptEvent,
  getPwaInstallPromptState,
  type PwaInstallPromptResult,
  PwaInstallPromptContext,
  recordPwaInstallDismissal,
} from './installPromptContext'

export function PwaInstallPromptProvider({
  children,
}: {
  children: ReactNode
}) {
  const { tenant } = useTenantIdentity()
  const tenantSlug = tenant?.slug ?? null
  const [deferredPrompt, setDeferredPrompt] =
    useState<BrowserBeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [, setDismissalRevision] = useState(0)

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BrowserBeforeInstallPromptEvent)
    }

    function handleAppInstalled() {
      setDeferredPrompt(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      )
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const state = getPwaInstallPromptState({
    deferredPrompt,
    installed,
    tenantSlug,
  })

  const dismiss = useCallback(() => {
    if (!tenantSlug) {
      return
    }

    recordPwaInstallDismissal(tenantSlug)
    setDeferredPrompt(null)
    setDismissalRevision((value) => value + 1)
  }, [tenantSlug])

  const install = useCallback(async (): Promise<PwaInstallPromptResult> => {
    if (state.status !== 'available' || !tenantSlug) {
      return 'unavailable'
    }

    if (state.platform === 'ios_manual') {
      return 'manual'
    }

    const prompt = deferredPrompt

    if (!prompt) {
      return 'unavailable'
    }

    setDeferredPrompt(null)
    await prompt.prompt()

    const choice = await prompt.userChoice

    if (choice.outcome === 'accepted') {
      setInstalled(true)
      return 'accepted'
    }

    recordPwaInstallDismissal(tenantSlug)
    setDismissalRevision((value) => value + 1)

    return 'dismissed'
  }, [deferredPrompt, state, tenantSlug])

  const contextValue = useMemo(
    () => ({
      dismiss,
      install,
      state,
    }),
    [dismiss, install, state],
  )

  return (
    <PwaInstallPromptContext.Provider value={contextValue}>
      {children}
    </PwaInstallPromptContext.Provider>
  )
}
