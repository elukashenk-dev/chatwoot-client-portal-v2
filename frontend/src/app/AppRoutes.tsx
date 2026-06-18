import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminProtectedRoute } from './layouts/AdminProtectedRoute'
import { AdminPublicRoute } from './layouts/AdminPublicRoute'
import { AdminSessionBoundary } from './layouts/AdminSessionBoundary'
import { AppShellLayout } from './layouts/AppShellLayout'
import { CustomerAuthBoundary } from './layouts/CustomerAuthBoundary'
import { ProtectedRoute } from './layouts/ProtectedRoute'
import { PublicAuthRoute } from './layouts/PublicAuthRoute'
import { routePaths } from './routePaths'
import { ChatPage } from '../features/chat/pages/ChatPage'

function lazyRouteComponent<TProps extends object>(
  loadComponent: () => Promise<ComponentType<TProps>>,
) {
  return lazy(async () => ({
    default: await loadComponent(),
  }))
}

const LoginPage = lazyRouteComponent(() =>
  import('../features/auth/pages/LoginPage').then((module) => module.LoginPage),
)
const RegisterRequestPage = lazyRouteComponent(() =>
  import('../features/auth/pages/RegisterRequestPage').then(
    (module) => module.RegisterRequestPage,
  ),
)
const RegisterVerifyPage = lazyRouteComponent(() =>
  import('../features/auth/pages/RegisterVerifyPage').then(
    (module) => module.RegisterVerifyPage,
  ),
)
const RegisterSetPasswordPage = lazyRouteComponent(() =>
  import('../features/auth/pages/RegisterSetPasswordPage').then(
    (module) => module.RegisterSetPasswordPage,
  ),
)
const PasswordResetRequestPage = lazyRouteComponent(() =>
  import('../features/auth/pages/PasswordResetRequestPage').then(
    (module) => module.PasswordResetRequestPage,
  ),
)
const PasswordResetVerifyPage = lazyRouteComponent(() =>
  import('../features/auth/pages/PasswordResetVerifyPage').then(
    (module) => module.PasswordResetVerifyPage,
  ),
)
const PasswordResetSetPasswordPage = lazyRouteComponent(() =>
  import('../features/auth/pages/PasswordResetSetPasswordPage').then(
    (module) => module.PasswordResetSetPasswordPage,
  ),
)
const SettingsPage = lazyRouteComponent(() =>
  import('../features/settings/pages/SettingsPage').then(
    (module) => module.SettingsPage,
  ),
)
const UserNotificationsPage = lazyRouteComponent(() =>
  import('../features/settings/pages/UserNotificationsPage').then(
    (module) => module.UserNotificationsPage,
  ),
)
const UserProfilePage = lazyRouteComponent(() =>
  import('../features/profile/pages/UserProfilePage').then(
    (module) => module.UserProfilePage,
  ),
)
const AdminLoginPage = lazyRouteComponent(() =>
  import('../features/admin-auth/pages/AdminLoginPage').then(
    (module) => module.AdminLoginPage,
  ),
)
const AdminBrandingPage = lazyRouteComponent(() =>
  import('../features/admin-shell/pages/AdminBrandingPage').then(
    (module) => module.AdminBrandingPage,
  ),
)
const LegalDocumentPage = lazyRouteComponent(() =>
  import('../features/legal/pages/LegalDocumentPage').then(
    (module) => module.LegalDocumentPage,
  ),
)

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routePaths.root}
        element={<Navigate replace to={routePaths.auth.login} />}
      />

      <Route
        path={routePaths.legal.terms}
        element={
          <LazyRoute>
            <LegalDocumentPage document="terms" />
          </LazyRoute>
        }
      />
      <Route
        path={routePaths.legal.privacy}
        element={
          <LazyRoute>
            <LegalDocumentPage document="privacy" />
          </LazyRoute>
        }
      />

      <Route element={<CustomerAuthBoundary />}>
        <Route path="/auth" element={<PublicAuthRoute />}>
          <Route
            path="login"
            element={
              <LazyRoute>
                <LoginPage />
              </LazyRoute>
            }
          />
          <Route
            path="register"
            element={
              <LazyRoute>
                <RegisterRequestPage />
              </LazyRoute>
            }
          />
          <Route
            path="register/verify"
            element={
              <LazyRoute>
                <RegisterVerifyPage />
              </LazyRoute>
            }
          />
          <Route
            path="register/set-password"
            element={
              <LazyRoute>
                <RegisterSetPasswordPage />
              </LazyRoute>
            }
          />
          <Route
            path="password-reset/request"
            element={
              <LazyRoute>
                <PasswordResetRequestPage />
              </LazyRoute>
            }
          />
          <Route
            path="password-reset/verify"
            element={
              <LazyRoute>
                <PasswordResetVerifyPage />
              </LazyRoute>
            }
          />
          <Route
            path="password-reset/set-password"
            element={
              <LazyRoute>
                <PasswordResetSetPasswordPage />
              </LazyRoute>
            }
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppShellLayout />}>
            <Route
              index
              element={<Navigate replace to={routePaths.app.chat} />}
            />
            <Route path="chat" element={<ChatPage />} />
            <Route
              path="profile"
              element={
                <LazyRoute>
                  <UserProfilePage />
                </LazyRoute>
              }
            />
            <Route
              path="settings"
              element={
                <LazyRoute>
                  <SettingsPage />
                </LazyRoute>
              }
            />
            <Route
              path="settings/notifications"
              element={
                <LazyRoute>
                  <UserNotificationsPage />
                </LazyRoute>
              }
            />
          </Route>
        </Route>
      </Route>

      <Route element={<AdminSessionBoundary />}>
        <Route element={<AdminPublicRoute />}>
          <Route
            path={routePaths.admin.login}
            element={
              <LazyRoute>
                <AdminLoginPage />
              </LazyRoute>
            }
          />
        </Route>

        <Route element={<AdminProtectedRoute />}>
          <Route
            path={routePaths.admin.root}
            element={<Navigate replace to={routePaths.admin.branding} />}
          />
          <Route
            path={routePaths.admin.branding}
            element={
              <LazyRoute>
                <AdminBrandingPage />
              </LazyRoute>
            }
          />
          <Route
            path="/admin/*"
            element={<Navigate replace to={routePaths.admin.branding} />}
          />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate replace to={routePaths.auth.login} />}
      />
    </Routes>
  )
}
