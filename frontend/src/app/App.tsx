import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { BrandingProvider } from '../features/branding/lib/BrandingProvider'
import { TenantProvider } from '../features/tenant/lib/TenantProvider'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <BrandingProvider>
          <PwaUpdateBanner />
          <AppRoutes />
        </BrandingProvider>
      </TenantProvider>
    </BrowserRouter>
  )
}

export default App
