const PORTAL_SEND_SOURCE_ID_PREFIX = 'portal-send:'
const CURRENT_PORTAL_SEND_SOURCE_ID_PREFIX = 'portal-user-send:v1:'

export function createUserScopedChatwootSourceId({
  clientMessageKey,
  userId,
}: {
  clientMessageKey: string
  userId: number
}) {
  return `${CURRENT_PORTAL_SEND_SOURCE_ID_PREFIX}${userId}:${clientMessageKey}`
}

export function readClientMessageKeyFromChatwootSourceId(
  sourceId: string | null,
) {
  if (!sourceId) {
    return null
  }

  if (!sourceId.startsWith(CURRENT_PORTAL_SEND_SOURCE_ID_PREFIX)) {
    return sourceId.startsWith(PORTAL_SEND_SOURCE_ID_PREFIX) ? sourceId : null
  }

  const scopedValue = sourceId.slice(
    CURRENT_PORTAL_SEND_SOURCE_ID_PREFIX.length,
  )
  const separatorIndex = scopedValue.indexOf(':')

  if (separatorIndex <= 0) {
    return null
  }

  const userIdText = scopedValue.slice(0, separatorIndex)
  const clientMessageKey = scopedValue.slice(separatorIndex + 1)

  if (!/^[1-9]\d*$/.test(userIdText)) {
    return null
  }

  const userId = Number(userIdText)

  return Number.isSafeInteger(userId) && clientMessageKey
    ? clientMessageKey
    : null
}
