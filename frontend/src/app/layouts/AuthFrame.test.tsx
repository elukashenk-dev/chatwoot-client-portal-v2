import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthFrame } from './AuthFrame'

function mockScrollMetrics({
  clientHeight,
  scrollHeight,
}: {
  clientHeight: number
  scrollHeight: number
}) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    function getClientHeight(this: HTMLElement) {
      return this.classList.contains('auth-frame-scroll-area')
        ? clientHeight
        : 0
    },
  )
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
    function getScrollHeight(this: HTMLElement) {
      return this.classList.contains('auth-frame-scroll-area')
        ? scrollHeight
        : 0
    },
  )
}

describe('AuthFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides zero-overflow auth pages so they do not become mobile scroll targets', async () => {
    mockScrollMetrics({ clientHeight: 800, scrollHeight: 800 })

    const { container } = render(
      <AuthFrame>
        <span>auth content</span>
      </AuthFrame>,
    )
    const scrollArea = container.querySelector('.auth-frame-scroll-area')

    expect(scrollArea).toHaveAttribute('data-tiny-overflow', 'true')
  })

  it('hides tiny internal overflow that only creates mobile scroll jitter', async () => {
    mockScrollMetrics({ clientHeight: 800, scrollHeight: 805 })

    const { container } = render(
      <AuthFrame>
        <span>auth content</span>
      </AuthFrame>,
    )
    const scrollArea = container.querySelector('.auth-frame-scroll-area')

    expect(scrollArea).toHaveAttribute('data-tiny-overflow', 'true')
  })

  it('keeps real overflowing auth pages scrollable', async () => {
    mockScrollMetrics({ clientHeight: 800, scrollHeight: 860 })

    const { container } = render(
      <AuthFrame>
        <span>long auth content</span>
      </AuthFrame>,
    )
    const scrollArea = container.querySelector('.auth-frame-scroll-area')

    expect(scrollArea).not.toHaveAttribute('data-tiny-overflow')
  })
})
