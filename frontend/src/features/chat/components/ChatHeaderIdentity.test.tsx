import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatHeaderIdentity } from './ChatHeaderIdentity'

describe('ChatHeaderIdentity', () => {
  it('renders the shared chat header avatar, title, and presence copy', () => {
    render(
      <ChatHeaderIdentity
        avatarFallback="PG"
        avatarUrl="/api/branding/assets/11?v=11"
        presenceLabel="На связи"
        presenceTone="online"
        subtitle="Вы и поддержка"
        title="Личный чат"
      />,
    )

    expect(screen.getByRole('img', { name: 'Личный чат' })).toHaveAttribute(
      'src',
      '/api/branding/assets/11?v=11',
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Личный чат' }),
    ).toHaveClass('text-[color:var(--portal-chat-header-foreground,#0f172a)]')
    expect(screen.getByText('На связи')).toBeInTheDocument()
    expect(screen.getByText('Вы и поддержка')).toBeInTheDocument()
  })

  it('can keep preview title typography fixed inside embedded phone previews', () => {
    render(
      <ChatHeaderIdentity
        avatarFallback="PG"
        presenceLabel="На связи"
        presenceTone="online"
        subtitle="Вы и поддержка"
        title="Личный чат"
        useResponsiveTitle={false}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Личный чат' }),
    ).not.toHaveClass('sm:text-[17px]')
  })
})
