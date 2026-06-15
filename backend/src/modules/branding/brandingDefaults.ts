export const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  authMutedText: '#64748b',
  authText: '#0f172a',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
} as const

export const defaultBrandingLayout = {
  authBrandPlacement: 'left',
} as const

export function createDefaultBrandingCopy(tenantDisplayName: string) {
  return {
    authSubtitle: 'Введите email и пароль, чтобы продолжить.',
    authTitle: 'Вход в личный кабинет',
    chatEmptyBody: 'Напишите нам, когда будет удобно. Мы ответим здесь.',
    chatEmptyTitle: 'Мы на связи',
    chatInfoTitle: 'Информация о чате',
    supportLabel: `Команда ${tenantDisplayName}`,
  }
}
