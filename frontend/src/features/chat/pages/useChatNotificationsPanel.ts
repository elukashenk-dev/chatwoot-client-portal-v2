import { useRef, useState, type RefObject } from 'react'

import {
  getChatNotificationSettings,
  updateChatNotificationSettings,
} from '../api/chatClient'
import type {
  ChatNotificationOverrides,
  ChatNotificationSettings,
} from '../types'
import {
  disableBrowserPushOnDevice,
  ensureBrowserPushSubscription,
  loadBrowserPushSnapshot,
  type BrowserPushSnapshot,
} from './notificationBrowserPush'

export type ChatNotificationsPanelState = {
  browserPush: BrowserPushSnapshot | null
  errorMessage: string | null
  isLoading: boolean
  isOpen: boolean
  isUpdating: boolean
  settings: ChatNotificationSettings | null
  settingsThreadId: string | null
}

type UseChatNotificationsPanelOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Не удалось обновить настройки уведомлений.'
}

export function useChatNotificationsPanel({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
}: UseChatNotificationsPanelOptions) {
  const requestSequenceRef = useRef(0)
  const selectedThreadIdRef = useRef<string | null>(selectedThreadId)
  selectedThreadIdRef.current = selectedThreadId
  const [state, setState] = useState<ChatNotificationsPanelState>({
    browserPush: null,
    errorMessage: null,
    isLoading: false,
    isOpen: false,
    isUpdating: false,
    settings: null,
    settingsThreadId: null,
  })

  function nextRequestId() {
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId

    return requestId
  }

  function isCurrentRequest(requestId: number, threadId: string) {
    return (
      isMountedRef.current &&
      requestSequenceRef.current === requestId &&
      selectedThreadIdRef.current === threadId
    )
  }

  async function loadChatNotificationSettings() {
    const threadId = selectedThreadId

    if (!threadId) {
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        settings: null,
        settingsThreadId: null,
      }))
      return
    }

    const requestId = nextRequestId()
    setState((currentState) => ({
      ...currentState,
      settings:
        currentState.settingsThreadId === threadId
          ? currentState.settings
          : null,
      settingsThreadId:
        currentState.settingsThreadId === threadId ? threadId : null,
    }))

    try {
      const settings = await getChatNotificationSettings(threadId)

      if (!isCurrentRequest(requestId, threadId)) {
        return
      }

      markBrowserOnline()
      setState((currentState) => ({
        ...currentState,
        settings,
        settingsThreadId: threadId,
      }))
    } catch (error) {
      if (!isCurrentRequest(requestId, threadId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        return
      }

      handleConnectionUnavailableError(error)
      setState((currentState) => ({
        ...currentState,
        settings: null,
        settingsThreadId: null,
      }))
    }
  }

  async function loadChatNotifications() {
    const threadId = selectedThreadId

    if (!threadId) {
      return
    }

    const requestId = nextRequestId()
    setState((currentState) => ({
      ...currentState,
      errorMessage: null,
      isLoading: true,
      isOpen: true,
      settings:
        currentState.settingsThreadId === threadId
          ? currentState.settings
          : null,
      settingsThreadId:
        currentState.settingsThreadId === threadId ? threadId : null,
    }))

    try {
      const [settings, browserPush] = await Promise.all([
        getChatNotificationSettings(threadId),
        loadBrowserPushSnapshot(),
      ])

      if (!isCurrentRequest(requestId, threadId)) {
        return
      }

      markBrowserOnline()
      setState({
        browserPush,
        errorMessage: null,
        isLoading: false,
        isOpen: true,
        isUpdating: false,
        settings,
        settingsThreadId: threadId,
      })
    } catch (error) {
      if (!isCurrentRequest(requestId, threadId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (!isCurrentRequest(requestId, threadId)) {
          return
        }

        setState((currentState) => ({
          ...currentState,
          errorMessage: 'Сессия обновлена. Попробуйте еще раз.',
          isLoading: false,
        }))
        return
      }

      handleConnectionUnavailableError(error)
      if (!isCurrentRequest(requestId, threadId)) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        errorMessage: getErrorMessage(error),
        isLoading: false,
      }))
    }
  }

  async function updateSettings(patch: Partial<ChatNotificationOverrides>) {
    const threadId = selectedThreadId

    if (!threadId) {
      return
    }

    requestSequenceRef.current += 1
    setState((currentState) => ({
      ...currentState,
      errorMessage: null,
      isUpdating: true,
    }))

    try {
      const settings = await updateChatNotificationSettings(threadId, patch)

      if (!isMountedRef.current || selectedThreadIdRef.current !== threadId) {
        return
      }

      markBrowserOnline()
      setState((currentState) => ({
        ...currentState,
        errorMessage: null,
        isUpdating: false,
        settings,
        settingsThreadId: threadId,
      }))
    } catch (error) {
      if (!isMountedRef.current || selectedThreadIdRef.current !== threadId) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (!isMountedRef.current) {
          return
        }
      } else {
        handleConnectionUnavailableError(error)
      }

      setState((currentState) => ({
        ...currentState,
        errorMessage: getErrorMessage(error),
        isUpdating: false,
      }))
    }
  }

  async function enablePushForThread() {
    const threadId = selectedThreadId

    if (!state.browserPush || !threadId) {
      return
    }

    requestSequenceRef.current += 1
    setState((currentState) => ({
      ...currentState,
      errorMessage: null,
      isUpdating: true,
    }))

    try {
      const subscriptionResult = await ensureBrowserPushSubscription({
        browserPush: state.browserPush,
      })

      if (!isMountedRef.current || selectedThreadIdRef.current !== threadId) {
        return
      }

      if (subscriptionResult.result !== 'subscribed') {
        setState((currentState) => ({
          ...currentState,
          browserPush: subscriptionResult.browserPush,
          isUpdating: false,
        }))
        return
      }

      const settings = await updateChatNotificationSettings(threadId, {
        pushEnabled: true,
      })

      if (!isMountedRef.current || selectedThreadIdRef.current !== threadId) {
        return
      }

      markBrowserOnline()
      setState((currentState) => ({
        ...currentState,
        browserPush: subscriptionResult.browserPush,
        errorMessage: null,
        isUpdating: false,
        settings,
        settingsThreadId: threadId,
      }))
    } catch (error) {
      if (!isMountedRef.current || selectedThreadIdRef.current !== threadId) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        errorMessage: getErrorMessage(error),
        isUpdating: false,
      }))
    }
  }

  async function disableDevicePush() {
    if (!state.browserPush) {
      return
    }

    setState((currentState) => ({
      ...currentState,
      errorMessage: null,
      isUpdating: true,
    }))

    try {
      const browserPush = await disableBrowserPushOnDevice({
        browserPush: state.browserPush,
      })

      if (!isMountedRef.current) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        browserPush,
        errorMessage: null,
        isUpdating: false,
      }))
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        errorMessage: getErrorMessage(error),
        isUpdating: false,
      }))
    }
  }

  return {
    closeChatNotifications: () => {
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        isOpen: false,
      }))
    },
    disableDevicePush,
    enablePushForThread,
    loadChatNotificationSettings,
    loadChatNotifications,
    resetThreadOverrides: () =>
      updateSettings({
        newMessagesEnabled: null,
        pushEnabled: null,
        soundEnabled: null,
      }),
    retryChatNotifications: loadChatNotifications,
    state,
    updateSettings,
  }
}
