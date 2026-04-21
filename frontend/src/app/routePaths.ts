export const routePaths = {
  root: '/',
  app: {
    chat: '/app/chat',
    root: '/app',
  },
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    registerSetPassword: '/auth/register/set-password',
    registerVerify: '/auth/register/verify',
    passwordResetRequest: '/auth/password-reset/request',
    passwordResetSetPassword: '/auth/password-reset/set-password',
    passwordResetVerify: '/auth/password-reset/verify',
  },
} as const
