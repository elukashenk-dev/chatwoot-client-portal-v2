type StoredPasswordResetRequest = {
  email: string
  expiresInSeconds: number
  requestedAt: number
  resendAvailableInSeconds: number
}

type StoredPasswordResetVerification = {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
  verifiedAt: number
}

type PasswordResetFlowState = {
  request: StoredPasswordResetRequest | null
  verification: StoredPasswordResetVerification | null
}

const STORAGE_KEY = 'portal.password-reset-flow'

function createEmptyState(): PasswordResetFlowState {
  return {
    request: null,
    verification: null,
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

function readPasswordResetFlowState(): PasswordResetFlowState {
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
    ) as Partial<PasswordResetFlowState>

    return {
      request: parsedState.request ?? null,
      verification: parsedState.verification ?? null,
    }
  } catch {
    return createEmptyState()
  }
}

function writePasswordResetFlowState(state: PasswordResetFlowState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (!state.request && !state.verification) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures and keep the flow functional for the current render.
  }
}

export function clearPasswordResetFlow() {
  writePasswordResetFlowState(createEmptyState())
}

export function clearPasswordResetVerification() {
  const currentState = readPasswordResetFlowState()

  writePasswordResetFlowState({
    ...currentState,
    verification: null,
  })
}

export function getStoredPasswordResetRequest() {
  const currentState = readPasswordResetFlowState()
  const request = currentState.request

  if (!request) {
    return null
  }

  if (
    !isFinitePositiveNumber(request.requestedAt) ||
    !isFinitePositiveNumber(request.expiresInSeconds) ||
    hasExpired(request.requestedAt, request.expiresInSeconds)
  ) {
    clearPasswordResetFlow()
    return null
  }

  return request
}

export function getStoredPasswordResetVerification() {
  const currentState = readPasswordResetFlowState()
  const request = currentState.request
  const verification = currentState.verification

  if (!verification) {
    return null
  }

  if (!request) {
    clearPasswordResetFlow()
    return null
  }

  if (
    !isFinitePositiveNumber(request.requestedAt) ||
    !isFinitePositiveNumber(request.expiresInSeconds) ||
    hasExpired(request.requestedAt, request.expiresInSeconds)
  ) {
    clearPasswordResetFlow()
    return null
  }

  if (
    !isFinitePositiveNumber(verification.verifiedAt) ||
    !isFinitePositiveNumber(verification.continuationExpiresInSeconds) ||
    hasExpired(
      verification.verifiedAt,
      verification.continuationExpiresInSeconds,
    )
  ) {
    clearPasswordResetVerification()
    return null
  }

  return verification
}

export function savePasswordResetRequest({
  email,
  expiresInSeconds,
  resendAvailableInSeconds,
}: {
  email: string
  expiresInSeconds: number
  resendAvailableInSeconds: number
}) {
  writePasswordResetFlowState({
    request: {
      email: normalizeEmail(email),
      expiresInSeconds,
      requestedAt: Date.now(),
      resendAvailableInSeconds,
    },
    verification: null,
  })
}

export function savePasswordResetVerification({
  continuationToken,
  continuationExpiresInSeconds,
  email,
}: {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
}) {
  const currentState = readPasswordResetFlowState()

  writePasswordResetFlowState({
    ...currentState,
    verification: {
      continuationToken,
      continuationExpiresInSeconds,
      email: normalizeEmail(email),
      verifiedAt: Date.now(),
    },
  })
}
