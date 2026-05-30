import type { ReactElement } from 'react'

import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../features/tenant/startup/StartupSurfaceProvider'

type RenderWithRouterOptions = {
  initialEntries?: string[]
}

export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ['/auth/login'] }: RenderWithRouterOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <StartupSurfaceProvider>
        {ui}
        <StartupSurfaceOverlay />
      </StartupSurfaceProvider>
    </MemoryRouter>,
  )
}
