import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminProtectedRoute } from './layouts/AdminProtectedRoute'
import { AdminPublicRoute } from './layouts/AdminPublicRoute'
import { AdminSessionBoundary } from './layouts/AdminSessionBoundary'
import { AppShellLayout } from './layouts/AppShellLayout'
import { AuthStartupCanvas } from './layouts/AuthStartupSurface'
import { CustomerAuthBoundary } from './layouts/CustomerAuthBoundary'
import { ProtectedRoute } from './layouts/ProtectedRoute'
import { PublicAuthRoute } from './layouts/PublicAuthRoute'
import { routePaths } from './routePaths'

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
const PasswordLoginPage = lazyRouteComponent(() =>
  import('../features/auth/pages/PasswordLoginPage').then(
    (module) => module.PasswordLoginPage,
  ),
)
const LegalConsentPage = lazyRouteComponent(() =>
  import('../features/auth/pages/LegalConsentPage').then(
    (module) => module.LegalConsentPage,
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
const PasswordlessLoginVerifyPage = lazyRouteComponent(() =>
  import('../features/auth/pages/PasswordlessLoginVerifyPage').then(
    (module) => module.PasswordlessLoginVerifyPage,
  ),
)
const ChatPage = lazyRouteComponent(() =>
  import('../features/chat/pages/ChatPage').then((module) => module.ChatPage),
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
const AdminTelegramBridgePage = lazyRouteComponent(() =>
  import('../features/admin-shell/pages/AdminTelegramBridgePage').then(
    (module) => module.AdminTelegramBridgePage,
  ),
)
const LegalDocumentPage = lazyRouteComponent(() =>
  import('../features/legal/pages/LegalDocumentPage').then(
    (module) => module.LegalDocumentPage,
  ),
)

function LazyRoute({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return <Suspense fallback={fallback}>{children}</Suspense>
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
              <LazyRoute fallback={<AuthStartupCanvas />}>
                <LoginPage />
              </LazyRoute>
            }
          />
          <Route
            path="login/password"
            element={
              <LazyRoute fallback={<AuthStartupCanvas />}>
                <PasswordLoginPage />
              </LazyRoute>
            }
          />
          <Route
            path="login/verify"
            element={
              <LazyRoute fallback={<AuthStartupCanvas />}>
                <PasswordlessLoginVerifyPage />
              </LazyRoute>
            }
          />
          <Route
            path="login/legal"
            element={
              <LazyRoute fallback={<AuthStartupCanvas />}>
                <LegalConsentPage />
              </LazyRoute>
            }
          />
          <Route
            path="password-reset/request"
            element={
              <LazyRoute fallback={<AuthStartupCanvas />}>
                <PasswordResetRequestPage />
              </LazyRoute>
            }
          />
          <Route
            path="password-reset/verify"
            element={
              <LazyRoute fallback={<AuthStartupCanvas />}>
                <PasswordResetVerifyPage />
              </LazyRoute>
            }
          />
          <Route
            path="password-reset/set-password"
            element={
              <LazyRoute fallback={<AuthStartupCanvas />}>
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
            <Route
              path="chat"
              element={
                <LazyRoute>
                  <ChatPage />
                </LazyRoute>
              }
            />
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
              <LazyRoute fallback={<AuthStartupCanvas fillViewport />}>
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
            path={routePaths.admin.telegramBridge}
            element={
              <LazyRoute>
                <AdminTelegramBridgePage />
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
