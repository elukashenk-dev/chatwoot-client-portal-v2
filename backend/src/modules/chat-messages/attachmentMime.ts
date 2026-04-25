const CHAT_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
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

const CHAT_ATTACHMENT_EXTENSION_MIME_TYPES = new Map([
  ['7z', 'application/x-7z-compressed'],
  ['aac', 'audio/aac'],
  ['bmp', 'image/bmp'],
  ['csv', 'text/csv'],
  ['doc', 'application/msword'],
  [
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  ['gif', 'image/gif'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['json', 'application/json'],
  ['m4a', 'audio/mp4'],
  ['m4v', 'video/x-m4v'],
  ['mov', 'video/quicktime'],
  ['mp3', 'audio/mpeg'],
  ['mp4', 'video/mp4'],
  ['odt', 'application/vnd.oasis.opendocument.text'],
  ['oga', 'audio/ogg'],
  ['ogg', 'audio/ogg'],
  ['ogv', 'video/ogg'],
  ['opus', 'audio/ogg'],
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['ppt', 'application/vnd.ms-powerpoint'],
  [
    'pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  ['rtf', 'application/rtf'],
  ['tar', 'application/x-tar'],
  ['txt', 'text/plain'],
  ['wav', 'audio/wav'],
  ['webm', 'video/webm'],
  ['webp', 'image/webp'],
  ['xls', 'application/vnd.ms-excel'],
  [
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  ['zip', 'application/zip'],
])

const CHAT_ATTACHMENT_UNKNOWN_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
])

function getMimeTypeEssence(mimeType: string) {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function inferAttachmentMimeTypeFromFileName(fileName: string) {
  const lastPathSegment = fileName.split(/[\\/]/).pop() ?? fileName
  const extensionSeparatorIndex = lastPathSegment.lastIndexOf('.')

  if (
    extensionSeparatorIndex <= 0 ||
    extensionSeparatorIndex === lastPathSegment.length - 1
  ) {
    return null
  }

  return (
    CHAT_ATTACHMENT_EXTENSION_MIME_TYPES.get(
      lastPathSegment.slice(extensionSeparatorIndex + 1).toLowerCase(),
    ) ?? null
  )
}

export function normalizeAttachmentMimeType({
  fileName,
  mimeType,
}: {
  fileName: string
  mimeType: string
}) {
  const normalizedMimeType = mimeType.trim().toLowerCase()
  const mimeTypeEssence = getMimeTypeEssence(normalizedMimeType)

  if (!CHAT_ATTACHMENT_UNKNOWN_MIME_TYPES.has(mimeTypeEssence)) {
    return normalizedMimeType
  }

  return inferAttachmentMimeTypeFromFileName(fileName) ?? normalizedMimeType
}

export function isAllowedAttachmentMimeType(mimeType: string) {
  const mimeTypeEssence = getMimeTypeEssence(mimeType)

  return (
    mimeTypeEssence.startsWith('image/') ||
    mimeTypeEssence.startsWith('video/') ||
    mimeTypeEssence.startsWith('audio/') ||
    CHAT_ATTACHMENT_ALLOWED_MIME_TYPES.has(mimeTypeEssence)
  )
}
