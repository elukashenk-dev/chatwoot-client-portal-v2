type StoredPasswordlessLoginRequest = {
  email: string
  expiresInSeconds: number
  requestedAt: number
  resendAvailableInSeconds: number
}

type StoredPasswordlessLoginLegalContinuation = {
  continuationExpiresInSeconds: number
  continuationToken: string
  email: string
  verifiedAt: number
}

type PasswordlessLoginFlowState = {
  legalContinuation: StoredPasswordlessLoginLegalContinuation | null
  request: StoredPasswordlessLoginRequest | null
}

const STORAGE_KEY = 'portal.passwordless-login-flow'

function createEmptyState(): PasswordlessLoginFlowState {
  return {
    legalContinuation: null,
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
      legalContinuation: parsedState.legalContinuation ?? null,
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
    if (!state.request && !state.legalContinuation) {
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

export function getStoredPasswordlessLoginLegalContinuation() {
  const currentState = readPasswordlessLoginFlowState()
  const legalContinuation = currentState.legalContinuation

  if (!legalContinuation) {
    return null
  }

  if (
    !isFinitePositiveNumber(legalContinuation.verifiedAt) ||
    !isFinitePositiveNumber(
      legalContinuation.continuationExpiresInSeconds,
    ) ||
    hasExpired(
      legalContinuation.verifiedAt,
      legalContinuation.continuationExpiresInSeconds,
    )
  ) {
    clearPasswordlessLoginFlow()
    return null
  }

  return legalContinuation
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
    legalContinuation: null,
    request: {
      email: normalizeEmail(email),
      expiresInSeconds,
      requestedAt: Date.now(),
      resendAvailableInSeconds,
    },
  })
}

export function savePasswordlessLoginLegalContinuation({
  continuationExpiresInSeconds,
  continuationToken,
  email,
}: {
  continuationExpiresInSeconds: number
  continuationToken: string
  email: string
}) {
  writePasswordlessLoginFlowState({
    legalContinuation: {
      continuationExpiresInSeconds,
      continuationToken,
      email: normalizeEmail(email),
      verifiedAt: Date.now(),
    },
    request: null,
  })
}
