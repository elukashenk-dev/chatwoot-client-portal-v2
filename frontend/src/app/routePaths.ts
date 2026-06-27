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
    codeLoginRequest: '/auth/login',
    codeLoginLegal: '/auth/login/legal',
    codeLoginVerify: '/auth/login/verify',
    login: '/auth/login',
    passwordLogin: '/auth/login/password',
    passwordResetRequest: '/auth/password-reset/request',
    passwordResetSetPassword: '/auth/password-reset/set-password',
    passwordResetVerify: '/auth/password-reset/verify',
  },
  legal: {
    privacy: '/legal/privacy',
    terms: '/legal/terms',
  },
} as const
