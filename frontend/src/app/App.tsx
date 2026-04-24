import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { AuthSessionProvider } from '../features/auth/lib/AuthSessionProvider'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function App() {
  return (
    <BrowserRouter>
      <AuthSessionProvider>
        <PwaUpdateBanner />
        <AppRoutes />
      </AuthSessionProvider>
    </BrowserRouter>
  )
}

export default App
