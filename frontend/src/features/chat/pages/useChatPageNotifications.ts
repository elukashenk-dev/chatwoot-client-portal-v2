import { useEffect } from 'react'

import { registerPortalPushMessageListener } from '../../../pwa/serviceWorkerRuntime'
import type { ChatMessage, ChatNotificationSettings } from '../types'
import { useChatNotificationSound } from './useChatNotificationSound'
import type { useChatNotificationsPanel } from './useChatNotificationsPanel'

type UseChatPageNotificationsOptions = {
  chatNotificationsPanel: ReturnType<typeof useChatNotificationsPanel>
  messages: ChatMessage[]
  refreshChatSnapshot: () => Promise<void>
  selectedThreadId: string | null
}

export function useChatPageNotifications({
  chatNotificationsPanel,
  messages,
  refreshChatSnapshot,
  selectedThreadId,
}: UseChatPageNotificationsOptions): ChatNotificationSettings | null {
  useEffect(() => {
    void chatNotificationsPanel.loadChatNotificationSettings()
  }, [selectedThreadId])

  useEffect(
    () =>
      registerPortalPushMessageListener(() => {
        void refreshChatSnapshot()
      }),
    [refreshChatSnapshot],
  )

  const selectedThreadNotificationSettings =
    chatNotificationsPanel.state.settingsThreadId === selectedThreadId
      ? chatNotificationsPanel.state.settings
      : null
  const notificationSoundEnabled =
    selectedThreadNotificationSettings?.effective.newMessagesEnabled !==
      false &&
    selectedThreadNotificationSettings?.effective.soundEnabled !== false

  useChatNotificationSound({
    activeThreadId: selectedThreadId,
    enabled: notificationSoundEnabled,
    messages,
  })

  return selectedThreadNotificationSettings
}
