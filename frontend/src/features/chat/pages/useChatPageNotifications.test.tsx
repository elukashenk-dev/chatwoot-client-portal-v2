import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerPortalPushMessageListener } from '../../../pwa/serviceWorkerRuntime'
import { useChatPageNotifications } from './useChatPageNotifications'

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  registerPortalPushMessageListener: vi.fn(() => vi.fn()),
}))

vi.mock('./useChatNotificationSound', () => ({
  useChatNotificationSound: vi.fn(),
}))

const registerPortalPushMessageListenerMock = vi.mocked(
  registerPortalPushMessageListener,
)

function createChatNotificationsPanel() {
  return {
    loadChatNotificationSettings: vi.fn(),
    state: {
      settings: null,
      settingsThreadId: null,
    },
  } as unknown as Parameters<
    typeof useChatPageNotifications
  >[0]['chatNotificationsPanel']
}

describe('useChatPageNotifications', () => {
  beforeEach(() => {
    registerPortalPushMessageListenerMock.mockClear()
  })

  it('acknowledges browser push messages only for the currently selected thread', async () => {
    const onOtherThreadPush = vi.fn()
    const refreshChatSnapshot = vi.fn(async () => undefined)
    const chatNotificationsPanel = createChatNotificationsPanel()

    renderHook(() =>
      useChatPageNotifications({
        canSuppressActiveThreadPush: true,
        chatNotificationsPanel,
        messages: [],
        onOtherThreadPush,
        refreshChatSnapshot,
        selectedThreadId: 'group:155',
      }),
    )

    await waitFor(() => {
      expect(registerPortalPushMessageListenerMock).toHaveBeenCalled()
    })

    const handler = registerPortalPushMessageListenerMock.mock.calls[0]?.[0]

    expect(handler).toBeDefined()
    expect(
      handler?.({
        chatwootMessageId: 9001,
        portalUserId: 7,
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        threadTitle: 'Личный чат',
        threadType: 'private',
        type: 'chat_message',
        url: '/',
      }),
    ).toBe(false)
    expect(onOtherThreadPush).toHaveBeenCalledWith('private:me')
    expect(refreshChatSnapshot).not.toHaveBeenCalled()

    expect(
      handler?.({
        chatwootMessageId: 9002,
        portalUserId: 7,
        tenantSlug: 'buhfirma',
        threadId: 'group:155',
        threadTitle: 'ООО Уточки',
        threadType: 'group',
        type: 'chat_message',
        url: '/',
      }),
    ).toBe(true)
    expect(onOtherThreadPush).toHaveBeenCalledTimes(1)
    expect(refreshChatSnapshot).toHaveBeenCalledTimes(1)
  })
})
