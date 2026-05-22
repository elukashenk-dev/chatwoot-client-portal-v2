import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { ChatFullScreenPanel } from '../../chat/components/ChatFullScreenPanel'
import {
  canEnableBrowserPush,
  getBrowserPushStatusLabel,
  getGlobalEffectiveSettings,
  NotificationCard,
  NotificationSwitch,
} from '../../chat/components/NotificationSettingsControls'
import { useUserNotificationsSettings } from './useUserNotificationsSettings'

export function UserNotificationsPage() {
  const navigate = useNavigate()
  const {
    disableDevicePush,
    enablePushDefault,
    loadSettings,
    state,
    updateSettings,
  } = useUserNotificationsSettings()
  const settings = state.settings
  const effectiveSettings = settings
    ? getGlobalEffectiveSettings(settings)
    : null
  const pushStatus = getBrowserPushStatusLabel(state.browserPush)
  const canTogglePush =
    Boolean(effectiveSettings?.newMessagesEnabled) &&
    canEnableBrowserPush(state.browserPush)

  return (
    <ChatFullScreenPanel
      isLoading={state.isLoading}
      isUnavailable={!state.isLoading && !settings}
      loadingMessage="Загружаем настройки уведомлений."
      onBack={() => {
        navigate(routePaths.app.settings)
      }}
      onRetry={() => {
        void loadSettings()
      }}
      title="Уведомления"
      unavailableMessage="Не удалось загрузить настройки уведомлений."
    >
      {settings && effectiveSettings ? (
        <div className="mx-auto max-w-md">
          <InlineAlert message={state.errorMessage} />

          <NotificationCard>
            <NotificationSwitch
              checked={settings.newMessagesEnabled}
              disabled={state.isUpdating}
              label="Новые сообщения"
              onChange={(checked) => {
                void updateSettings({ newMessagesEnabled: checked })
              }}
            />
            <NotificationSwitch
              checked={effectiveSettings.soundEnabled}
              description={
                settings.newMessagesEnabled
                  ? null
                  : 'Недоступно, пока новые сообщения отключены'
              }
              disabled={state.isUpdating || !settings.newMessagesEnabled}
              label="Звук"
              onChange={(checked) => {
                void updateSettings({ soundEnabled: checked })
              }}
            />
            <NotificationSwitch
              checked={effectiveSettings.pushEnabled}
              description={pushStatus}
              disabled={state.isUpdating || !canTogglePush}
              label="Push-уведомления"
              onChange={(checked) => {
                if (checked) {
                  void enablePushDefault()
                  return
                }

                void updateSettings({ pushEnabled: false })
              }}
            />
          </NotificationCard>

          {state.browserPush?.subscribed ? (
            <button
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:border-brand-200 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={state.isUpdating}
              onClick={() => {
                void disableDevicePush()
              }}
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
