import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { AuthSessionProvider } from '../features/auth/lib/AuthSessionProvider'
import { TenantProvider } from '../features/tenant/lib/TenantProvider'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <AuthSessionProvider>
          <PwaUpdateBanner />
          <AppRoutes />
        </AuthSessionProvider>
      </TenantProvider>
    </BrowserRouter>
  )
}

export default App
