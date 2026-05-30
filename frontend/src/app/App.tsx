import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { AuthSessionProvider } from '../features/auth/lib/AuthSessionProvider'
import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../features/tenant/startup/StartupSurfaceProvider'
import { TenantProvider } from '../features/tenant/lib/TenantProvider'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function App() {
  return (
    <BrowserRouter>
      <StartupSurfaceProvider>
        <TenantProvider>
          <AuthSessionProvider>
            <PwaUpdateBanner />
            <AppRoutes />
          </AuthSessionProvider>
        </TenantProvider>
        <StartupSurfaceOverlay />
      </StartupSurfaceProvider>
    </BrowserRouter>
  )
}

export default App
