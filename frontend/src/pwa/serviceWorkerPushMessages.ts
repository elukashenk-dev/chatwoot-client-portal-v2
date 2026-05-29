export type PortalPushMessagePayload = {
  chatwootMessageId: number | null
  portalUserId: number | null
  tenantSlug: string | null
  threadId: string | null
  threadTitle: string | null
  threadType: 'group' | 'private' | null
  type: 'chat_message'
  url: string
}

type PortalPushMessageHandler = (
  payload: PortalPushMessagePayload,
) => boolean | Promise<boolean>

type RegisterPortalPushMessageListenerOptions = {
  activeThreadId?: string | null
}

export function registerPortalPushMessageListener(
  handler: PortalPushMessageHandler,
  { activeThreadId = null }: RegisterPortalPushMessageListenerOptions = {},
) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  function postClientReadyState(type: string) {
    navigator.serviceWorker.controller?.postMessage({
      ...(type === 'PORTAL_PUSH_CLIENT_READY' ? { activeThreadId } : {}),
      type,
    })
  }

  function handleMessage(event: MessageEvent) {
    if (event.data?.type !== 'PORTAL_PUSH_MESSAGE') {
      return
    }

    const payload = {
      chatwootMessageId: Number.isSafeInteger(
        event.data.payload?.chatwootMessageId,
      )
        ? event.data.payload.chatwootMessageId
        : null,
      portalUserId: Number.isSafeInteger(event.data.payload?.portalUserId)
        ? event.data.payload.portalUserId
        : null,
      tenantSlug:
        typeof event.data.payload?.tenantSlug === 'string'
          ? event.data.payload.tenantSlug
          : null,
      threadId:
        typeof event.data.payload?.threadId === 'string' &&
        event.data.payload.threadId.length > 0
          ? event.data.payload.threadId
          : null,
      threadTitle:
        typeof event.data.payload?.threadTitle === 'string' &&
        event.data.payload.threadTitle.trim().length > 0
          ? event.data.payload.threadTitle.trim()
          : null,
      threadType:
        event.data.payload?.threadType === 'private' ||
        event.data.payload?.threadType === 'group'
          ? event.data.payload.threadType
          : null,
      type: 'chat_message',
      url:
        typeof event.data.payload?.url === 'string'
          ? event.data.payload.url
          : '/',
    } satisfies PortalPushMessagePayload
    const responsePort = event.ports[0]

    void Promise.resolve(handler(payload))
      .then((handled) => {
        responsePort?.postMessage({
          handled: handled === true,
        })
      })
      .catch(() => {
        responsePort?.postMessage({
          handled: false,
        })
      })
  }

  function handleControllerChange() {
    postClientReadyState('PORTAL_PUSH_CLIENT_READY')
  }

  navigator.serviceWorker.addEventListener('message', handleMessage)
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    handleControllerChange,
  )
  postClientReadyState('PORTAL_PUSH_CLIENT_READY')

  return () => {
    navigator.serviceWorker.removeEventListener('message', handleMessage)
    navigator.serviceWorker.removeEventListener(
      'controllerchange',
      handleControllerChange,
    )
    postClientReadyState('PORTAL_PUSH_CLIENT_NOT_READY')
  }
}
