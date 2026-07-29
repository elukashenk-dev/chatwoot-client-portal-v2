import type {
  OfflinePendingShareDraftRecord,
  PendingShareDraftScope,
} from '../../offline/types'
import type { AttachmentDraftItem } from '../lib/attachmentDraft'
import type { ChatPageState } from '../pages/chatPageState'
import type { ChatThreadListSummary } from '../types'

export const SHARE_DRAFT_QUERY_PARAM = 'shareDraft'
export const SHARE_ERROR_QUERY_PARAM = 'shareError'

export type LiveShareIdentity = Omit<PendingShareDraftScope, 'draftId'>

export type PwaShareTargetStatus =
  | 'idle'
  | 'checking-session'
  | 'choosing-destination'
  | 'imported'
  | 'error'

export type PwaShareTargetController = {
  afterCanonicalAttachmentBatchSend: (
    sentItems: readonly AttachmentDraftItem[],
  ) => Promise<void>
  cancelShareDraft: () => Promise<void>
  confirmDestination: (threadId: string) => Promise<void>
  errorMessage: string | null
  pendingDraft: OfflinePendingShareDraftRecord | null
  selectedDestinationThreadId: string | null
  setSelectedDestinationThreadId: (threadId: string) => void
  status: PwaShareTargetStatus
  syncRemainingShareDraftItems: (
    remainingItems: readonly AttachmentDraftItem[],
  ) => Promise<void>
}

export type UsePwaShareTargetDraftOptions = {
  addFiles: (
    files: readonly File[],
    source: 'share-target',
  ) => {
    accepted: AttachmentDraftItem[]
    rejections: Array<{ message: string }>
  }
  canImport: boolean
  pageStatus: ChatPageState['status']
  selectedThreadId: string | null
  threads: readonly ChatThreadListSummary[]
}

const OPAQUE_DRAFT_ID_PATTERN = /^[a-z0-9-]{1,128}$/iu
const GENERIC_SHARE_ERROR_MESSAGE =
  'Не удалось добавить переданные файлы. Попробуйте ещё раз.'
const SHARE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  batch_too_large: 'Общий размер переданных файлов превышает 40 МБ.',
  body_unavailable: 'Не удалось прочитать переданные файлы.',
  busy: 'Другой набор файлов уже обрабатывается. Попробуйте ещё раз.',
  count_exceeded: 'Можно передать не больше 5 файлов.',
  file_empty: 'Пустой файл нельзя добавить в сообщение.',
  file_name_invalid: 'У одного из файлов некорректное имя.',
  file_required: 'В системном меню не был выбран файл.',
  session_required: 'Войдите в портал и повторите отправку файла.',
  storage_unavailable: 'Не удалось временно сохранить переданные файлы.',
  type_not_allowed: 'Через системное меню можно передать PNG, JPEG или WebP.',
}

export function parseShareDraftId(rawDraftId: string | null) {
  return rawDraftId && OPAQUE_DRAFT_ID_PATTERN.test(rawDraftId)
    ? rawDraftId
    : null
}

export function getShareErrorMessage(code: string | null) {
  return code
    ? (SHARE_ERROR_MESSAGES[code] ?? GENERIC_SHARE_ERROR_MESSAGE)
    : null
}

export function getGenericShareErrorMessage() {
  return GENERIC_SHARE_ERROR_MESSAGE
}

export function summarizeAdmissionRejections(
  rejections: Array<{ message: string }>,
) {
  return rejections.length > 0
    ? rejections.map(({ message }) => message).join(' ')
    : null
}

export function hasExactIdentity(
  draft: OfflinePendingShareDraftRecord,
  identity: LiveShareIdentity,
) {
  return (
    draft.host === identity.host &&
    draft.tenantSlug === identity.tenantSlug &&
    draft.userId === identity.userId
  )
}

export function getIdentityKey(identity: LiveShareIdentity | null) {
  return identity
    ? JSON.stringify([identity.host, identity.tenantSlug, identity.userId])
    : null
}

export function toSharedFile(
  file: OfflinePendingShareDraftRecord['files'][number],
) {
  return new File([file.blob], file.fileName, {
    lastModified: file.lastModified,
    type: file.mimeType,
  })
}
