import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { TenantProvider } from '../features/tenant/lib/TenantProvider'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <PwaUpdateBanner />
        <AppRoutes />
      </TenantProvider>
    </BrowserRouter>
  )
}

export default App
