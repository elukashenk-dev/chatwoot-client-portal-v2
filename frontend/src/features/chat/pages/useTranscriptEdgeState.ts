import { useCallback, useState } from 'react'

export function useTranscriptEdgeState(selectedThreadId: string | null) {
  const [transcriptEdgeState, setTranscriptEdgeState] = useState<{
    isAtLatestEdge: boolean
    threadId: string | null
  }>({
    isAtLatestEdge: true,
    threadId: null,
  })
  const isTranscriptAtLatestEdge =
    transcriptEdgeState.threadId === selectedThreadId
      ? transcriptEdgeState.isAtLatestEdge
      : true
  const handleLatestEdgeChange = useCallback(
    (isAtLatestEdge: boolean) => {
      setTranscriptEdgeState((currentState) => {
        if (
          currentState.threadId === selectedThreadId &&
          currentState.isAtLatestEdge === isAtLatestEdge
        ) {
          return currentState
        }

        return {
          isAtLatestEdge,
          threadId: selectedThreadId,
        }
      })
    },
    [selectedThreadId],
  )

  return {
    handleLatestEdgeChange,
    isTranscriptAtLatestEdge,
  }
}
