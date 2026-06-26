import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TenantIdentityContext } from '../features/tenant/lib/tenantIdentityContext'
import { PwaInstallBanner } from './PwaInstallBanner'
import { PwaInstallPromptProvider } from './installPromptRuntime'

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

const originalLocation = window.location
const originalMatchMedia = window.matchMedia
const originalUserAgent = window.navigator.userAgent
const originalPlatform = window.navigator.platform
const originalMaxTouchPoints = window.navigator.maxTouchPoints

type MockBeforeInstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn<() => Promise<void>>>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function createBeforeInstallPromptEvent(): MockBeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as MockBeforeInstallPromptEvent

  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({
    outcome: 'accepted',
    platform: 'web',
  })

  return event
}

function setBrowserEnvironment({
  platform = 'Linux x86_64',
  userAgent = 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36',
}: {
  platform?: string
  userAgent?: string
} = {}) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('https://lk.example.test/app/chat'),
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
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
    value: platform === 'iPhone' ? 5 : 0,
  })
}

function setIosSafariEnvironment() {
  setBrowserEnvironment({
    platform: 'iPhone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  })
}

function renderBanner() {
  return render(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <PwaInstallPromptProvider>
        <PwaInstallBanner />
      </PwaInstallPromptProvider>
    </TenantIdentityContext.Provider>,
  )
}

describe('PwaInstallBanner', () => {
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

  it('does not render while install prompt state is hidden', () => {
    renderBanner()

    expect(screen.queryByText('Установите кабинет')).not.toBeInTheDocument()
  })

  it('calls the native Chromium install prompt from the primary action', async () => {
    const user = userEvent.setup()
    renderBanner()
    const installEvent = createBeforeInstallPromptEvent()

    await act(async () => {
      window.dispatchEvent(installEvent)
    })

    await user.click(screen.getByRole('button', { name: 'Установить' }))

    expect(installEvent.prompt).toHaveBeenCalledTimes(1)
  })

  it('shows iOS manual add-to-home-screen instructions', async () => {
    const user = userEvent.setup()
    setIosSafariEnvironment()
    renderBanner()

    await user.click(screen.getByRole('button', { name: 'Установить' }))

    expect(screen.getByText('Откройте портал в Safari.')).toBeInTheDocument()
    expect(screen.getByText('Нажмите «Поделиться».')).toBeInTheDocument()
    expect(screen.getByText('Выберите «На экран Домой».')).toBeInTheDocument()
    expect(screen.getByText('Нажмите «Добавить».')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Понятно' }))

    expect(screen.queryByText('Установите кабинет')).not.toBeInTheDocument()
  })

  it('dismisses the banner from the secondary action', async () => {
    const user = userEvent.setup()
    setIosSafariEnvironment()
    renderBanner()

    await user.click(screen.getByRole('button', { name: 'Позже' }))

    expect(screen.queryByText('Установите кабинет')).not.toBeInTheDocument()
  })
})
