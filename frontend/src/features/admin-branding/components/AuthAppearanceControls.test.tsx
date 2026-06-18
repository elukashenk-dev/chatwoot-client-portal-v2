import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BrandingAppearance } from '../api/adminBrandingClient'
import { AuthAppearanceControls } from './AuthAppearanceControls'

const appearance = {
  authBackgroundOverlay: 'none',
  authButtonStyle: 'solid',
  authColorScheme: 'light',
  authFieldStyle: 'solid',
} satisfies BrandingAppearance

describe('AuthAppearanceControls', () => {
  it('renders the current full background appearance selections', () => {
    render(
      <AuthAppearanceControls
        disabled={false}
        onChange={vi.fn()}
        value={{
          authBackgroundOverlay: 'dark',
          authButtonStyle: 'gradient',
          authColorScheme: 'dark',
          authFieldStyle: 'outline',
        }}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Темная' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Темная дымка' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Контур' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Градиент' })).toBeChecked()
  })

  it('emits the changed appearance key and value for each segmented group', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <AuthAppearanceControls
        disabled={false}
        onChange={onChange}
        value={appearance}
      />,
    )

    await user.click(screen.getByText('Темная'))
    await user.click(screen.getByText('Светлая дымка'))
    await user.click(screen.getByText('Контур'))
    await user.click(screen.getByText('Градиент'))

    expect(onChange).toHaveBeenNthCalledWith(1, 'authColorScheme', 'dark')
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      'authBackgroundOverlay',
      'light',
    )
    expect(onChange).toHaveBeenNthCalledWith(3, 'authFieldStyle', 'outline')
    expect(onChange).toHaveBeenNthCalledWith(4, 'authButtonStyle', 'gradient')
  })

  it('locks all appearance controls while branding settings are saving', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <AuthAppearanceControls
        disabled={true}
        onChange={onChange}
        value={appearance}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Темная' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Темная дымка' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Контур' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Градиент' })).toBeDisabled()

    await user.click(screen.getByText('Темная'))

    expect(onChange).not.toHaveBeenCalled()
  })
})
