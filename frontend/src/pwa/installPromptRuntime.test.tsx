import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PwaInstallPromptProvider,
} from './installPromptRuntime'
import { usePwaInstallPrompt } from './installPromptContext'
import { TenantIdentityContext } from '../features/tenant/lib/tenantIdentityContext'

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'ProvGroup',
    primaryDomain: 'lk.example.test',
    publicBaseUrl: 'https://lk.example.test',
    slug: 'provgroup',
  },
}

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000
const originalLocation = window.location
const originalMatchMedia = window.matchMedia
const originalUserAgent = window.navigator.userAgent
const originalPlatform = window.navigator.platform
const originalMaxTouchPoints = window.navigator.maxTouchPoints

type MockBeforeInstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn<() => Promise<void>>>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function createBeforeInstallPromptEvent(
  outcome: 'accepted' | 'dismissed' = 'accepted',
): MockBeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as MockBeforeInstallPromptEvent

  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({
    outcome,
    platform: 'web',
  })

  return event
}

function setBrowserEnvironment({
  href = 'https://lk.example.test/app/chat',
  maxTouchPoints = 0,
  platform = 'Linux x86_64',
  standalone = false,
  userAgent = 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36',
}: {
  href?: string
  maxTouchPoints?: number
  platform?: string
  standalone?: boolean
  userAgent?: string
} = {}) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(href),
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: standalone && query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  })
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  })
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: platform,
  })
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    configurable: true,
    value: maxTouchPoints,
  })
}

function setIosSafariEnvironment() {
  setBrowserEnvironment({
    platform: 'iPhone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  })
}

function PromptProbe() {
  const { dismiss, install, state } = usePwaInstallPrompt()

  return (
    <div>
      <output aria-label="install status">{state.status}</output>
      <output aria-label="install detail">
        {state.status === 'available' ? state.platform : state.reason}
      </output>
      <button
        onClick={() => {
          void install()
        }}
        type="button"
      >
        install
      </button>
      <button onClick={dismiss} type="button">
        dismiss
      </button>
    </div>
  )
}

function renderPromptProbe() {
  return render(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <PwaInstallPromptProvider>
        <PromptProbe />
      </PwaInstallPromptProvider>
    </TenantIdentityContext.Provider>,
  )
}

describe('PWA install prompt runtime', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    window.localStorage.clear()
    setBrowserEnvironment()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    })
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    })
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalPlatform,
    })
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: originalMaxTouchPoints,
    })
  })

  it('stores the Chromium beforeinstallprompt event and invokes it from install action', async () => {
    const user = userEvent.setup()
    renderPromptProbe()

    expect(screen.getByLabelText('install status')).toHaveTextContent('hidden')
    expect(screen.getByLabelText('install detail')).toHaveTextContent('waiting')

    const installEvent = createBeforeInstallPromptEvent('accepted')

    await act(async () => {
      window.dispatchEvent(installEvent)
    })

    expect(installEvent.defaultPrevented).toBe(true)
    expect(screen.getByLabelText('install status')).toHaveTextContent(
      'available',
    )
    expect(screen.getByLabelText('install detail')).toHaveTextContent('native')

    await user.click(screen.getByRole('button', { name: 'install' }))
    await screen.findByText('installed')

    expect(installEvent.prompt).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('install status')).toHaveTextContent('hidden')
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'installed',
    )
  })

  it('records native prompt dismissal for the current host and tenant', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPromptProbe()
    const installEvent = createBeforeInstallPromptEvent('dismissed')

    await act(async () => {
      window.dispatchEvent(installEvent)
    })
    await user.click(screen.getByRole('button', { name: 'install' }))
    await screen.findByText('dismissed')

    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'dismissed',
    )

    unmount()
    renderPromptProbe()

    expect(screen.getByLabelText('install status')).toHaveTextContent('hidden')
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'dismissed',
    )
  })

  it('expires dismissal after the configured cooldown', async () => {
    const user = userEvent.setup()
    setIosSafariEnvironment()
    const { unmount } = renderPromptProbe()

    expect(screen.getByLabelText('install status')).toHaveTextContent(
      'available',
    )
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'ios_manual',
    )

    await user.click(screen.getByRole('button', { name: 'dismiss' }))

    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'dismissed',
    )

    unmount()
    vi.mocked(Date.now).mockReturnValue(1_800_000_000_000 + THIRTY_ONE_DAYS_MS)
    renderPromptProbe()

    expect(screen.getByLabelText('install status')).toHaveTextContent(
      'available',
    )
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'ios_manual',
    )
  })

  it('exposes manual install instructions on iOS Safari without using a native prompt', async () => {
    const user = userEvent.setup()
    setIosSafariEnvironment()
    renderPromptProbe()

    expect(screen.getByLabelText('install status')).toHaveTextContent(
      'available',
    )
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'ios_manual',
    )

    await user.click(screen.getByRole('button', { name: 'install' }))

    expect(screen.getByLabelText('install status')).toHaveTextContent(
      'available',
    )
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'ios_manual',
    )
  })

  it('hides install UI when the app is already running standalone', () => {
    setBrowserEnvironment({
      standalone: true,
    })

    renderPromptProbe()

    expect(screen.getByLabelText('install status')).toHaveTextContent('hidden')
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'installed',
    )
  })

  it('hides install UI after the appinstalled event fires', async () => {
    renderPromptProbe()
    const installEvent = createBeforeInstallPromptEvent('accepted')

    await act(async () => {
      window.dispatchEvent(installEvent)
    })

    expect(screen.getByLabelText('install status')).toHaveTextContent(
      'available',
    )

    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(screen.getByLabelText('install status')).toHaveTextContent('hidden')
    expect(screen.getByLabelText('install detail')).toHaveTextContent(
      'installed',
    )
  })
})
