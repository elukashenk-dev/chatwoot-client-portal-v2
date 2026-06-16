import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithRouter } from '../test/renderWithRouter'
import { AppRoutes } from './AppRoutes'

describe('legal routes', () => {
  it.each([
    ['/legal/terms', 'Пользовательское соглашение'],
    ['/legal/privacy', 'Политика обработки персональных данных'],
  ])('renders %s without auth redirects', async (path, heading) => {
    renderWithRouter(<AppRoutes />, { initialEntries: [path] })

    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Вернуться ко входу' }),
    ).toHaveAttribute('href', '/auth/login')
  })
})
