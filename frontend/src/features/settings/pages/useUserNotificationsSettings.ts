import { useEffect, useRef, useState } from 'react'

import {
  getUserNotificationSettings,
  updateUserNotificationSettings,
} from '../../chat/api/chatClient'
import type { UserNotificationSettings } from '../../chat/types'
import {
  disableBrowserPushOnDevice,
  ensureBrowserPushSubscription,
  loadBrowserPushSnapshot,
  type BrowserPushSnapshot,
} from '../../chat/pages/notificationBrowserPush'

type UserNotificationsSettingsState = {
  browserPush: BrowserPushSnapshot | null
  errorMessage: string | null
  isLoading: boolean
  isUpdating: boolean
  settings: UserNotificationSettings | null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Не удалось обновить настройки уведомлений.'
}

export function useUserNotificationsSettings() {
  const isMountedRef = useRef(false)
  const [state, setState] = useState<UserNotificationsSettingsState>({
    browserPush: null,
    errorMessage: null,
    isLoading: true,
    isUpdating: false,
    settings: null,
  })

  async function loadSettings() {
    setState((currentState) => ({
      ...currentState,
      errorMessage: null,
      isLoading: true,
    }))

    try {
      const [settings, browserPush] = await Promise.all([
        getUserNotificationSettings(),
        loadBrowserPushSnapshot(),
      ])

      if (!isMountedRef.current) {
        return
      }

      setState({
        browserPush,
        errorMessage: null,
        isLoading: false,
        isUpdating: false,
        settings,
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        errorMessage: getErrorMessage(error),
        isLoading: false,
        isUpdating: false,
      }))
    }
  }

  async function updateSettings(patch: Partial<UserNotificationSettings>) {
    setState((currentState) => ({
      ...currentState,
      errorMessage: null,
      isUpdating: true,
    }))

    try {
      const settings = await updateUserNotificationSettings(patch)

      if (!isMountedRef.current) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        errorMessage: null,
        isUpdating: false,
        settings,
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

  async function connectDevicePush() {
    if (!state.browserPush) {
      return
    }

    setState((currentState) => ({
      ...currentState,
      errorMessage: null,
      isUpdating: true,
    }))

    try {
      const subscriptionResult = await ensureBrowserPushSubscription({
        browserPush: state.browserPush,
      })

      if (!isMountedRef.current) {
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

      setState((currentState) => ({
        ...currentState,
        browserPush: subscriptionResult.browserPush,
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

  useEffect(() => {
    isMountedRef.current = true
    void loadSettings()

    return () => {
      isMountedRef.current = false
    }
  }, [])

  return {
    connectDevicePush,
    disableDevicePush,
    loadSettings,
    state,
    updateSettings,
  }
}
