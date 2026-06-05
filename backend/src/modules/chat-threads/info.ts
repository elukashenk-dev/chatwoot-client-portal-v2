import type {
  PublicChatThreadInfoParticipant,
  PublicChatThreadSummary,
} from './types.js'

type ChatInfoThreadType = PublicChatThreadSummary['type']

export type SafeChatInfoParticipantRow = {
  avatarUrl: string | null
  displayName: string | null
  email: string
  isCurrentUser: boolean
  userId: number
}

export function readCuratorName(
  customAttributes: Record<string, unknown> | null | undefined,
) {
  const value = customAttributes?.curator_name

  if (typeof value !== 'string') {
    return null
  }

  return value.trim() || null
}

export function buildChatThreadTypeLabel(threadType: ChatInfoThreadType) {
  return threadType === 'group' ? 'Групповой' : 'Личный'
}

export function buildChatThreadAccessLabel(threadType: ChatInfoThreadType) {
  return threadType === 'group'
    ? 'Участники группы и поддержка'
    : 'Вы и поддержка'
}

export function toIsoDateTime(timestampSeconds: number | null | undefined) {
  return typeof timestampSeconds === 'number'
    ? new Date(timestampSeconds * 1000).toISOString()
    : null
}

function getParticipantDisplayName(row: SafeChatInfoParticipantRow) {
  return row.displayName?.trim() || row.email
}

export function normalizeChatInfoParticipantRows(
  rows: SafeChatInfoParticipantRow[],
): PublicChatThreadInfoParticipant[] {
  const participantsById = new Map<number, PublicChatThreadInfoParticipant>()

  for (const row of rows) {
    if (participantsById.has(row.userId)) {
      continue
    }

    participantsById.set(row.userId, {
      avatarUrl: row.avatarUrl,
      displayName: getParticipantDisplayName(row),
      id: `portal-user:${row.userId}`,
      isCurrentUser: row.isCurrentUser,
    })
  }

  return [...participantsById.values()].sort((left, right) => {
    if (left.isCurrentUser !== right.isCurrentUser) {
      return left.isCurrentUser ? -1 : 1
    }

    return left.displayName.localeCompare(right.displayName, 'ru')
  })
}
