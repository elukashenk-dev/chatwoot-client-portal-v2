import type { ReactElement } from 'react'
import type { InitialEntry } from 'react-router-dom'

import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

type RenderWithRouterOptions = {
  initialEntries?: InitialEntry[]
}

export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ['/auth/login'] }: RenderWithRouterOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
  )
}
