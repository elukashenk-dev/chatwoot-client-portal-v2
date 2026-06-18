import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthLegalNotice } from './AuthLegalNotice'

describe('AuthLegalNotice', () => {
  it('renders public legal document links outside preview mode', () => {
    render(
      <MemoryRouter>
        <AuthLegalNotice />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: 'Пользовательское соглашение' }),
    ).toHaveAttribute('href', '/legal/terms')
    expect(
      screen.getByRole('link', {
        name: 'Политикой обработки персональных данных',
      }),
    ).toHaveAttribute('href', '/legal/privacy')
  })

  it('renders inert legal labels in preview mode', () => {
    render(
      <MemoryRouter>
        <AuthLegalNotice preview />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Пользовательское соглашение')).toHaveClass(
      'auth-legal-preview-link',
    )
    expect(
      screen.getByText('Политикой обработки персональных данных'),
    ).toHaveClass('auth-legal-preview-link')
  })
})
