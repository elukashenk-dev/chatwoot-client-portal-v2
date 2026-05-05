import type { PublicTenantContext } from '../api/tenantClient'

const fallbackThemeColor = '#112540'

function setMetaContent(name: string, content: string) {
  document
    .querySelector(`meta[name="${name}"]`)
    ?.setAttribute('content', content)
}

export function createTenantMonogram(displayName: string) {
  const words = displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)

  if (words.length >= 2) {
    return words.slice(0, 2).join('').toUpperCase()
  }

  return displayName.trim().slice(0, 2).toUpperCase() || 'ЛК'
}

export function applyTenantDocumentMetadata(tenant: PublicTenantContext) {
  const appTitle = `${tenant.displayName} Личный кабинет`
  const description = `Личный кабинет ${tenant.displayName} для безопасной работы с сообщениями и обращениями.`

  document.title = appTitle
  setMetaContent('application-name', appTitle)
  setMetaContent('apple-mobile-web-app-title', tenant.displayName)
  setMetaContent('description', description)
  setMetaContent('theme-color', fallbackThemeColor)
}
