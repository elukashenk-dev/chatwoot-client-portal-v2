import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  ChatApiClientError,
  getChatNotificationSettings,
} from '../api/chatClient'
import { useChatNotificationsPanel } from './useChatNotificationsPanel'

vi.mock('../api/chatClient', async () => {
  const actual =
    await vi.importActual<typeof import('../api/chatClient')>(
      '../api/chatClient',
    )

  return {
    ...actual,
    getChatNotificationSettings: vi.fn(),
  }
})

const getChatNotificationSettingsMock = vi.mocked(getChatNotificationSettings)

const chatNotificationSettings = {
  effective: {
    newMessagesEnabled: true,
    pushEnabled: false,
    soundEnabled: false,
  },
  global: {
    newMessagesEnabled: true,
    pushEnabled: false,
    soundEnabled: false,
  },
  overrides: {
    newMessagesEnabled: null,
    pushEnabled: null,
    soundEnabled: false,
  },
  threadId: 'group:155',
}

describe('useChatNotificationsPanel', () => {
  it('retries silent chat settings load once after session refresh', async () => {
    const handleUnauthorizedChatError = vi.fn(async () => true)
    const markBrowserOnline = vi.fn()
    getChatNotificationSettingsMock
      .mockRejectedValueOnce(
        new ChatApiClientError({
          code: 'unauthorized',
          message: 'Требуется вход.',
          statusCode: 401,
        }),
      )
      .mockResolvedValueOnce(chatNotificationSettings)

    const { result } = renderHook(() =>
      useChatNotificationsPanel({
        handleConnectionUnavailableError: vi.fn(),
        handleUnauthorizedChatError,
        isMountedRef: { current: true },
        markBrowserOnline,
        selectedThreadId: 'group:155',
      }),
    )

    await act(async () => {
      await result.current.loadChatNotificationSettings()
    })

    await waitFor(() => {
      expect(result.current.state.settings).toEqual(chatNotificationSettings)
    })
    expect(handleUnauthorizedChatError).toHaveBeenCalledTimes(1)
    expect(getChatNotificationSettingsMock).toHaveBeenCalledTimes(2)
    expect(markBrowserOnline).toHaveBeenCalled()
  })
})
