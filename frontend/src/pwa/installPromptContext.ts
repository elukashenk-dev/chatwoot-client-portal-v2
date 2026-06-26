import { createContext, useContext } from 'react'

export type PwaInstallPromptState =
  | {
      reason: 'dismissed' | 'installed' | 'unsupported' | 'waiting'
      status: 'hidden'
    }
  | {
      platform: 'ios_manual' | 'native'
      status: 'available'
    }

export type PwaInstallPromptResult =
  | 'accepted'
  | 'dismissed'
  | 'manual'
  | 'unavailable'

export type BrowserBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

export type PwaInstallPromptEventSnapshot = {
  deferredPrompt: BrowserBeforeInstallPromptEvent | null
  installed: boolean
  revision: number
}

export type PwaInstallPromptContextValue = {
  dismiss: () => void
  install: () => Promise<PwaInstallPromptResult>
  state: PwaInstallPromptState
}

export const PWA_INSTALL_MANUAL_INSTRUCTIONS_EVENT =
  'portal:pwa-install-manual-instructions'

export const pwaInstallHiddenWaitingState: PwaInstallPromptState = {
  reason: 'waiting',
  status: 'hidden',
}

export const PwaInstallPromptContext =
  createContext<PwaInstallPromptContextValue>({
    dismiss: () => {},
    install: async () => 'unavailable',
    state: {
      reason: 'unsupported',
      status: 'hidden',
    },
  })

const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000
const STORAGE_KEY_PREFIX = 'portal:pwa-install-dismissed'
const initialPromptEventSnapshot: PwaInstallPromptEventSnapshot = {
  deferredPrompt: null,
  installed: false,
  revision: 0,
}
const promptEventListeners = new Set<() => void>()

let promptEventSnapshot = initialPromptEventSnapshot

function publishPromptEventSnapshot(
  nextSnapshot: Omit<PwaInstallPromptEventSnapshot, 'revision'>,
) {
  promptEventSnapshot = {
    ...nextSnapshot,
    revision: promptEventSnapshot.revision + 1,
  }

  for (const listener of promptEventListeners) {
    listener()
  }
}

function getCurrentHost() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.location.host || window.location.hostname || null
}

function getDismissalStorageKey(tenantSlug: string) {
  const host = getCurrentHost()

  if (!host) {
    return null
  }

  return `${STORAGE_KEY_PREFIX}:${host}:${tenantSlug}`
}

function readDismissedAt(key: string) {
  try {
    const rawValue = window.localStorage.getItem(key)

    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as { dismissedAt?: unknown }

    return typeof parsed.dismissedAt === 'number' ? parsed.dismissedAt : null
  } catch {
    return null
  }
}

export function isDismissalActive(tenantSlug: string) {
  if (typeof window === 'undefined') {
    return false
  }

  const key = getDismissalStorageKey(tenantSlug)

  if (!key) {
    return false
  }

  const dismissedAt = readDismissedAt(key)

  if (dismissedAt === null) {
    return false
  }

  return Date.now() - dismissedAt < DISMISSAL_TTL_MS
}

export function recordPwaInstallDismissal(tenantSlug: string) {
  if (typeof window === 'undefined') {
    return
  }

  const key = getDismissalStorageKey(tenantSlug)

  if (!key) {
    return
  }

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        dismissedAt: Date.now(),
      }),
    )
  } catch {
    // Install prompt dismissal is advisory UI state.
  }
}

export function isRunningStandalone() {
  if (typeof window === 'undefined') {
    return false
  }

  if (window.matchMedia?.('(display-mode: standalone)').matches) {
    return true
  }

  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIosDevice() {
  if (typeof window === 'undefined') {
    return false
  }

  const { maxTouchPoints, platform, userAgent } = window.navigator

  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  )
}

export function readPwaInstallPromptEventSnapshot() {
  return promptEventSnapshot
}

export function subscribePwaInstallPromptEvents(listener: () => void) {
  promptEventListeners.add(listener)

  return () => {
    promptEventListeners.delete(listener)
  }
}

export function capturePwaBeforeInstallPromptEvent(event: Event) {
  event.preventDefault()

  if (isIosDevice()) {
    return
  }

  publishPromptEventSnapshot({
    deferredPrompt: event as BrowserBeforeInstallPromptEvent,
    installed: promptEventSnapshot.installed,
  })
}

export function clearPwaInstallDeferredPrompt() {
  if (!promptEventSnapshot.deferredPrompt) {
    return
  }

  publishPromptEventSnapshot({
    deferredPrompt: null,
    installed: promptEventSnapshot.installed,
  })
}

export function markPwaInstallAppInstalled() {
  publishPromptEventSnapshot({
    deferredPrompt: null,
    installed: true,
  })
}

export function getPwaInstallPromptState({
  deferredPrompt,
  installed,
  tenantSlug,
}: {
  deferredPrompt: BrowserBeforeInstallPromptEvent | null
  installed: boolean
  tenantSlug: string | null
}): PwaInstallPromptState {
  if (!tenantSlug) {
    return pwaInstallHiddenWaitingState
  }

  if (installed || isRunningStandalone()) {
    return {
      reason: 'installed',
      status: 'hidden',
    }
  }

  if (isDismissalActive(tenantSlug)) {
    return {
      reason: 'dismissed',
      status: 'hidden',
    }
  }

  if (isIosDevice()) {
    return {
      platform: 'ios_manual',
      status: 'available',
    }
  }

  if (deferredPrompt) {
    return {
      platform: 'native',
      status: 'available',
    }
  }

  return pwaInstallHiddenWaitingState
}

export function usePwaInstallPrompt() {
  return useContext(PwaInstallPromptContext)
}

export const pwaInstallPromptInternalsForTests = {
  getDismissalStorageKey,
  isIosDevice,
  isRunningStandalone,
  resetPromptEventSnapshot() {
    promptEventSnapshot = initialPromptEventSnapshot

    for (const listener of promptEventListeners) {
      listener()
    }
  },
}
