export function fetchWithChatPresenceRoutes(
  fetchMock: typeof fetch,
): typeof fetch {
  return (input, init) => {
    const url = String(input)

    if (
      url === '/api/chat/threads/private%3Ame/read' ||
      url === '/api/chat/threads/private%3Ame/typing'
    ) {
      return Promise.resolve(new Response(null, { status: 204 }))
    }

    return fetchMock(input, init)
  }
}
