import type {
  ChatNotificationOverrides,
  ChatNotificationSettings,
  UserNotificationSettings,
} from '../types'
import type { BrowserPushSnapshot } from '../pages/notificationBrowserPush'

export function getBrowserPushStatusLabel(
  browserPush: BrowserPushSnapshot | null,
) {
  if (!browserPush) {
    return 'Проверяем push'
  }

  if (!browserPush.support.supported) {
    return 'Недоступно в этом браузере'
  }

  if (!browserPush.configured) {
    return 'Недоступно на сервере'
  }

  if (browserPush.permission === 'denied') {
    return 'Запрещено в настройках браузера'
  }

  if (browserPush.permission === 'default') {
    return 'Нужно разрешение браузера'
  }

  return browserPush.subscribed
    ? 'Это устройство подключено'
    : 'Это устройство еще не подключено'
}

export function canEnableBrowserPush(browserPush: BrowserPushSnapshot | null) {
  return Boolean(
    browserPush?.support.supported &&
    browserPush.configured &&
    browserPush.permission !== 'denied',
  )
}

export function hasChatNotificationOverrides(
  overrides: ChatNotificationOverrides,
) {
  return (
    overrides.newMessagesEnabled !== null || overrides.soundEnabled !== null
  )
}

export function getChatNotificationsStatus(
  settings: ChatNotificationSettings | null,
) {
  if (!settings) {
    return 'Настроить'
  }

  if (!settings.effective.newMessagesEnabled) {
    return 'Выключены'
  }

  return settings.effective.soundEnabled ? 'Включены' : 'Без звука'
}

export function getInheritanceStatus(settings: ChatNotificationSettings) {
  if (!settings.global.newMessagesEnabled) {
    return 'Общие уведомления отключены'
  }

  return hasChatNotificationOverrides(settings.overrides)
    ? 'Есть настройки для этого чата'
    : 'Используются общие настройки'
}

export function getGlobalEffectiveSettings(settings: UserNotificationSettings) {
  const newMessagesEnabled = settings.newMessagesEnabled

  return {
    newMessagesEnabled,
    soundEnabled: newMessagesEnabled && settings.soundEnabled,
  }
}
