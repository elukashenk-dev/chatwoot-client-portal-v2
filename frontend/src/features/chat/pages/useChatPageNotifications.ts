import { useEffect } from 'react'

import { registerPortalPushMessageListener } from '../../../pwa/serviceWorkerRuntime'
import type { ChatMessage, ChatNotificationSettings } from '../types'
import { useChatNotificationSound } from './useChatNotificationSound'
import type { useChatNotificationsPanel } from './useChatNotificationsPanel'

type UseChatPageNotificationsOptions = {
  chatNotificationsPanel: ReturnType<typeof useChatNotificationsPanel>
  messages: ChatMessage[]
  onOtherThreadPush: (threadId: string) => void
  refreshChatSnapshot: () => Promise<void>
  selectedThreadId: string | null
}

export function useChatPageNotifications({
  chatNotificationsPanel,
  messages,
  onOtherThreadPush,
  refreshChatSnapshot,
  selectedThreadId,
}: UseChatPageNotificationsOptions): ChatNotificationSettings | null {
  useEffect(() => {
    void chatNotificationsPanel.loadChatNotificationSettings()
    // The panel object is intentionally not a dependency: this effect is keyed to the selected chat only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId])

  useEffect(
    () =>
      registerPortalPushMessageListener(
        (payload) => {
          if (!payload.threadId) {
            return false
          }

          if (payload.threadId !== selectedThreadId) {
            onOtherThreadPush(payload.threadId)
            return false
          }

          void refreshChatSnapshot()

          return true
        },
        {
          activeThreadId: selectedThreadId,
        },
      ),
    [onOtherThreadPush, refreshChatSnapshot, selectedThreadId],
  )

  const selectedThreadNotificationSettings =
    chatNotificationsPanel.state.settingsThreadId === selectedThreadId
      ? chatNotificationsPanel.state.settings
      : null
  const notificationSoundEnabled = Boolean(
    selectedThreadNotificationSettings?.effective?.newMessagesEnabled &&
    selectedThreadNotificationSettings.effective.soundEnabled,
  )

  useChatNotificationSound({
    activeThreadId: selectedThreadId,
    enabled: notificationSoundEnabled,
    messages,
  })

  return selectedThreadNotificationSettings
}
