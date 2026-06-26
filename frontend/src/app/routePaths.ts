export const routePaths = {
  root: '/',
  admin: {
    branding: '/admin/branding',
    login: '/admin/login',
    root: '/admin',
    telegramBridge: '/admin/integrations/telegram-bridge',
  },
  app: {
    chat: '/app/chat',
    profile: '/app/profile',
    root: '/app',
    settings: '/app/settings',
    settingsNotifications: '/app/settings/notifications',
  },
  auth: {
    codeLoginRequest: '/auth/code-login/request',
    codeLoginVerify: '/auth/code-login/verify',
    login: '/auth/login',
    register: '/auth/register',
    registerSetPassword: '/auth/register/set-password',
    registerVerify: '/auth/register/verify',
    passwordResetRequest: '/auth/password-reset/request',
    passwordResetSetPassword: '/auth/password-reset/set-password',
    passwordResetVerify: '/auth/password-reset/verify',
  },
  legal: {
    privacy: '/legal/privacy',
    terms: '/legal/terms',
  },
} as const
