export const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authMutedText: '#64748b',
  authText: '#0f172a',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#112540',
  chatHeaderText: '#ffffff',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
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
