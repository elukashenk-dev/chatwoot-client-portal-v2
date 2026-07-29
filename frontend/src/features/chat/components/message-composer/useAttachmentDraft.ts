import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  admitAttachmentFiles,
  type AttachmentDraftItem,
  type AttachmentDraftSource,
} from '../../lib/attachmentDraft'

export type AttachmentDraftViewItem = AttachmentDraftItem & {
  previewUrl: string | null
}

function summarizeRejections(
  rejections: ReturnType<typeof admitAttachmentFiles>['rejections'],
) {
  if (rejections.length === 0) {
    return null
  }

  return rejections.map((rejection) => rejection.message).join(' ')
}

export function useAttachmentDraft() {
  const [items, setItems] = useState<AttachmentDraftItem[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [previewUrls, setPreviewUrls] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  )
  const itemsRef = useRef(items)
  const previewUrlsRef = useRef(new Map<string, string>())

  const addFiles = useCallback(
    (files: readonly File[], source: AttachmentDraftSource) => {
      const admission = admitAttachmentFiles({
        currentItems: itemsRef.current,
        files,
        source,
      })
      const nextPreviewUrls = new Map(previewUrlsRef.current)

      for (const item of admission.accepted) {
        if (
          item.file.type.startsWith('image/') &&
          typeof URL.createObjectURL === 'function'
        ) {
          nextPreviewUrls.set(item.id, URL.createObjectURL(item.file))
        }
      }

      previewUrlsRef.current = nextPreviewUrls
      itemsRef.current = admission.items
      setPreviewUrls(nextPreviewUrls)
      setItems(admission.items)
      setErrorMessage(summarizeRejections(admission.rejections))

      return admission
    },
    [],
  )

  const removeItem = useCallback((itemId: string) => {
    const previewUrl = previewUrlsRef.current.get(itemId)
    const nextPreviewUrls = new Map(previewUrlsRef.current)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      nextPreviewUrls.delete(itemId)
    }

    const nextItems = itemsRef.current.filter((item) => item.id !== itemId)

    previewUrlsRef.current = nextPreviewUrls
    itemsRef.current = nextItems
    setPreviewUrls(nextPreviewUrls)
    setItems(nextItems)
    setErrorMessage(null)

    return nextItems
  }, [])

  const clearItems = useCallback(() => {
    for (const previewUrl of previewUrlsRef.current.values()) {
      URL.revokeObjectURL(previewUrl)
    }

    const nextPreviewUrls = new Map<string, string>()

    previewUrlsRef.current = nextPreviewUrls
    const nextItems: AttachmentDraftItem[] = []

    itemsRef.current = nextItems
    setPreviewUrls(nextPreviewUrls)
    setItems(nextItems)
    setErrorMessage(null)

    return nextItems
  }, [])

  useEffect(
    () => () => {
      for (const previewUrl of previewUrlsRef.current.values()) {
        URL.revokeObjectURL(previewUrl)
      }

      previewUrlsRef.current.clear()
    },
    [],
  )

  const viewItems = useMemo<AttachmentDraftViewItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        previewUrl: previewUrls.get(item.id) ?? null,
      })),
    [items, previewUrls],
  )
  const totalBytes = useMemo(
    () => items.reduce((sum, item) => sum + item.file.size, 0),
    [items],
  )

  return {
    addFiles,
    clearItems,
    errorMessage,
    items,
    removeItem,
    totalBytes,
    viewItems,
  }
}
