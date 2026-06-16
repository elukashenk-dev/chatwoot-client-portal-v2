import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithRouter } from '../test/renderWithRouter'
import { AppRoutes } from './AppRoutes'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('legal routes', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it.each([
    ['/legal/terms', 'Пользовательское соглашение'],
    ['/legal/privacy', 'Политика обработки персональных данных'],
  ])('renders %s without an authenticated session', async (path, heading) => {
    renderWithRouter(<AppRoutes />, { initialEntries: [path] })

    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
  })

  it('keeps legal pages reachable when a customer session exists', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          tenant: { id: 'tenant-demo', name: 'Demo' },
          user: { email: 'user@example.com', id: 'user-demo', name: 'User' },
        },
        200,
      ),
    )

    renderWithRouter(<AppRoutes />, {
      initialEntries: ['/legal/privacy'],
    })

    expect(
      await screen.findByRole('heading', {
        name: 'Политика обработки персональных данных',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Чат поддержки')).not.toBeInTheDocument()
  })
})
