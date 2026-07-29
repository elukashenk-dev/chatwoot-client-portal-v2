import { useRef } from 'react'

import {
  createAttachmentBatchSignature,
  type AttachmentDraftItem,
} from '../../lib/attachmentDraft'
import { createClientMessageKey } from './utils'

type AttachmentRetryPayload = {
  content: string | null
  items: readonly AttachmentDraftItem[]
  replyToMessageId: number | null
}

export function useAttachmentSendRetryKey() {
  const clientMessageKeyRef = useRef<string | null>(null)
  const contentRef = useRef<string | null>(null)
  const replyToMessageIdRef = useRef<number | null>(null)
  const signatureRef = useRef<string | null>(null)

  function clear() {
    clientMessageKeyRef.current = null
    contentRef.current = null
    replyToMessageIdRef.current = null
    signatureRef.current = null
  }

  function clearIfPayloadChanged({
    content,
    items,
    replyToMessageId,
  }: AttachmentRetryPayload) {
    if (
      clientMessageKeyRef.current &&
      (contentRef.current !== content ||
        replyToMessageIdRef.current !== replyToMessageId ||
        signatureRef.current !== createAttachmentBatchSignature(items))
    ) {
      clear()
    }
  }

  function getOrCreateKey(payload: AttachmentRetryPayload) {
    clearIfPayloadChanged(payload)

    const clientMessageKey =
      clientMessageKeyRef.current ?? createClientMessageKey()

    clientMessageKeyRef.current = clientMessageKey
    contentRef.current = payload.content
    replyToMessageIdRef.current = payload.replyToMessageId
    signatureRef.current = createAttachmentBatchSignature(payload.items)

    return clientMessageKey
  }

  return {
    clear,
    clearIfPayloadChanged,
    getOrCreateKey,
  }
}
