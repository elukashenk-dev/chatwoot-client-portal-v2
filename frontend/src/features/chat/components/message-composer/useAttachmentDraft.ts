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

export function useAttachmentDraft(scopeKey: string | null = null) {
  const [items, setItems] = useState<AttachmentDraftItem[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [previewUrls, setPreviewUrls] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  )
  const [draftScopeKey, setDraftScopeKey] = useState(scopeKey)
  const itemsRef = useRef(items)
  const previewUrlsRef = useRef(new Map<string, string>())
  const draftScopeKeyRef = useRef(scopeKey)

  const resetDraft = useCallback((nextScopeKey: string | null) => {
    for (const previewUrl of previewUrlsRef.current.values()) {
      URL.revokeObjectURL(previewUrl)
    }

    const nextItems: AttachmentDraftItem[] = []
    const nextPreviewUrls = new Map<string, string>()

    draftScopeKeyRef.current = nextScopeKey
    itemsRef.current = nextItems
    previewUrlsRef.current = nextPreviewUrls
    setDraftScopeKey(nextScopeKey)
    setErrorMessage(null)
    setItems(nextItems)
    setPreviewUrls(nextPreviewUrls)

    return nextItems
  }, [])

  const addFiles = useCallback(
    (files: readonly File[], source: AttachmentDraftSource) => {
      if (draftScopeKeyRef.current !== scopeKey) {
        resetDraft(scopeKey)
      }

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
    [resetDraft, scopeKey],
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

  const clearItems = useCallback(
    () => resetDraft(scopeKey),
    [resetDraft, scopeKey],
  )

  useEffect(() => {
    if (draftScopeKey === scopeKey) {
      return
    }

    let isCurrent = true

    void Promise.resolve().then(() => {
      if (isCurrent) {
        resetDraft(scopeKey)
      }
    })

    return () => {
      isCurrent = false
    }
  }, [draftScopeKey, resetDraft, scopeKey])

  useEffect(
    () => () => {
      for (const previewUrl of previewUrlsRef.current.values()) {
        URL.revokeObjectURL(previewUrl)
      }

      previewUrlsRef.current.clear()
    },
    [],
  )

  const isCurrentScope = draftScopeKey === scopeKey
  const visibleItems = useMemo(
    () => (isCurrentScope ? items : []),
    [isCurrentScope, items],
  )
  const viewItems = useMemo<AttachmentDraftViewItem[]>(
    () =>
      visibleItems.map((item) => ({
        ...item,
        previewUrl: isCurrentScope ? (previewUrls.get(item.id) ?? null) : null,
      })),
    [isCurrentScope, previewUrls, visibleItems],
  )
  const totalBytes = useMemo(
    () => visibleItems.reduce((sum, item) => sum + item.file.size, 0),
    [visibleItems],
  )

  return {
    addFiles,
    clearItems,
    errorMessage: isCurrentScope ? errorMessage : null,
    items: visibleItems,
    removeItem,
    totalBytes,
    viewItems,
  }
}
