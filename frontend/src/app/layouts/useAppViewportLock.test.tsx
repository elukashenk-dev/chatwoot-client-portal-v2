import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAppViewportLock } from './useAppViewportLock'

function AppViewportLockProbe() {
  useAppViewportLock()

  return <span>locked</span>
}

function installVisualViewport(height: number, offsetTop = 0) {
  const listeners = new Map<string, Set<() => void>>()
  const visualViewport = {
    height,
    offsetTop,
    addEventListener: vi.fn((eventName: string, listener: () => void) => {
      const eventListeners = listeners.get(eventName) ?? new Set<() => void>()

      eventListeners.add(listener)
      listeners.set(eventName, eventListeners)
    }),
    removeEventListener: vi.fn((eventName: string, listener: () => void) => {
      listeners.get(eventName)?.delete(listener)
    }),
  }

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: visualViewport,
  })

  return {
    fire(eventName: string) {
      listeners.get(eventName)?.forEach((listener) => {
        listener()
      })
    },
    setHeight(nextHeight: number) {
      visualViewport.height = nextHeight
    },
  }
}

describe('useAppViewportLock', () => {
  afterEach(() => {
    document.documentElement.classList.remove('app-shell-scroll-lock')
    document.body.classList.remove('app-shell-scroll-lock')
    document.documentElement.style.removeProperty(
      '--portal-app-viewport-height',
    )
    document.documentElement.style.removeProperty(
      '--portal-app-viewport-offset-top',
    )
    vi.restoreAllMocks()
  })

  it('locks page scroll and exposes the current visual viewport height', () => {
    const viewport = installVisualViewport(720)
    const { unmount } = render(<AppViewportLockProbe />)

    expect(document.documentElement).toHaveClass('app-shell-scroll-lock')
    expect(document.body).toHaveClass('app-shell-scroll-lock')
    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-height',
      ),
    ).toBe('720px')

    viewport.setHeight(480)
    viewport.fire('resize')

    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-height',
      ),
    ).toBe('480px')

    unmount()

    expect(document.documentElement).not.toHaveClass('app-shell-scroll-lock')
    expect(document.body).not.toHaveClass('app-shell-scroll-lock')
  })
})
