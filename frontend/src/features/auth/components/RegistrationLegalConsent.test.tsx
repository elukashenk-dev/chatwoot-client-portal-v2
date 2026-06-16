import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { RegistrationLegalConsent } from './RegistrationLegalConsent'

function renderConsent({
  disabled = false,
  onChange = vi.fn(),
  personalDataConsentAccepted = false,
  termsAccepted = false,
}: {
  disabled?: boolean
  onChange?: (value: {
    personalDataConsentAccepted: boolean
    termsAccepted: boolean
  }) => void
  personalDataConsentAccepted?: boolean
  termsAccepted?: boolean
} = {}) {
  render(
    <MemoryRouter>
      <RegistrationLegalConsent
        disabled={disabled}
        onChange={onChange}
        value={{
          personalDataConsentAccepted,
          termsAccepted,
        }}
      />
    </MemoryRouter>,
  )

  return { onChange }
}

describe('RegistrationLegalConsent', () => {
  it('renders separate legal acceptance controls with public document links', () => {
    renderConsent()

    expect(
      screen.getByRole('checkbox', {
        name: /Я принимаю Пользовательское соглашение/i,
      }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', {
        name: /Я даю согласие на обработку персональных данных/i,
      }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('link', { name: 'Пользовательское соглашение' }),
    ).toHaveAttribute('href', '/legal/terms')
    expect(
      screen.getByRole('link', {
        name: 'Политикой обработки персональных данных',
      }),
    ).toHaveAttribute('href', '/legal/privacy')
  })

  it('updates only the checkbox value changed by the user', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderConsent({
      onChange,
      personalDataConsentAccepted: false,
      termsAccepted: false,
    })

    await user.click(
      screen.getByRole('checkbox', {
        name: /Я принимаю Пользовательское соглашение/i,
      }),
    )
    await user.click(
      screen.getByRole('checkbox', {
        name: /Я даю согласие на обработку персональных данных/i,
      }),
    )

    expect(onChange).toHaveBeenNthCalledWith(1, {
      personalDataConsentAccepted: false,
      termsAccepted: true,
    })
    expect(onChange).toHaveBeenNthCalledWith(2, {
      personalDataConsentAccepted: true,
      termsAccepted: false,
    })
  })

  it('does not emit consent changes while the form is disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderConsent({
      disabled: true,
      onChange,
      personalDataConsentAccepted: true,
      termsAccepted: true,
    })

    const terms = screen.getByRole('checkbox', {
      name: /Я принимаю Пользовательское соглашение/i,
    })
    const personalData = screen.getByRole('checkbox', {
      name: /Я даю согласие на обработку персональных данных/i,
    })

    expect(terms).toBeDisabled()
    expect(personalData).toBeDisabled()

    await user.click(terms)
    await user.click(personalData)

    expect(onChange).not.toHaveBeenCalled()
  })
})
