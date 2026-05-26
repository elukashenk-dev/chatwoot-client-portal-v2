import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  canEnableBrowserPush,
  getBrowserPushStatusLabel,
  getInheritanceStatus,
  hasChatNotificationOverrides,
} from '../lib/notificationSettingsPresentation'
import type { ChatThreadSummary } from '../types'
import {
  NotificationCard,
  NotificationSwitch,
} from './NotificationSettingsControls'
import { ChatFullScreenPanel } from './ChatFullScreenPanel'
import type { ChatNotificationsPanelState } from '../pages/useChatNotificationsPanel'

type ChatNotificationsPageProps = {
  activeThread: ChatThreadSummary | null
  onBack: () => void
  onDisableDevicePush: () => void
  onEnablePushForThread: () => void
  onRetry: () => void
  onResetThreadOverrides: () => void
  onUpdateSetting: (patch: {
    newMessagesEnabled?: boolean | null
    pushEnabled?: boolean | null
    soundEnabled?: boolean | null
  }) => void
  state: ChatNotificationsPanelState
}

export function ChatNotificationsPage({
  activeThread,
  onBack,
  onDisableDevicePush,
  onEnablePushForThread,
  onRetry,
  onResetThreadOverrides,
  onUpdateSetting,
  state,
}: ChatNotificationsPageProps) {
  const settings = state.settings
  const isUnavailable = !settings
  const pushStatus = getBrowserPushStatusLabel(state.browserPush)
  const canTogglePush =
    Boolean(settings?.effective.newMessagesEnabled) &&
    canEnableBrowserPush(state.browserPush)
  const shouldShowDeviceConnect =
    Boolean(settings?.effective.pushEnabled) &&
    Boolean(state.browserPush) &&
    !state.browserPush?.subscribed &&
    canEnableBrowserPush(state.browserPush)
  const globalMessagesDisabled = Boolean(
    settings && !settings.global.newMessagesEnabled,
  )

  return (
    <ChatFullScreenPanel
      isLoading={state.isLoading}
      isUnavailable={!state.isLoading && isUnavailable}
      loadingMessage="Загружаем уведомления."
      onBack={onBack}
      onRetry={onRetry}
      title="Уведомления"
      unavailableMessage="Не удалось загрузить уведомления."
    >
      {settings ? (
        <div className="mx-auto max-w-md">
          <div className="mb-4 min-w-0 border-b border-slate-200/80 pb-4">
            <h2 className="truncate text-[17px] font-semibold leading-tight text-slate-900">
              {activeThread?.title ?? 'Чат'}
            </h2>
            <p className="mt-1 truncate text-[13px] leading-5 text-slate-500">
              {activeThread?.type === 'group' ? 'Групповой чат' : 'Личный чат'}
            </p>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-600">
              {getInheritanceStatus(settings)}
            </p>
          </div>

          <InlineAlert message={state.errorMessage} />

          <NotificationCard>
            <NotificationSwitch
              checked={settings.effective.newMessagesEnabled}
              description={
                globalMessagesDisabled ? 'Отключено в общих настройках' : null
              }
              disabled={state.isUpdating || globalMessagesDisabled}
              label="Новые сообщения"
              onChange={(checked) => {
                onUpdateSetting({ newMessagesEnabled: checked })
              }}
            />
            <NotificationSwitch
              checked={settings.effective.soundEnabled}
              description={
                settings.effective.newMessagesEnabled
                  ? null
                  : 'Недоступно, пока новые сообщения отключены'
              }
              disabled={
                state.isUpdating || !settings.effective.newMessagesEnabled
              }
              label="Звук"
              onChange={(checked) => {
                onUpdateSetting({ soundEnabled: checked })
              }}
            />
            <NotificationSwitch
              checked={settings.effective.pushEnabled}
              description={pushStatus}
              disabled={state.isUpdating || !canTogglePush}
              label="Push-уведомления"
              onChange={(checked) => {
                if (checked) {
                  onEnablePushForThread()
                  return
                }

                onUpdateSetting({ pushEnabled: false })
              }}
            />
          </NotificationCard>

          {hasChatNotificationOverrides(settings.overrides) ? (
            <button
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-brand-800 transition hover:border-brand-200 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={state.isUpdating}
              onClick={onResetThreadOverrides}
              type="button"
            >
              Сбросить к общим настройкам
            </button>
          ) : null}

          {shouldShowDeviceConnect ? (
            <button
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-brand-800 transition hover:border-brand-200 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={state.isUpdating}
              onClick={onEnablePushForThread}
              type="button"
            >
              Подключить push на этом устройстве
            </button>
          ) : null}

          {state.browserPush?.subscribed ? (
            <button
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:border-brand-200 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={state.isUpdating}
              onClick={onDisableDevicePush}
              type="button"
            >
              Отключить push на этом устройстве
            </button>
          ) : null}
        </div>
      ) : null}
    </ChatFullScreenPanel>
  )
}
