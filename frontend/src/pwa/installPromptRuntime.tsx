import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import { useTenantIdentity } from '../features/tenant/lib/useTenantIdentity'
import {
  capturePwaBeforeInstallPromptEvent,
  clearPwaInstallDeferredPrompt,
  getPwaInstallPromptState,
  markPwaInstallAppInstalled,
  type PwaInstallPromptResult,
  PwaInstallPromptContext,
  readPwaInstallPromptEventSnapshot,
  recordPwaInstallDismissal,
  subscribePwaInstallPromptEvents,
} from './installPromptContext'

export function PwaInstallPromptCapture() {
  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      capturePwaBeforeInstallPromptEvent(event)
    }

    function handleAppInstalled() {
      markPwaInstallAppInstalled()
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

  return null
}

export function PwaInstallPromptProvider({
  children,
}: {
  children: ReactNode
}) {
  const { tenant } = useTenantIdentity()
  const tenantSlug = tenant?.slug ?? null
  const promptEvents = useSyncExternalStore(
    subscribePwaInstallPromptEvents,
    readPwaInstallPromptEventSnapshot,
    readPwaInstallPromptEventSnapshot,
  )
  const [, setDismissalRevision] = useState(0)
  const state = getPwaInstallPromptState({
    deferredPrompt: promptEvents.deferredPrompt,
    installed: promptEvents.installed,
    tenantSlug,
  })
  const availablePlatform = state.status === 'available' ? state.platform : null

  const dismiss = useCallback(() => {
    if (!tenantSlug) {
      return
    }

    recordPwaInstallDismissal(tenantSlug)
    clearPwaInstallDeferredPrompt()
    setDismissalRevision((value) => value + 1)
  }, [tenantSlug])

  const install = useCallback(async (): Promise<PwaInstallPromptResult> => {
    if (!availablePlatform || !tenantSlug) {
      return 'unavailable'
    }

    if (availablePlatform === 'ios_manual') {
      return 'manual'
    }

    const prompt = promptEvents.deferredPrompt

    if (!prompt) {
      return 'unavailable'
    }

    clearPwaInstallDeferredPrompt()

    try {
      await prompt.prompt()
      const choice = await prompt.userChoice

      if (choice.outcome === 'accepted') {
        markPwaInstallAppInstalled()
        return 'accepted'
      }

      recordPwaInstallDismissal(tenantSlug)
      setDismissalRevision((value) => value + 1)

      return 'dismissed'
    } catch {
      return 'unavailable'
    }
  }, [availablePlatform, promptEvents.deferredPrompt, tenantSlug])

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
