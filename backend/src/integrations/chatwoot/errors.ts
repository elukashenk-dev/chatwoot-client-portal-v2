export class ChatwootClientConfigurationError extends Error {
  constructor(message = 'Chatwoot integration is not configured.') {
    super(message)

    this.name = 'ChatwootClientConfigurationError'
  }
}

export class ChatwootClientRequestError extends Error {
  constructor(message = 'Chatwoot request failed.') {
    super(message)

    this.name = 'ChatwootClientRequestError'
  }
}

export class ChatwootInvalidHistoryCursorError extends Error {
  constructor(
    message = 'History cursor is invalid for the current conversation.',
  ) {
    super(message)

    this.name = 'ChatwootInvalidHistoryCursorError'
  }
}
