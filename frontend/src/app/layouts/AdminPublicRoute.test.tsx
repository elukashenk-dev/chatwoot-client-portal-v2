import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { renderWithRouter } from '../../test/renderWithRouter'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
} from '../../features/admin-auth/lib/adminSessionContext'
import { AdminPublicRoute } from './AdminPublicRoute'

function renderAdminPublicRoute(session: AdminSessionContextValue) {
  renderWithRouter(
    <AdminSessionContext.Provider value={session}>
      <Routes>
        <Route element={<AdminPublicRoute />}>
          <Route path="/admin/login" element={<h1>Admin login</h1>} />
        </Route>
        <Route path="/admin/branding" element={<h1>Branding</h1>} />
      </Routes>
    </AdminSessionContext.Provider>,
    { initialEntries: ['/admin/login'] },
  )
}

describe('AdminPublicRoute', () => {
  it('keeps a full-viewport auth canvas mounted while checking admin session', () => {
    renderAdminPublicRoute({
      admin: null,
      errorMessage: null,
      refreshSession: vi.fn(),
      setVerifiedSession: vi.fn(),
      signOut: vi.fn(),
      status: 'checking',
    })

    const canvas = document.querySelector('.auth-canvas-background')

    expect(canvas).toBeInTheDocument()
    expect(canvas).toHaveClass('app-shell-viewport')
    expect(screen.queryByRole('heading', { name: 'Admin login' })).toBeNull()
    expect(screen.queryByText('Проверяем сессию')).not.toBeInTheDocument()
  })
})
