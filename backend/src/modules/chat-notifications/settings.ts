import type {
  ChatNotificationOverrides,
  UserNotificationSettings,
} from './types.js'

export const defaultUserNotificationSettings: UserNotificationSettings = {
  newMessagesEnabled: true,
  soundEnabled: true,
}

export const emptyChatNotificationOverrides: ChatNotificationOverrides = {
  newMessagesEnabled: null,
  soundEnabled: null,
}

export function resolveEffectiveChatNotificationSettings({
  global,
  overrides,
}: {
  global: UserNotificationSettings
  overrides: ChatNotificationOverrides
}): UserNotificationSettings {
  const newMessagesEnabled =
    global.newMessagesEnabled && (overrides.newMessagesEnabled ?? true)

  return {
    newMessagesEnabled,
    soundEnabled:
      newMessagesEnabled &&
      global.soundEnabled &&
      (overrides.soundEnabled ?? true),
  }
}
