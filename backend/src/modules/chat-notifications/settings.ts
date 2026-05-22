import type {
  ChatNotificationOverrides,
  UserNotificationSettings,
} from './types.js'

export const defaultUserNotificationSettings: UserNotificationSettings = {
  newMessagesEnabled: true,
  pushEnabled: false,
  soundEnabled: true,
}

export const emptyChatNotificationOverrides: ChatNotificationOverrides = {
  newMessagesEnabled: null,
  pushEnabled: null,
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
    pushEnabled:
      newMessagesEnabled && (overrides.pushEnabled ?? global.pushEnabled),
    soundEnabled:
      newMessagesEnabled && (overrides.soundEnabled ?? global.soundEnabled),
  }
}
