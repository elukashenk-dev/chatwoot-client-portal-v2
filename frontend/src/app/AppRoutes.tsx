import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShellLayout } from './layouts/AppShellLayout'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { PasswordResetRequestPage } from '../features/auth/pages/PasswordResetRequestPage'
import { PasswordResetSetPasswordPage } from '../features/auth/pages/PasswordResetSetPasswordPage'
import { PasswordResetVerifyPage } from '../features/auth/pages/PasswordResetVerifyPage'
import { RegisterRequestPage } from '../features/auth/pages/RegisterRequestPage'
import { RegisterSetPasswordPage } from '../features/auth/pages/RegisterSetPasswordPage'
import { RegisterVerifyPage } from '../features/auth/pages/RegisterVerifyPage'
import { ChatPage } from '../features/chat/pages/ChatPage'
import { ProtectedRoute } from './layouts/ProtectedRoute'
import { PublicAuthRoute } from './layouts/PublicAuthRoute'
import { routePaths } from './routePaths'

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routePaths.root}
        element={<Navigate replace to={routePaths.auth.login} />}
      />

      <Route path="/auth" element={<PublicAuthRoute />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterRequestPage />} />
        <Route path="register/verify" element={<RegisterVerifyPage />} />
        <Route
          path="register/set-password"
          element={<RegisterSetPasswordPage />}
        />
        <Route
          path="password-reset/request"
          element={<PasswordResetRequestPage />}
        />
        <Route
          path="password-reset/verify"
          element={<PasswordResetVerifyPage />}
        />
        <Route
          path="password-reset/set-password"
          element={<PasswordResetSetPasswordPage />}
        />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShellLayout />}>
          <Route
            index
            element={<Navigate replace to={routePaths.app.chat} />}
          />
          <Route path="chat" element={<ChatPage />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate replace to={routePaths.auth.login} />}
      />
    </Routes>
  )
}
