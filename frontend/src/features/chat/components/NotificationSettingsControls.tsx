import type { ReactNode } from 'react'

import { cn } from '../../../shared/lib/cn'
import type {
  ChatNotificationOverrides,
  ChatNotificationSettings,
  UserNotificationSettings,
} from '../types'
import type { BrowserPushSnapshot } from '../pages/notificationBrowserPush'

type NotificationSwitchProps = {
  checked: boolean
  description?: ReactNode
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}

export function NotificationSwitch({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: NotificationSwitchProps) {
  return (
    <button
      aria-checked={checked}
      className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-slate-200/80 px-4 py-3 text-left transition last:border-b-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={() => {
        onChange(!checked)
      }}
      role="switch"
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-5 text-slate-900">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-[12px] leading-4 text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 rounded-full p-0.5 transition',
          checked ? 'bg-brand-800' : 'bg-slate-200',
        )}
      >
        <span
          className={cn(
            'h-6 w-6 rounded-full bg-white shadow-sm transition',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}

export function NotificationCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white">
      {children}
    </div>
  )
}

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
    overrides.newMessagesEnabled !== null ||
    overrides.pushEnabled !== null ||
    overrides.soundEnabled !== null
  )
}

export function getChatNotificationsStatus(
  settings: ChatNotificationSettings | null,
) {
  if (!settings) {
    return 'Настроить'
  }

  if (!settings.effective.newMessagesEnabled) {
    return 'Отключены'
  }

  const soundLabel = settings.effective.soundEnabled
    ? 'звук включен'
    : 'звук выключен'
  const pushLabel = settings.effective.pushEnabled
    ? 'push включен'
    : 'push выключен'

  return `${soundLabel} · ${pushLabel}`
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
    pushEnabled: newMessagesEnabled && settings.pushEnabled,
    soundEnabled: newMessagesEnabled && settings.soundEnabled,
  }
}
