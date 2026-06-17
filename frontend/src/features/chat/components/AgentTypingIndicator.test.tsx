import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AgentTypingIndicator } from './AgentTypingIndicator'

describe('AgentTypingIndicator', () => {
  it('keeps the animated slot mounted while hidden so height can collapse smoothly', () => {
    const { rerender } = render(
      <AgentTypingIndicator isVisible={false} shouldAnimatePresence />,
    )

    const slot = screen.getByTestId('agent-typing-indicator-slot')

    expect(slot).toHaveClass('bg-transparent', 'h-0', 'opacity-0')
    expect(
      screen.queryByRole('status', { name: 'Идет набор сообщения' }),
    ).not.toBeInTheDocument()

    rerender(<AgentTypingIndicator isVisible shouldAnimatePresence />)

    expect(
      screen.getByRole('status', { name: 'Идет набор сообщения' }),
    ).toBeVisible()
    expect(slot).toHaveClass('h-0', 'overflow-visible', 'opacity-100')
  })

  it('renders dots as a compact transparent overlay instead of a full-width strip', () => {
    render(<AgentTypingIndicator isVisible />)

    const slot = screen.getByTestId('agent-typing-indicator-slot')
    const dots = screen.getByTestId('agent-typing-indicator-dots')

    expect(slot).toHaveClass('h-0', 'overflow-visible', 'bg-transparent')
    expect(dots).toHaveClass('w-fit', '-translate-y-6', 'bg-transparent')
    expect(dots).not.toHaveClass('w-full')
    for (const dot of dots.querySelectorAll('span')) {
      expect(dot).toHaveClass(
        'bg-[color:var(--color-chat-outgoing,#465a72)]',
        'opacity-70',
      )
    }
  })

  it('keeps instant hide behavior when animated presence is disabled', () => {
    const { container } = render(<AgentTypingIndicator isVisible={false} />)

    expect(container).toBeEmptyDOMElement()
  })
})
