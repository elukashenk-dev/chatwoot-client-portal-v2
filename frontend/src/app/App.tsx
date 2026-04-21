import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { AuthSessionProvider } from '../features/auth/lib/AuthSessionProvider'

function App() {
  return (
    <BrowserRouter>
      <AuthSessionProvider>
        <AppRoutes />
      </AuthSessionProvider>
    </BrowserRouter>
  )
}

export default App
