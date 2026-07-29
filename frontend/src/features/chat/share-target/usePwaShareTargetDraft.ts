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
import { useConfirmedShareDestinationImport } from './useConfirmedShareDestinationImport'
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
  const knownIdentity = useMemo<LiveShareIdentity | null>(
    () =>
      tenant && user
        ? {
            host: window.location.host,
            tenantSlug: tenant.slug,
            userId: user.id,
          }
        : null,
    [tenant, user],
  )
  const liveIdentity = sessionSource === 'online' ? knownIdentity : null
  const identityKey = getIdentityKey(liveIdentity)
  const [loadedDraft, setLoadedDraft] =
    useState<OfflinePendingShareDraftRecord | null>(null)
  const [status, setStatus] = useState<PwaShareTargetStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedDestinationThreadIdState, setSelectedDestinationThreadIdState] =
    useState<string | null>(null)
  const [confirmedDestinationThreadId, setConfirmedDestinationThreadId] =
    useState<string | null>(null)
  const statusRef = useRef(status)
  const activeDraftIdRef = useRef<string | null>(null)
  const importingDraftIdRef = useRef<string | null>(null)
  const persistedShareItemIdsRef = useRef<readonly string[]>([])
  const refreshAttemptedDraftIdRef = useRef<string | null>(null)
  const { getLiveIdentity, queueDraftMutation } =
    usePendingShareDraftStorageRuntime(liveIdentity)

  useEffect(() => {
    statusRef.current = status
  }, [status])
  const pendingDraft =
    loadedDraft && liveIdentity && hasExactIdentity(loadedDraft, liveIdentity)
      ? loadedDraft
      : null
  const selectedDestinationThreadId =
    selectedDestinationThreadIdState &&
    threads.some(({ id }) => id === selectedDestinationThreadIdState)
      ? selectedDestinationThreadIdState
      : threads.length === 1
        ? (threads[0]?.id ?? null)
        : null
  const updateShareLocation = useCallback(
    ({
      clearShareParams = false,
      threadId,
    }: {
      clearShareParams?: boolean
      threadId?: string
    }) => {
      const nextParams = new URLSearchParams(location.search)

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
          hash: location.hash,
          pathname: location.pathname,
          search: search ? `?${search}` : '',
        },
        { replace: true },
      )
    },
    [location.hash, location.pathname, location.search, navigate],
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
    let isCurrent = true

    const synchronizeDraft = async () => {
      await Promise.resolve()

      if (!isCurrent) {
        return
      }

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
            if (isCurrent) {
              setErrorMessage(
                'Не удалось проверить сессию. Попробуйте ещё раз.',
              )
              setStatus('error')
            }
          })
        }
        return
      }

      refreshAttemptedDraftIdRef.current = null
      setLoadedDraft(null)
      setSelectedDestinationThreadIdState(null)
      setStatus('checking-session')
      setErrorMessage(null)

      try {
        const draft = await readPendingShareDraft({
          ...liveIdentity,
          draftId: shareDraftId,
        })

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
        setStatus('choosing-destination')
      } catch {
        if (isCurrent) {
          setErrorMessage('Не удалось открыть временно сохранённые файлы.')
          setStatus('error')
        }
      }
    }

    void synchronizeDraft()

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

  const importPendingDraft = useCallback(
    async (threadId: string) => {
      const currentIdentity = getLiveIdentity()

      if (
        !pendingDraft ||
        !currentIdentity ||
        !hasExactIdentity(pendingDraft, currentIdentity) ||
        !canImport ||
        pageStatus !== 'ready' ||
        selectedThreadId !== threadId ||
        !threads.some(({ id }) => id === threadId) ||
        importingDraftIdRef.current === pendingDraft.draftId
      ) {
        return
      }

      importingDraftIdRef.current = pendingDraft.draftId
      setErrorMessage(null)

      try {
        const admission = addFiles(
          pendingDraft.files.map(toSharedFile),
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

        await queueDraftMutation(pendingDraft.draftId, (scope) =>
          replacePendingShareDraftFiles({
            ...scope,
            files: acceptedSharedItems.map(({ file }) => file),
          }),
        )

        const identityAfterWrite = getLiveIdentity()

        if (
          !identityAfterWrite ||
          !hasExactIdentity(pendingDraft, identityAfterWrite)
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
    [
      addFiles,
      canImport,
      getLiveIdentity,
      pageStatus,
      pendingDraft,
      queueDraftMutation,
      selectedThreadId,
      threads,
      updateShareLocation,
    ],
  )

  useConfirmedShareDestinationImport({
    canImport,
    confirmedDestinationThreadId,
    importPendingDraft,
    pageStatus,
    selectedThreadId,
    setConfirmedDestinationThreadId,
    setErrorMessage,
  })

  const confirmDestination = useCallback(
    async (threadId: string) => {
      if (
        !pendingDraft ||
        !getLiveIdentity() ||
        !threads.some(({ id }) => id === threadId)
      ) {
        setErrorMessage('Выбранный чат недоступен.')
        return
      }

      setSelectedDestinationThreadIdState(threadId)

      if (
        selectedThreadId !== threadId ||
        pageStatus !== 'ready' ||
        !canImport
      ) {
        setConfirmedDestinationThreadId(threadId)
        setErrorMessage(canImport ? null : 'Дождитесь подключения к сети.')
        updateShareLocation({ threadId })
        return
      }

      await importPendingDraft(threadId)
    },
    [
      canImport,
      getLiveIdentity,
      importPendingDraft,
      pageStatus,
      pendingDraft,
      selectedThreadId,
      threads,
      updateShareLocation,
    ],
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

    if (draftId) {
      if (!knownIdentity) {
        setErrorMessage(
          'Не удалось удалить переданные файлы без подтверждённой сессии.',
        )
        setStatus('error')
        return
      }

      try {
        await deletePendingShareDraft({ ...knownIdentity, draftId })
      } catch {
        setErrorMessage(
          'Не удалось удалить переданные файлы. Попробуйте ещё раз.',
        )
        setStatus('error')
        return
      }

      resetActiveDraft(draftId)
    }

    setLoadedDraft(null)
    setErrorMessage(null)
    setStatus('idle')
    updateShareLocation({ clearShareParams: true })
  }, [
    knownIdentity,
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
