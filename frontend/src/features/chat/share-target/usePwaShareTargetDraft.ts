import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuthSession } from '../../auth/lib/authSessionContext'
import type { OfflinePendingShareDraftRecord } from '../../offline/types'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import type { AttachmentDraftItem } from '../lib/attachmentDraft'
import { CHAT_THREAD_QUERY_PARAM } from '../lib/chatThreadRoute'
import {
  deletePendingShareDraft,
  readPendingShareDraft,
  replacePendingShareDraftFiles,
} from './pendingShareDraftStore'
import {
  getGenericShareErrorMessage,
  getIdentityKey,
  getShareErrorMessage,
  hasExactIdentity,
  parseShareDraftId,
  SHARE_DRAFT_QUERY_PARAM,
  SHARE_ERROR_QUERY_PARAM,
  summarizeAdmissionRejections,
  toSharedFile,
  type LiveShareIdentity,
  type PwaShareTargetController,
  type PwaShareTargetStatus,
  type UsePwaShareTargetDraftOptions,
} from './pwaShareTargetModel'
import { usePendingShareDraftStorageRuntime } from './usePendingShareDraftStorageRuntime'

export type { PwaShareTargetController } from './pwaShareTargetModel'

export function usePwaShareTargetDraft({
  addFiles,
  canImport,
  pageStatus,
  selectedThreadId,
  threads,
}: UsePwaShareTargetDraftOptions): PwaShareTargetController {
  const location = useLocation()
  const navigate = useNavigate()
  const { refreshSession, sessionSource, user } = useAuthSession()
  const { tenant } = useTenantIdentity()
  const params = new URLSearchParams(location.search)
  const rawDraftId = params.get(SHARE_DRAFT_QUERY_PARAM)?.trim() ?? null
  const shareDraftId = parseShareDraftId(rawDraftId)
  const shareErrorCode = params.get(SHARE_ERROR_QUERY_PARAM)?.trim() ?? null
  const liveIdentity = useMemo<LiveShareIdentity | null>(
    () =>
      sessionSource === 'online' && tenant && user
        ? {
            host: window.location.host,
            tenantSlug: tenant.slug,
            userId: user.id,
          }
        : null,
    [sessionSource, tenant, user],
  )
  const identityKey = getIdentityKey(liveIdentity)
  const [loadedDraft, setLoadedDraft] =
    useState<OfflinePendingShareDraftRecord | null>(null)
  const [status, setStatus] = useState<PwaShareTargetStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedDestinationThreadId, setSelectedDestinationThreadIdState] =
    useState<string | null>(null)
  const [confirmedDestinationThreadId, setConfirmedDestinationThreadId] =
    useState<string | null>(null)
  const statusRef = useRef(status)
  const activeDraftIdRef = useRef<string | null>(null)
  const importingDraftIdRef = useRef<string | null>(null)
  const persistedShareItemIdsRef = useRef<readonly string[]>([])
  const refreshAttemptedDraftIdRef = useRef<string | null>(null)
  const { liveIdentityRef, queueDraftMutation } =
    usePendingShareDraftStorageRuntime(liveIdentity)
  const locationRef = useRef(location)
  const optionsRef = useRef({
    canImport,
    pageStatus,
    selectedThreadId,
    threads,
  })
  statusRef.current = status
  locationRef.current = location
  optionsRef.current = {
    canImport,
    pageStatus,
    selectedThreadId,
    threads,
  }

  const pendingDraft =
    loadedDraft && liveIdentity && hasExactIdentity(loadedDraft, liveIdentity)
      ? loadedDraft
      : null
  const pendingDraftRef = useRef(pendingDraft)
  pendingDraftRef.current = pendingDraft
  const updateShareLocation = useCallback(
    ({
      clearShareParams = false,
      threadId,
    }: {
      clearShareParams?: boolean
      threadId?: string
    }) => {
      const currentLocation = locationRef.current
      const nextParams = new URLSearchParams(currentLocation.search)

      if (clearShareParams) {
        nextParams.delete(SHARE_DRAFT_QUERY_PARAM)
        nextParams.delete(SHARE_ERROR_QUERY_PARAM)
      }

      if (threadId) {
        nextParams.set(CHAT_THREAD_QUERY_PARAM, threadId)
      }

      const search = nextParams.toString()
      navigate(
        {
          hash: currentLocation.hash,
          pathname: currentLocation.pathname,
          search: search ? `?${search}` : '',
        },
        { replace: true },
      )
    },
    [navigate],
  )
  const resetActiveDraft = useCallback((draftId: string) => {
    if (activeDraftIdRef.current !== draftId) {
      return
    }

    activeDraftIdRef.current = null
    importingDraftIdRef.current = null
    persistedShareItemIdsRef.current = []
    setLoadedDraft(null)
    setConfirmedDestinationThreadId(null)
    setSelectedDestinationThreadIdState(null)
  }, [])
  useEffect(() => {
    if (shareErrorCode && !rawDraftId) {
      setLoadedDraft(null)
      setErrorMessage(getShareErrorMessage(shareErrorCode))
      setStatus('error')
      return
    }

    if (!rawDraftId) {
      if (statusRef.current !== 'imported') {
        setStatus('idle')
        setErrorMessage(null)
      }
      return
    }

    if (!shareDraftId) {
      setLoadedDraft(null)
      setErrorMessage(getGenericShareErrorMessage())
      setStatus('error')
      return
    }

    activeDraftIdRef.current = shareDraftId

    if (!liveIdentity) {
      setLoadedDraft(null)
      setStatus('checking-session')
      setErrorMessage(null)

      if (refreshAttemptedDraftIdRef.current !== shareDraftId) {
        refreshAttemptedDraftIdRef.current = shareDraftId
        void refreshSession().catch(() => {
          setErrorMessage('Не удалось проверить сессию. Попробуйте ещё раз.')
          setStatus('error')
        })
      }
      return
    }

    refreshAttemptedDraftIdRef.current = null
    setLoadedDraft(null)
    setStatus('checking-session')
    setErrorMessage(null)
    let isCurrent = true

    void readPendingShareDraft({
      ...liveIdentity,
      draftId: shareDraftId,
    })
      .then(async (draft) => {
        if (!isCurrent) {
          return
        }

        if (!draft) {
          await queueDraftMutation(shareDraftId, deletePendingShareDraft)

          if (!isCurrent) {
            return
          }

          setErrorMessage(
            'Переданные файлы устарели или принадлежат другой сессии.',
          )
          setStatus('error')
          return
        }

        setLoadedDraft(draft)
        setSelectedDestinationThreadIdState(
          optionsRef.current.threads.length === 1
            ? (optionsRef.current.threads[0]?.id ?? null)
            : null,
        )
        setStatus('choosing-destination')
      })
      .catch(() => {
        if (isCurrent) {
          setErrorMessage('Не удалось открыть временно сохранённые файлы.')
          setStatus('error')
        }
      })

    return () => {
      isCurrent = false
    }
  }, [
    identityKey,
    liveIdentity,
    queueDraftMutation,
    rawDraftId,
    refreshSession,
    shareDraftId,
    shareErrorCode,
  ])

  useEffect(() => {
    if (status !== 'choosing-destination') {
      return
    }

    if (threads.length === 1) {
      setSelectedDestinationThreadIdState(threads[0]?.id ?? null)
      return
    }

    if (
      selectedDestinationThreadId &&
      !threads.some(({ id }) => id === selectedDestinationThreadId)
    ) {
      setSelectedDestinationThreadIdState(null)
    }
  }, [selectedDestinationThreadId, status, threads])

  const importPendingDraft = useCallback(
    async (threadId: string) => {
      const draft = pendingDraftRef.current
      const currentIdentity = liveIdentityRef.current
      const currentOptions = optionsRef.current

      if (
        !draft ||
        !currentIdentity ||
        !hasExactIdentity(draft, currentIdentity) ||
        !currentOptions.canImport ||
        currentOptions.pageStatus !== 'ready' ||
        currentOptions.selectedThreadId !== threadId ||
        !currentOptions.threads.some(({ id }) => id === threadId) ||
        importingDraftIdRef.current === draft.draftId
      ) {
        return
      }

      importingDraftIdRef.current = draft.draftId
      setErrorMessage(null)

      try {
        const admission = addFiles(
          draft.files.map(toSharedFile),
          'share-target',
        )
        const acceptedSharedItems = admission.accepted.filter(
          ({ source }) => source === 'share-target',
        )
        const rejectionMessage = summarizeAdmissionRejections(
          admission.rejections,
        )

        if (acceptedSharedItems.length === 0) {
          setErrorMessage(
            rejectionMessage ?? 'Ни один из переданных файлов не был добавлен.',
          )
          return
        }

        await queueDraftMutation(draft.draftId, (scope) =>
          replacePendingShareDraftFiles({
            ...scope,
            files: acceptedSharedItems.map(({ file }) => file),
          }),
        )

        if (
          !liveIdentityRef.current ||
          !hasExactIdentity(draft, liveIdentityRef.current)
        ) {
          setLoadedDraft(null)
          return
        }

        persistedShareItemIdsRef.current = acceptedSharedItems.map(
          ({ id }) => id,
        )
        setLoadedDraft(null)
        setConfirmedDestinationThreadId(null)
        setErrorMessage(rejectionMessage)
        setStatus('imported')
        updateShareLocation({ clearShareParams: true, threadId })
      } catch {
        setErrorMessage(
          'Не удалось подготовить файлы. Они не были отправлены автоматически.',
        )
      } finally {
        importingDraftIdRef.current = null
      }
    },
    [addFiles, queueDraftMutation, updateShareLocation],
  )

  useEffect(() => {
    if (!confirmedDestinationThreadId) {
      return
    }

    if (pageStatus === 'error') {
      setConfirmedDestinationThreadId(null)
      setErrorMessage('Не удалось открыть выбранный чат.')
      return
    }

    if (
      canImport &&
      pageStatus === 'ready' &&
      selectedThreadId === confirmedDestinationThreadId
    ) {
      void importPendingDraft(confirmedDestinationThreadId)
    }
  }, [
    canImport,
    confirmedDestinationThreadId,
    importPendingDraft,
    pageStatus,
    selectedThreadId,
  ])

  const confirmDestination = useCallback(
    async (threadId: string) => {
      const currentOptions = optionsRef.current

      if (
        !pendingDraftRef.current ||
        !liveIdentityRef.current ||
        !currentOptions.threads.some(({ id }) => id === threadId)
      ) {
        setErrorMessage('Выбранный чат недоступен.')
        return
      }

      setSelectedDestinationThreadIdState(threadId)

      if (
        currentOptions.selectedThreadId !== threadId ||
        currentOptions.pageStatus !== 'ready' ||
        !currentOptions.canImport
      ) {
        setConfirmedDestinationThreadId(threadId)
        setErrorMessage(
          currentOptions.canImport ? null : 'Дождитесь подключения к сети.',
        )
        updateShareLocation({ threadId })
        return
      }

      await importPendingDraft(threadId)
    },
    [importPendingDraft, updateShareLocation],
  )

  const afterCanonicalAttachmentBatchSend = useCallback(
    async (sentItems: readonly AttachmentDraftItem[]) => {
      if (!sentItems.some(({ source }) => source === 'share-target')) {
        return
      }

      const draftId = activeDraftIdRef.current

      if (!draftId) {
        return
      }

      const didDelete = await queueDraftMutation(
        draftId,
        deletePendingShareDraft,
      )

      if (didDelete) {
        resetActiveDraft(draftId)
      }
    },
    [queueDraftMutation, resetActiveDraft],
  )

  const syncRemainingShareDraftItems = useCallback(
    async (remainingItems: readonly AttachmentDraftItem[]) => {
      const draftId = activeDraftIdRef.current

      if (!draftId) {
        return
      }

      const remainingSharedItems = remainingItems.filter(
        ({ source }) => source === 'share-target',
      )
      const remainingIds = remainingSharedItems.map(({ id }) => id)

      if (
        remainingIds.length === persistedShareItemIdsRef.current.length &&
        remainingIds.every(
          (id, index) => id === persistedShareItemIdsRef.current[index],
        )
      ) {
        return
      }

      if (remainingSharedItems.length === 0) {
        const didDelete = await queueDraftMutation(
          draftId,
          deletePendingShareDraft,
        )

        if (didDelete) {
          resetActiveDraft(draftId)
        }
        return
      }

      const didReplace = await queueDraftMutation(draftId, (scope) =>
        replacePendingShareDraftFiles({
          ...scope,
          files: remainingSharedItems.map(({ file }) => file),
        }),
      )

      if (didReplace) {
        persistedShareItemIdsRef.current = remainingIds
      }
    },
    [queueDraftMutation, resetActiveDraft],
  )

  const cancelShareDraft = useCallback(async () => {
    const draftId = activeDraftIdRef.current ?? shareDraftId

    try {
      if (draftId) {
        await queueDraftMutation(draftId, deletePendingShareDraft)
        resetActiveDraft(draftId)
      }
    } catch {
      // The bounded record still expires even if local storage is unavailable.
    } finally {
      setLoadedDraft(null)
      setErrorMessage(null)
      setStatus('idle')
      updateShareLocation({ clearShareParams: true })
    }
  }, [
    queueDraftMutation,
    resetActiveDraft,
    shareDraftId,
    updateShareLocation,
  ])
  const setSelectedDestinationThreadId = useCallback((threadId: string) => {
    setErrorMessage(null)
    setSelectedDestinationThreadIdState(threadId)
  }, [])

  return {
    afterCanonicalAttachmentBatchSend,
    cancelShareDraft,
    confirmDestination,
    errorMessage,
    pendingDraft,
    selectedDestinationThreadId,
    setSelectedDestinationThreadId,
    status,
    syncRemainingShareDraftItems,
  }
}
