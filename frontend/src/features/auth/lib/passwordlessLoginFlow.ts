type StoredPasswordlessLoginRequest = {
  email: string
  expiresInSeconds: number
  requestedAt: number
  resendAvailableInSeconds: number
}

type PasswordlessLoginFlowState = {
  request: StoredPasswordlessLoginRequest | null
}

const STORAGE_KEY = 'portal.passwordless-login-flow'

function createEmptyState(): PasswordlessLoginFlowState {
  return {
    request: null,
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function hasExpired(startedAt: number, ttlSeconds: number) {
  return startedAt + ttlSeconds * 1000 <= Date.now()
}

function readPasswordlessLoginFlowState(): PasswordlessLoginFlowState {
  if (typeof window === 'undefined') {
    return createEmptyState()
  }

  try {
    const serializedState = window.sessionStorage.getItem(STORAGE_KEY)

    if (!serializedState) {
      return createEmptyState()
    }

    const parsedState = JSON.parse(
      serializedState,
    ) as Partial<PasswordlessLoginFlowState>

    return {
      request: parsedState.request ?? null,
    }
  } catch {
    return createEmptyState()
  }
}

function writePasswordlessLoginFlowState(state: PasswordlessLoginFlowState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (!state.request) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures and keep the flow functional for the current render.
  }
}

export function clearPasswordlessLoginFlow() {
  writePasswordlessLoginFlowState(createEmptyState())
}

export function getStoredPasswordlessLoginRequest() {
  const currentState = readPasswordlessLoginFlowState()
  const request = currentState.request

  if (!request) {
    return null
  }

  if (
    !isFinitePositiveNumber(request.requestedAt) ||
    !isFinitePositiveNumber(request.expiresInSeconds) ||
    hasExpired(request.requestedAt, request.expiresInSeconds)
  ) {
    clearPasswordlessLoginFlow()
    return null
  }

  return request
}

export function savePasswordlessLoginRequest({
  email,
  expiresInSeconds,
  resendAvailableInSeconds,
}: {
  email: string
  expiresInSeconds: number
  resendAvailableInSeconds: number
}) {
  writePasswordlessLoginFlowState({
    request: {
      email: normalizeEmail(email),
      expiresInSeconds,
      requestedAt: Date.now(),
      resendAvailableInSeconds,
    },
  })
}
