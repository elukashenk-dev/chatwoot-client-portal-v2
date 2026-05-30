import type { ReactElement } from 'react'

import { vi } from 'vitest'

import { AppRoutes } from '../app/AppRoutes'
import { AuthSessionProvider } from '../features/auth/lib/AuthSessionProvider'
import { clearOfflineDatabaseForTests } from '../features/offline/offlineDatabase'
import { TenantIdentityContext } from '../features/tenant/lib/tenantIdentityContext'
import { renderWithRouter } from './renderWithRouter'

export const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

export class MockEventSource {
  static instances: MockEventSource[] = []

  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  readonly close = vi.fn()
  readonly url: string
  readonly withCredentials: boolean | undefined

  constructor(url: string | URL, init?: EventSourceInit) {
    this.url = String(url)
    this.withCredentials = init?.withCredentials
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set()
    const callback =
      typeof listener === 'function'
        ? listener
        : listener.handleEvent.bind(listener)

    listeners.add(callback as (event: MessageEvent) => void)
    this.listeners.set(type, listeners)
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
    })

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

export class MockMediaRecorder {
  static instances: MockMediaRecorder[] = []
  static isTypeSupported = vi.fn(
    (mimeType: string) => mimeType === 'audio/webm;codecs=opus',
  )

  mimeType: string
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onstop: ((event: Event) => void) | null = null
  state: RecordingState = 'inactive'
  stream: MediaStream

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream
    this.mimeType = options?.mimeType ?? 'audio/webm'
    MockMediaRecorder.instances.push(this)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    if (this.state === 'inactive') {
      return
    }

    this.state = 'inactive'
    this.ondataavailable?.({
      data: new Blob(['voice-bytes'], { type: this.mimeType }),
    } as BlobEvent)
    this.onstop?.(new Event('stop'))
  }
}

export async function setupOfflineChatTestEnvironment() {
  window.localStorage.clear()
  await clearOfflineDatabaseForTests()
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: true,
  })
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: vi.fn(async () => ({
        quota: 1000,
        usage: 100,
      })),
      persist: vi.fn(async () => true),
    },
  })
}

export function renderChatRoute(ui: ReactElement = <AppRoutes />) {
  renderWithRouter(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>{ui}</AuthSessionProvider>
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}
