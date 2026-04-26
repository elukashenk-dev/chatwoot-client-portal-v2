import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAppViewportLock } from './useAppViewportLock'

function AppViewportLockProbe() {
  useAppViewportLock()

  return <span>locked</span>
}

function installVisualViewport({
  height,
  offsetLeft = 0,
  offsetTop = 0,
  width = 390,
}: {
  height: number
  offsetLeft?: number
  offsetTop?: number
  width?: number
}) {
  const listeners = new Map<string, Set<() => void>>()
  const visualViewport = {
    height,
    offsetLeft,
    offsetTop,
    width,
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
    setMetrics(nextMetrics: {
      height?: number
      offsetLeft?: number
      offsetTop?: number
      width?: number
    }) {
      visualViewport.height = nextMetrics.height ?? visualViewport.height
      visualViewport.offsetLeft =
        nextMetrics.offsetLeft ?? visualViewport.offsetLeft
      visualViewport.offsetTop =
        nextMetrics.offsetTop ?? visualViewport.offsetTop
      visualViewport.width = nextMetrics.width ?? visualViewport.width
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
    document.documentElement.style.removeProperty('--portal-app-viewport-width')
    document.documentElement.style.removeProperty(
      '--portal-app-viewport-offset-left',
    )
    document.documentElement.style.removeProperty(
      '--portal-app-viewport-offset-top',
    )
    vi.restoreAllMocks()
  })

  it('locks page scroll and exposes the current visual viewport height', () => {
    const viewport = installVisualViewport({ height: 720 })
    const { unmount } = render(<AppViewportLockProbe />)

    expect(document.documentElement).toHaveClass('app-shell-scroll-lock')
    expect(document.body).toHaveClass('app-shell-scroll-lock')
    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-height',
      ),
    ).toBe('720px')
    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-width',
      ),
    ).toBe('390px')

    viewport.setMetrics({ height: 480, width: 375 })
    viewport.fire('resize')

    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-height',
      ),
    ).toBe('480px')
    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-width',
      ),
    ).toBe('375px')

    unmount()

    expect(document.documentElement).not.toHaveClass('app-shell-scroll-lock')
    expect(document.body).not.toHaveClass('app-shell-scroll-lock')
  })

  it('exposes visual viewport offsets for iOS fixed shell alignment', () => {
    const viewport = installVisualViewport({
      height: 720,
      offsetLeft: 11,
      offsetTop: 7,
      width: 379,
    })

    render(<AppViewportLockProbe />)

    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-offset-left',
      ),
    ).toBe('11px')
    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-offset-top',
      ),
    ).toBe('7px')

    viewport.setMetrics({ offsetLeft: 0, offsetTop: 3, width: 390 })
    viewport.fire('scroll')

    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-offset-left',
      ),
    ).toBe('0px')
    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-offset-top',
      ),
    ).toBe('3px')
    expect(
      document.documentElement.style.getPropertyValue(
        '--portal-app-viewport-width',
      ),
    ).toBe('390px')
  })
})
