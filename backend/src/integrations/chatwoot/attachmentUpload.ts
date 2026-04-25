const CHATWOOT_MULTIPART_FILE_NAME_MAX_LENGTH = 180

export function buildSafeChatwootMultipartFileName(fileName: string) {
  const normalizedFileName = fileName.trim()

  if (/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}$/.test(normalizedFileName)) {
    return normalizedFileName
  }

  const lastPathSegment =
    normalizedFileName.split(/[\\/]/).pop() ?? normalizedFileName
  const extensionSeparatorIndex = lastPathSegment.lastIndexOf('.')
  const rawExtension =
    extensionSeparatorIndex > 0 &&
    extensionSeparatorIndex < lastPathSegment.length - 1
      ? lastPathSegment.slice(extensionSeparatorIndex + 1)
      : ''
  const rawBaseName = rawExtension
    ? lastPathSegment.slice(0, extensionSeparatorIndex)
    : lastPathSegment
  const extension = rawExtension.replace(/[^A-Za-z0-9]/g, '').slice(0, 20)
  const safeBaseName =
    rawBaseName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, CHATWOOT_MULTIPART_FILE_NAME_MAX_LENGTH) || 'attachment'

  if (!extension) {
    return safeBaseName.slice(0, CHATWOOT_MULTIPART_FILE_NAME_MAX_LENGTH)
  }

  const maxBaseLength =
    CHATWOOT_MULTIPART_FILE_NAME_MAX_LENGTH - extension.length - 1

  return `${safeBaseName.slice(0, maxBaseLength)}.${extension.toLowerCase()}`
}
