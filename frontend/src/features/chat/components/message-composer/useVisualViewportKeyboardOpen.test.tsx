import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useVisualViewportKeyboardOpen } from './useVisualViewportKeyboardOpen'

function KeyboardStateProbe() {
  const isKeyboardOpen = useVisualViewportKeyboardOpen()

  return <span>{isKeyboardOpen ? 'keyboard-open' : 'keyboard-closed'}</span>
}

function installVisualViewport({
  height,
  width = 390,
}: {
  height: number
  width?: number
}) {
  const listeners = new Map<string, Set<() => void>>()
  const visualViewport = {
    height,
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

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 800,
  })
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
    setMetrics(nextMetrics: { height?: number; width?: number }) {
      visualViewport.height = nextMetrics.height ?? visualViewport.height
      visualViewport.width = nextMetrics.width ?? visualViewport.width
    },
  }
}

describe('useVisualViewportKeyboardOpen', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects a mobile keyboard from the visual viewport height delta', () => {
    const viewport = installVisualViewport({ height: 800 })

    render(<KeyboardStateProbe />)

    expect(screen.getByText('keyboard-closed')).toBeInTheDocument()

    act(() => {
      viewport.setMetrics({ height: 560 })
      viewport.fire('resize')
    })

    expect(screen.getByText('keyboard-open')).toBeInTheDocument()
  })

  it('keeps detecting the keyboard when iOS shrinks innerHeight too', () => {
    const viewport = installVisualViewport({ height: 780 })

    render(<KeyboardStateProbe />)

    expect(screen.getByText('keyboard-closed')).toBeInTheDocument()

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 540,
    })

    act(() => {
      viewport.setMetrics({ height: 540 })
      viewport.fire('resize')
    })

    expect(screen.getByText('keyboard-open')).toBeInTheDocument()
  })

  it('resets the baseline when visual viewport width changes significantly', () => {
    const viewport = installVisualViewport({ height: 780, width: 390 })

    render(<KeyboardStateProbe />)

    act(() => {
      viewport.setMetrics({ height: 540 })
      viewport.fire('resize')
    })

    expect(screen.getByText('keyboard-open')).toBeInTheDocument()

    act(() => {
      viewport.setMetrics({ height: 540, width: 740 })
      viewport.fire('resize')
    })

    expect(screen.getByText('keyboard-closed')).toBeInTheDocument()
  })
})
