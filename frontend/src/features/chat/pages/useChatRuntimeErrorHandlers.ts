import { useCallback } from 'react'

import { ChatApiClientError } from '../api/chatClient'

export function useChatRuntimeErrorHandlers({
  markChatOffline,
  refreshSession,
}: {
  markChatOffline: () => void
  refreshSession: () => Promise<void>
}) {
  const handleUnauthorizedChatError = useCallback(
    async (error: unknown) => {
      if (!(error instanceof ChatApiClientError) || error.statusCode !== 401) {
        return false
      }

      await refreshSession()

      return true
    },
    [refreshSession],
  )
  const handleConnectionUnavailableError = useCallback(
    (error: unknown) => {
      if (!(error instanceof ChatApiClientError) || error.statusCode !== 0) {
        return false
      }

      markChatOffline()

      return true
    },
    [markChatOffline],
  )

  return {
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
  }
}
