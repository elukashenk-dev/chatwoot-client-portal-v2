import { BrowserRouter, useLocation } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { routePaths } from './routePaths'
import { BrandingProvider } from '../features/branding/lib/BrandingProvider'
import { TenantProvider } from '../features/tenant/lib/TenantProvider'
import {
  PwaInstallPromptCapture,
  PwaInstallPromptProvider,
} from '../pwa/installPromptRuntime'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function isPublicLegalRoute(pathname: string) {
  return (
    pathname === routePaths.legal.terms || pathname === routePaths.legal.privacy
  )
}

function PublicLegalApp() {
  return (
    <BrandingProvider loadWithoutTenant>
      <AppRoutes />
    </BrandingProvider>
  )
}

function TenantScopedApp() {
  return (
    <>
      <PwaInstallPromptCapture />
      <TenantProvider>
        <PwaInstallPromptProvider>
          <BrandingProvider>
            <PwaUpdateBanner />
            <AppRoutes />
          </BrandingProvider>
        </PwaInstallPromptProvider>
      </TenantProvider>
    </>
  )
}

function AppContent() {
  const location = useLocation()

  return isPublicLegalRoute(location.pathname) ? (
    <PublicLegalApp />
  ) : (
    <TenantScopedApp />
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
