import type { ReactElement } from 'react'

import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

type RenderWithRouterOptions = {
  initialEntries?: string[]
}

export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ['/auth/login'] }: RenderWithRouterOptions = {},
) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)
}
