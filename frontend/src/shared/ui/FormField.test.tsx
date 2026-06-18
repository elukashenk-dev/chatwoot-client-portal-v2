import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FormField } from './FormField'

describe('FormField', () => {
  it('renders auth field errors in the lightweight message style', () => {
    render(
      <FormField
        error="Проверьте формат email"
        errorId="email-error"
        htmlFor="email"
        label="Email"
      >
        <input id="email" />
      </FormField>,
    )

    const errorMessage = screen
      .getByText('Проверьте формат email')
      .closest('.auth-field-message')

    if (!errorMessage) {
      throw new Error('Expected auth field error message wrapper')
    }

    expect(errorMessage).toHaveAttribute('role', 'alert')
    expect(errorMessage).toHaveClass('auth-field-message')
    expect(errorMessage).not.toHaveClass('text-rose-600')
    expect(
      errorMessage.querySelector('.auth-field-message__icon'),
    ).toBeInTheDocument()
  })
})
