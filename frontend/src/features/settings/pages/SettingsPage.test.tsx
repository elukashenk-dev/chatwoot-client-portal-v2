import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SettingsPage } from './SettingsPage'

function CurrentPath() {
  const location = useLocation()

  return <output aria-label="current path">{location.pathname}</output>
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/app/settings']}>
      <SettingsPage />
      <CurrentPath />
    </MemoryRouter>,
  )
}

describe('SettingsPage', () => {
  it('renders settings navigation on the shared chat glass surface', async () => {
    const user = userEvent.setup()

    renderPage()

    const notificationsButton = screen.getByRole('button', {
      name: /Уведомления/,
    })

    expect(notificationsButton).toHaveClass('chat-glass-card-surface')
    expect(notificationsButton).not.toHaveClass('bg-white')

    await user.click(notificationsButton)

    expect(screen.getByLabelText('current path')).toHaveTextContent(
      '/app/settings/notifications',
    )
  })
})
