type StoredRegistrationRequest = {
  email: string
  expiresInSeconds: number
  fullName: string
  requestedAt: number
  resendAvailableInSeconds: number
}

type StoredRegistrationVerification = {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
  verifiedAt: number
}

type RegistrationFlowState = {
  request: StoredRegistrationRequest | null
  verification: StoredRegistrationVerification | null
}

const STORAGE_KEY = 'portal.registration-flow'

function createEmptyState(): RegistrationFlowState {
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

function readRegistrationFlowState(): RegistrationFlowState {
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
    ) as Partial<RegistrationFlowState>

    return {
      request: parsedState.request ?? null,
      verification: parsedState.verification ?? null,
    }
  } catch {
    return createEmptyState()
  }
}

function writeRegistrationFlowState(state: RegistrationFlowState) {
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

export function clearRegistrationFlow() {
  writeRegistrationFlowState(createEmptyState())
}

export function clearRegistrationVerification() {
  const currentState = readRegistrationFlowState()

  writeRegistrationFlowState({
    ...currentState,
    verification: null,
  })
}

export function getStoredRegistrationRequest() {
  const currentState = readRegistrationFlowState()
  const request = currentState.request

  if (!request) {
    return null
  }

  if (
    !isFinitePositiveNumber(request.requestedAt) ||
    !isFinitePositiveNumber(request.expiresInSeconds) ||
    hasExpired(request.requestedAt, request.expiresInSeconds)
  ) {
    clearRegistrationFlow()
    return null
  }

  return request
}

export function getStoredRegistrationVerification() {
  const currentState = readRegistrationFlowState()
  const request = currentState.request
  const verification = currentState.verification

  if (!verification) {
    return null
  }

  if (
    request &&
    (!isFinitePositiveNumber(request.requestedAt) ||
      !isFinitePositiveNumber(request.expiresInSeconds) ||
      hasExpired(request.requestedAt, request.expiresInSeconds))
  ) {
    clearRegistrationFlow()
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
    clearRegistrationVerification()
    return null
  }

  return verification
}

export function saveRegistrationRequest({
  email,
  expiresInSeconds,
  fullName,
  resendAvailableInSeconds,
}: {
  email: string
  expiresInSeconds: number
  fullName: string
  resendAvailableInSeconds: number
}) {
  writeRegistrationFlowState({
    request: {
      email: normalizeEmail(email),
      expiresInSeconds,
      fullName: fullName.trim(),
      requestedAt: Date.now(),
      resendAvailableInSeconds,
    },
    verification: null,
  })
}

export function saveRegistrationVerification({
  continuationToken,
  continuationExpiresInSeconds,
  email,
}: {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
}) {
  const currentState = readRegistrationFlowState()

  writeRegistrationFlowState({
    ...currentState,
    verification: {
      continuationToken,
      continuationExpiresInSeconds,
      email: normalizeEmail(email),
      verifiedAt: Date.now(),
    },
  })
}
