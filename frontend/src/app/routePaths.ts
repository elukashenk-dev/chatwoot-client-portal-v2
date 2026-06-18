export const routePaths = {
  root: '/',
  admin: {
    branding: '/admin/branding',
    login: '/admin/login',
    root: '/admin',
  },
  app: {
    chat: '/app/chat',
    profile: '/app/profile',
    root: '/app',
    settings: '/app/settings',
    settingsNotifications: '/app/settings/notifications',
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
  legal: {
    privacy: '/legal/privacy',
    terms: '/legal/terms',
  },
} as const
