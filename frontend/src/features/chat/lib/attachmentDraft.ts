export const CHAT_ATTACHMENT_MAX_FILES = 5
export const CHAT_ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024
export const CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH = 255

export const COMPOSER_ATTACHMENT_ACCEPT =
  'image/*,video/*,audio/*,.7z,.csv,.doc,.docx,.json,.odt,.pdf,.ppt,.pptx,.rtf,.tar,.txt,.xls,.xlsx,.zip'

export type AttachmentDraftSource =
  | 'camera'
  | 'clipboard'
  | 'drop'
  | 'picker'
  | 'share-target'

export type AttachmentDraftItem = {
  readonly file: File
  readonly id: string
  readonly source: AttachmentDraftSource
}

export type AttachmentDraftRejection = {
  code:
    | 'attachment_batch_too_large'
    | 'attachment_count_exceeded'
    | 'attachment_duplicate'
    | 'attachment_empty'
    | 'attachment_file_name_required'
    | 'attachment_file_name_too_long'
    | 'attachment_too_large'
    | 'attachment_type_not_allowed'
  fileName: string | null
  message: string
}

export type AttachmentAdmissionResult = {
  accepted: AttachmentDraftItem[]
  items: AttachmentDraftItem[]
  rejections: AttachmentDraftRejection[]
}

const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream'])

const ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/zip',
  'text/csv',
  'text/plain',
  'text/rtf',
])

const MIME_TYPE_BY_EXTENSION = new Map([
  ['.7z', 'application/x-7z-compressed'],
  ['.aac', 'audio/aac'],
  ['.csv', 'text/csv'],
  ['.doc', 'application/msword'],
  [
    '.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json'],
  ['.m4a', 'audio/mp4'],
  ['.mov', 'video/quicktime'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.odt', 'application/vnd.oasis.opendocument.text'],
  ['.ogg', 'audio/ogg'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  [
    '.pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  ['.rtf', 'application/rtf'],
  ['.tar', 'application/x-tar'],
  ['.txt', 'text/plain'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.xls', 'application/vnd.ms-excel'],
  [
    '.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  ['.zip', 'application/zip'],
])

function getFileExtension(fileName: string) {
  const extensionStart = fileName.lastIndexOf('.')

  return extensionStart < 0 ? '' : fileName.slice(extensionStart).toLowerCase()
}

function inferMimeType(fileName: string) {
  return MIME_TYPE_BY_EXTENSION.get(getFileExtension(fileName)) ?? ''
}

function isAllowedMimeType(mimeType: string) {
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    ALLOWED_MIME_TYPES.has(mimeType)
  )
}

function getAttachmentIdentity(file: File) {
  const normalizedFile = normalizeAttachmentFile(file)

  return JSON.stringify([
    normalizedFile.name,
    normalizedFile.type,
    normalizedFile.size,
    normalizedFile.lastModified,
  ])
}

function createDefaultDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}`
}

function createRejection(
  code: AttachmentDraftRejection['code'],
  file: File,
  message: string,
): AttachmentDraftRejection {
  return {
    code,
    fileName: file.name.trim() || null,
    message,
  }
}

export function normalizeAttachmentFile(file: File) {
  const fileName = file.name.trim()
  const browserMimeType = file.type.trim().toLowerCase()
  const mimeType = GENERIC_MIME_TYPES.has(browserMimeType)
    ? inferMimeType(fileName) || browserMimeType
    : browserMimeType

  if (fileName === file.name && mimeType === file.type) {
    return file
  }

  return new File([file], fileName, {
    lastModified: file.lastModified,
    type: mimeType,
  })
}

export function validateAttachmentFile(
  inputFile: File,
): AttachmentDraftRejection | null {
  const file = normalizeAttachmentFile(inputFile)

  if (!file.name) {
    return createRejection(
      'attachment_file_name_required',
      file,
      'Имя файла обязательно.',
    )
  }

  if (file.name.length > CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH) {
    return createRejection(
      'attachment_file_name_too_long',
      file,
      'Имя файла слишком длинное.',
    )
  }

  if (file.size <= 0) {
    return createRejection(
      'attachment_empty',
      file,
      `Файл «${file.name}» пустой.`,
    )
  }

  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return createRejection(
      'attachment_too_large',
      file,
      `Файл «${file.name}» больше допустимого размера 40 МБ.`,
    )
  }

  if (!file.type || !isAllowedMimeType(file.type)) {
    return createRejection(
      'attachment_type_not_allowed',
      file,
      `Файл «${file.name}» этого типа нельзя отправить.`,
    )
  }

  return null
}

export function admitAttachmentFiles({
  createId = createDefaultDraftId,
  currentItems,
  files,
  source,
}: {
  createId?: () => string
  currentItems: readonly AttachmentDraftItem[]
  files: readonly File[]
  source: AttachmentDraftSource
}): AttachmentAdmissionResult {
  const items = [...currentItems]
  const accepted: AttachmentDraftItem[] = []
  const rejections: AttachmentDraftRejection[] = []
  const identities = new Set(
    currentItems.map((item) => getAttachmentIdentity(item.file)),
  )
  let totalBytes = currentItems.reduce(
    (sum, item) => sum + item.file.size,
    0,
  )

  for (const inputFile of files) {
    const file = normalizeAttachmentFile(inputFile)
    const identity = getAttachmentIdentity(file)

    if (identities.has(identity)) {
      rejections.push(
        createRejection(
          'attachment_duplicate',
          file,
          `Файл «${file.name || 'без имени'}» уже добавлен.`,
        ),
      )
      continue
    }

    const validationRejection = validateAttachmentFile(file)

    if (validationRejection) {
      rejections.push(validationRejection)
      continue
    }

    if (items.length >= CHAT_ATTACHMENT_MAX_FILES) {
      rejections.push(
        createRejection(
          'attachment_count_exceeded',
          file,
          'Можно добавить не больше 5 файлов.',
        ),
      )
      continue
    }

    if (totalBytes + file.size > CHAT_ATTACHMENT_MAX_BYTES) {
      rejections.push(
        createRejection(
          'attachment_batch_too_large',
          file,
          'Общий размер файлов не должен превышать 40 МБ.',
        ),
      )
      continue
    }

    const item: AttachmentDraftItem = {
      file,
      id: createId(),
      source,
    }

    accepted.push(item)
    items.push(item)
    identities.add(identity)
    totalBytes += file.size
  }

  return {
    accepted,
    items,
    rejections,
  }
}

export function createAttachmentBatchSignature(
  items: readonly AttachmentDraftItem[],
) {
  return JSON.stringify(items.map((item) => getAttachmentIdentity(item.file)))
}
