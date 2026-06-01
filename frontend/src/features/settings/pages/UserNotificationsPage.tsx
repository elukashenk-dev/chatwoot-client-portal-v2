import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { ChatFullScreenPanel } from '../../chat/components/ChatFullScreenPanel'
import {
  NotificationActionRow,
  NotificationCard,
  NotificationSwitch,
} from '../../chat/components/NotificationSettingsControls'
import {
  canEnableBrowserPush,
  getBrowserPushStatusLabel,
  getGlobalEffectiveSettings,
} from '../../chat/lib/notificationSettingsPresentation'
import { useUserNotificationsSettings } from './useUserNotificationsSettings'

export function UserNotificationsPage() {
  const navigate = useNavigate()
  const {
    connectDevicePush,
    disableDevicePush,
    loadSettings,
    state,
    updateSettings,
  } = useUserNotificationsSettings()
  const settings = state.settings
  const effectiveSettings = settings
    ? getGlobalEffectiveSettings(settings)
    : null
  const pushStatus = getBrowserPushStatusLabel(state.browserPush)
  const canChangeDevicePush = canEnableBrowserPush(state.browserPush)
  const devicePushAction = state.browserPush?.subscribed
    ? {
        label: 'Отключить',
        onAction: disableDevicePush,
      }
    : canChangeDevicePush
      ? {
          label: 'Подключить',
          onAction: connectDevicePush,
        }
      : null

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
              label="Уведомления о новых сообщениях"
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
          </NotificationCard>

          <div className="mt-4">
            <NotificationCard>
              <NotificationActionRow
                actionLabel={devicePushAction?.label}
                description={pushStatus}
                disabled={state.isUpdating}
                label="Push на этом устройстве"
                onAction={() => {
                  void devicePushAction?.onAction()
                }}
              />
            </NotificationCard>
          </div>
        </div>
      ) : null}
    </ChatFullScreenPanel>
  )
}
