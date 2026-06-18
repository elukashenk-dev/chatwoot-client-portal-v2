import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PasswordField } from './PasswordField'
import { TextField } from './TextField'
import { inputClassName } from './inputStyles'

describe('auth input error states', () => {
  it('tints text field leading icons when the field is invalid', () => {
    render(
      <TextField
        aria-invalid="true"
        aria-label="Email"
        hasError
        leadingIcon={<span data-testid="mail-icon" />}
      />,
    )

    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByTestId('mail-icon').parentElement).toHaveClass(
      'auth-field-icon--error',
    )
  })

  it('tints password field leading icons when the field is invalid', () => {
    render(
      <PasswordField
        aria-invalid="true"
        aria-label="Пароль"
        hasError
        leadingIcon={<span data-testid="lock-icon" />}
      />,
    )

    expect(screen.getByLabelText('Пароль')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByTestId('lock-icon').parentElement).toHaveClass(
      'auth-field-icon--error',
    )
  })

  it('uses the auth control border variable for normal and disabled inputs', () => {
    const className = inputClassName(false)

    expect(className).toContain('--portal-auth-control-border-color')
    expect(className).not.toContain('disabled:border-[#DDDFE4]')
    expect(className).not.toContain('border-[#DDDFE4]')
  })

  it('keeps leading icons above branded field surfaces', () => {
    render(
      <TextField
        aria-label="Email"
        leadingIcon={<span data-testid="mail-icon" />}
      />,
    )

    expect(screen.getByTestId('mail-icon').parentElement).toHaveClass('z-10')
  })
})
