const COMPANY_AUTHOR_DISPLAY_NAME_MAX_LENGTH = 80

function replaceControlCharacters(value: string) {
  return Array.from(value, (char) => {
    const codePoint = char.codePointAt(0) ?? 0

    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return ' '
    }

    return char
  }).join('')
}

function normalizeDisplayNameCandidate(value: string | null | undefined) {
  const normalized = value
    ? replaceControlCharacters(value).replace(/\s+/g, ' ').trim()
    : null

  if (!normalized) {
    return null
  }

  return normalized.slice(0, COMPANY_AUTHOR_DISPLAY_NAME_MAX_LENGTH).trimEnd()
}

export function normalizeCompanyAuthorDisplayName({
  email,
  name,
}: {
  email: string | null
  name: string | null
}) {
  return (
    normalizeDisplayNameCandidate(name) ??
    normalizeDisplayNameCandidate(email) ??
    'Пользователь'
  )
}

export function escapeMarkdownStrongText(value: string) {
  return value.replace(/[\\*_`[\]]/g, '\\$&').trim()
}

export function formatCompanyThreadContent({
  authorName,
  content,
}: {
  authorName: string
  content: string | null
}) {
  const prefix = `**${escapeMarkdownStrongText(authorName)}**`
  const normalizedContent = content?.trim()

  return normalizedContent ? `${prefix}\n${normalizedContent}` : prefix
}

export function parseCompanyThreadContent(content: string | null) {
  if (!content) {
    return {
      authorName: null,
      content: null,
    }
  }

  const match = /^\*\*(.+?)\*\*(?:\n([\s\S]*))?$/.exec(content)

  if (!match) {
    return {
      authorName: null,
      content,
    }
  }

  return {
    authorName: match[1]?.replace(/\\([\\*_`[\]])/g, '$1').trim() || null,
    content: match[2]?.trim() || null,
  }
}
