import type {
  ChatSearchMatchRange,
  PortalChatMessage,
  PortalChatSearchResult,
} from './types.js'

export const CHAT_SEARCH_QUERY_MAX_LENGTH = 80
const CHAT_SEARCH_SNIPPET_MAX_LENGTH = 140

export function normalizeChatSearchQuery(query: string) {
  return query.trim().slice(0, CHAT_SEARCH_QUERY_MAX_LENGTH)
}

const SEARCH_TOKEN_CHARACTER_PATTERN = /[\p{L}\p{N}]/u

function isSearchTokenCharacter(value: string) {
  return SEARCH_TOKEN_CHARACTER_PATTERN.test(value)
}

function buildComparableSearchText(value: string) {
  const characters: string[] = []
  const ranges: ChatSearchMatchRange[] = []
  let pendingSeparatorStart: number | null = null
  let index = 0

  for (const originalCharacter of value) {
    const start = index
    const end = start + originalCharacter.length
    const character = originalCharacter.toLocaleLowerCase('ru-RU')

    index = end

    if (isSearchTokenCharacter(character)) {
      if (pendingSeparatorStart !== null && characters.length > 0) {
        characters.push(' ')
        ranges.push({ end: start, start: pendingSeparatorStart })
      }

      pendingSeparatorStart = null
      characters.push(character)
      ranges.push({ end, start })
      continue
    }

    if (characters.length > 0 && pendingSeparatorStart === null) {
      pendingSeparatorStart = start
    }
  }

  return {
    ranges,
    text: characters.join(''),
  }
}

export function findSearchMatchRanges(
  content: string,
  query: string,
): ChatSearchMatchRange[] {
  const normalizedQuery = buildComparableSearchText(
    normalizeChatSearchQuery(query),
  ).text

  if (normalizedQuery.length === 0) {
    return []
  }

  const normalizedContent = buildComparableSearchText(content)
  const ranges: ChatSearchMatchRange[] = []
  let searchFromIndex = 0

  while (searchFromIndex < normalizedContent.text.length) {
    const matchIndex = normalizedContent.text.indexOf(
      normalizedQuery,
      searchFromIndex,
    )

    if (matchIndex === -1) {
      break
    }

    const startRange = normalizedContent.ranges[matchIndex]
    const endRange =
      normalizedContent.ranges[matchIndex + normalizedQuery.length - 1]

    if (!startRange || !endRange) {
      break
    }

    ranges.push({
      end: endRange.end,
      start: startRange.start,
    })
    searchFromIndex = matchIndex + Math.max(normalizedQuery.length, 1)
  }

  return ranges
}

function createSnippet(content: string | null | undefined) {
  const normalizedContent = content?.replace(/\s+/g, ' ').trim() ?? ''

  if (!normalizedContent) {
    return null
  }

  if (normalizedContent.length <= CHAT_SEARCH_SNIPPET_MAX_LENGTH) {
    return normalizedContent
  }

  return `${normalizedContent.slice(0, CHAT_SEARCH_SNIPPET_MAX_LENGTH - 1)}…`
}

export function buildPortalChatSearchResults({
  limit,
  messages,
  query,
}: {
  limit?: number
  messages: PortalChatMessage[]
  query: string
}): PortalChatSearchResult[] {
  const normalizedQuery = normalizeChatSearchQuery(query)
  const chronologicalMessages = [...messages].sort((left, right) => {
    return left.id - right.id
  })
  const results: PortalChatSearchResult[] = []

  for (const [index, message] of chronologicalMessages.entries()) {
    if (!message.content) {
      continue
    }

    const matchRanges = findSearchMatchRanges(message.content, normalizedQuery)

    if (matchRanges.length === 0) {
      continue
    }

    results.push({
      afterSnippet: createSnippet(chronologicalMessages[index + 1]?.content),
      authorName: message.authorName,
      authorRole: message.authorRole,
      beforeSnippet: createSnippet(chronologicalMessages[index - 1]?.content),
      content: message.content,
      createdAt: message.createdAt,
      direction: message.direction,
      id: `message:${message.id}`,
      matchRanges,
      messageId: message.id,
    })
  }

  const newestFirstResults = results.sort((left, right) => {
    return right.messageId - left.messageId
  })

  return limit ? newestFirstResults.slice(0, limit) : newestFirstResults
}
