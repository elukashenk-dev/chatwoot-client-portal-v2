import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useVisualViewportKeyboardOpen } from './useVisualViewportKeyboardOpen'

function KeyboardStateProbe() {
  const isKeyboardOpen = useVisualViewportKeyboardOpen()

  return <span>{isKeyboardOpen ? 'keyboard-open' : 'keyboard-closed'}</span>
}

function installVisualViewport(height: number) {
  const listeners = new Map<string, Set<() => void>>()
  const visualViewport = {
    height,
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
    setHeight(nextHeight: number) {
      visualViewport.height = nextHeight
    },
  }
}

describe('useVisualViewportKeyboardOpen', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects a mobile keyboard from the visual viewport height delta', () => {
    const viewport = installVisualViewport(800)

    render(<KeyboardStateProbe />)

    expect(screen.getByText('keyboard-closed')).toBeInTheDocument()

    act(() => {
      viewport.setHeight(560)
      viewport.fire('resize')
    })

    expect(screen.getByText('keyboard-open')).toBeInTheDocument()
  })
})
