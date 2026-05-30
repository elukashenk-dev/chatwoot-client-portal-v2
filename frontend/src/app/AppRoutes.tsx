import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShellLayout } from './layouts/AppShellLayout'
import { ProtectedRoute } from './layouts/ProtectedRoute'
import { PublicAuthRoute } from './layouts/PublicAuthRoute'
import { routePaths } from './routePaths'
import { useTenantIdentity } from '../features/tenant/lib/useTenantIdentity'
import { createStartupSurfaceBrand } from '../features/tenant/startup/startupSurfaceBrand'
import { useStartupSurfaceReport } from '../features/tenant/startup/startupSurfaceContext'

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

function RouteChunkStartupFallback() {
  const { tenant } = useTenantIdentity()

  useStartupSurfaceReport({
    active: true,
    ...createStartupSurfaceBrand(tenant),
    description: 'Загружаем экран.',
    phase: 'route',
    statusLabel: 'Загружаем экран',
    title: 'Открываем кабинет',
  })

  return null
}

function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteChunkStartupFallback />}>{children}</Suspense>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routePaths.root}
        element={<Navigate replace to={routePaths.auth.login} />}
      />

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
          <Route
            path="chat"
            element={
              <LazyRoute>
                <ChatPage />
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

      <Route
        path="*"
        element={<Navigate replace to={routePaths.auth.login} />}
      />
    </Routes>
  )
}
