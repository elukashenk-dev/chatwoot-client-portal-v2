import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InlineAlert } from './InlineAlert'

describe('InlineAlert', () => {
  it('renders auth form errors without the old card treatment', () => {
    render(<InlineAlert message="Неверный email или пароль." tone="error" />)

    const message = screen.getByRole('alert')

    expect(message).toHaveClass('auth-form-message')
    expect(message).toHaveClass('auth-form-message--error')
    expect(message).not.toHaveClass('border-[#f1d2d8]')
    expect(message).not.toHaveClass('bg-[#fff9f9]/90')
    expect(
      message.querySelector('.auth-form-message__icon'),
    ).toBeInTheDocument()
  })

  it('keeps status semantics and tone classes for info and success messages', () => {
    const { rerender } = render(
      <InlineAlert message="Проверяем текущую сессию..." tone="info" />,
    )

    expect(screen.getByRole('status')).toHaveClass('auth-form-message--info')

    rerender(<InlineAlert message="Новый код отправлен." tone="success" />)

    expect(screen.getByRole('status')).toHaveClass(
      'auth-form-message--success',
    )
  })

  it('keeps support phone numbers clickable inside auth messages', () => {
    render(
      <InlineAlert
        message="Обратитесь по телефону +7 (800) 000-00-00."
        tone="error"
      />,
    )

    expect(
      screen.getByRole('link', { name: '+7 (800) 000-00-00' }),
    ).toHaveAttribute('href', 'tel:+78000000000')
  })
})
