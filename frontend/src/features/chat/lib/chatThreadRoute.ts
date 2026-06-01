import { routePaths } from '../../../app/routePaths'

export const CHAT_THREAD_QUERY_PARAM = 'threadId'

export function readChatThreadIdFromSearch(search: string) {
  const threadId = new URLSearchParams(search)
    .get(CHAT_THREAD_QUERY_PARAM)
    ?.trim()

  return threadId && threadId.length > 0 ? threadId : null
}

export function buildChatThreadPath(threadId: string) {
  const params = new URLSearchParams()
  params.set(CHAT_THREAD_QUERY_PARAM, threadId)

  return `${routePaths.app.chat}?${params.toString()}`
}
