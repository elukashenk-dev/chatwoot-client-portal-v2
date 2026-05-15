import type { ChatMessagesSnapshot, ChatThreadSummary } from '../types'

type ChatPageThreadState = {
  selectedThreadId: string | null
  threads: ChatThreadSummary[]
}

export type ChatPageState =
  | (ChatPageThreadState & {
      status: 'error'
      errorMessage: string
      snapshot: ChatMessagesSnapshot | null
    })
  | (ChatPageThreadState & {
      status: 'loading'
      snapshot: ChatMessagesSnapshot | null
    })
  | (ChatPageThreadState & {
      status: 'ready'
      snapshot: ChatMessagesSnapshot
    })
