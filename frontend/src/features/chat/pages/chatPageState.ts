import type { ChatMessagesSnapshot } from '../types'

export type ChatPageState =
  | {
      status: 'error'
      errorMessage: string
      snapshot: ChatMessagesSnapshot | null
    }
  | {
      status: 'loading'
      snapshot: ChatMessagesSnapshot | null
    }
  | {
      status: 'ready'
      snapshot: ChatMessagesSnapshot
    }
