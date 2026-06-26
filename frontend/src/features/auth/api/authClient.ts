import type {
  AuthenticatedPortalSession,
  LoginFormValues,
  PasswordResetRequestFormValues,
  RegisterRequestFormValues,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

type AuthRequestOptions = {
  signal?: AbortSignal
}

export type RegistrationVerificationRequestResponse = {
  delivery: 'sent' | 'existing_pending'
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'registration'
  resendAvailableInSeconds: number
  result: 'verification_requested'
}

export type RegistrationVerificationConfirmResponse = {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
  nextStep: 'set_password'
  purpose: 'registration'
  result: 'verification_confirmed'
}

export type RegistrationSetPasswordResponse = {
  nextStep: 'chat'
  purpose: 'registration'
  result: 'registration_completed'
  session: AuthenticatedPortalSession['session']
  user: AuthenticatedPortalSession['user']
}

export type RegistrationSkipPasswordResponse = RegistrationSetPasswordResponse

export type PasswordSetupRequestResponse = {
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'password_setup'
  resendAvailableInSeconds: number
  result: 'password_setup_requested'
}

export type PasswordSetupVerificationConfirmResponse = {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
  nextStep: 'set_password'
  purpose: 'password_setup'
  result: 'password_setup_verified'
}

export type PasswordSetupCompleteResponse = {
  nextStep: 'chat'
  purpose: 'password_setup'
  result: 'password_setup_completed'
  session: AuthenticatedPortalSession['session']
  user: AuthenticatedPortalSession['user']
}

export type PasswordResetRequestResponse = {
  accepted: true
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'password_reset'
  resendAvailableInSeconds: number
  result: 'password_reset_requested'
}

export type PasswordResetVerificationConfirmResponse = {
  continuationToken: string
  continuationExpiresInSeconds: number
  email: string
  nextStep: 'set_password'
  purpose: 'password_reset'
  result: 'password_reset_verified'
}

export type PasswordResetSetPasswordResponse = {
  email: string
  nextStep: 'login'
  purpose: 'password_reset'
  result: 'password_reset_completed'
}

export class ApiClientError extends Error {
  readonly code?: string
  readonly statusCode: number

  constructor({
    code,
    message,
    statusCode,
  }: {
    code?: string
    message: string
    statusCode: number
  }) {
    super(message)

    this.name = 'ApiClientError'
    this.code = code
    this.statusCode = statusCode
  }
}

async function parseJsonBody(response: Response) {
  const contentType = response.headers.get('content-type')

  if (!contentType?.includes('application/json')) {
    return null
  }

  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

async function request<TResponse>(
  path: string,
  init: RequestInit & AuthRequestOptions,
): Promise<TResponse> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
    })
  } catch {
    throw new ApiClientError({
      message: NETWORK_ERROR_MESSAGE,
      statusCode: 0,
    })
  }

  if (response.status === 204) {
    return undefined as TResponse
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new ApiClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? NETWORK_ERROR_MESSAGE,
      statusCode: response.status,
    })
  }

  return payload as TResponse
}

type AuthSessionResponse = AuthenticatedPortalSession

export async function getCurrentSession({ signal }: AuthRequestOptions = {}) {
  try {
    return await request<AuthSessionResponse>('/auth/me', {
      headers: {
        'X-Portal-Session-Check': '1',
      },
      method: 'GET',
      signal,
    })
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 401) {
      return null
    }

    throw error
  }
}

export async function getCurrentUser(options: AuthRequestOptions = {}) {
  return (await getCurrentSession(options))?.user ?? null
}

export async function login(credentials: LoginFormValues) {
  return request<AuthSessionResponse>('/auth/login', {
    body: JSON.stringify(credentials),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function logout() {
  await request<void>('/auth/logout', {
    method: 'POST',
  })
}

export async function requestRegistrationVerification(
  requestBody: RegisterRequestFormValues,
) {
  return request<RegistrationVerificationRequestResponse>(
    '/auth/register/request',
    {
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
}

export async function confirmRegistrationVerification({
  code,
  email,
}: {
  code: string
  email: string
}) {
  return request<RegistrationVerificationConfirmResponse>(
    '/auth/register/verify',
    {
      body: JSON.stringify({
        code,
        email,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
}

export async function completeRegistrationSetPassword({
  continuationToken,
  email,
  newPassword,
}: {
  continuationToken: string
  email: string
  newPassword: string
}) {
  return request<RegistrationSetPasswordResponse>(
    '/auth/register/set-password',
    {
      body: JSON.stringify({
        continuationToken,
        email,
        newPassword,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
}

export async function skipRegistrationPassword({
  continuationToken,
  email,
}: {
  continuationToken: string
  email: string
}) {
  return request<RegistrationSkipPasswordResponse>(
    '/auth/register/skip-password',
    {
      body: JSON.stringify({
        continuationToken,
        email,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
}

export async function requestPasswordReset(
  requestBody: PasswordResetRequestFormValues,
) {
  return request<PasswordResetRequestResponse>('/auth/password-reset/request', {
    body: JSON.stringify(requestBody),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function confirmPasswordResetVerification({
  code,
  email,
}: {
  code: string
  email: string
}) {
  return request<PasswordResetVerificationConfirmResponse>(
    '/auth/password-reset/verify',
    {
      body: JSON.stringify({
        code,
        email,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
}

export async function completePasswordResetSetPassword({
  continuationToken,
  email,
  newPassword,
}: {
  continuationToken: string
  email: string
  newPassword: string
}) {
  return request<PasswordResetSetPasswordResponse>(
    '/auth/password-reset/set-password',
    {
      body: JSON.stringify({
        continuationToken,
        email,
        newPassword,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
}

export async function requestPasswordSetup() {
  return request<PasswordSetupRequestResponse>('/auth/password-setup/request', {
    body: JSON.stringify({}),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

export async function verifyPasswordSetupCode({ code }: { code: string }) {
  return request<PasswordSetupVerificationConfirmResponse>(
    '/auth/password-setup/verify',
    {
      body: JSON.stringify({
        code,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
}

export async function completePasswordSetup({
  continuationToken,
  newPassword,
}: {
  continuationToken: string
  newPassword: string
}) {
  return request<PasswordSetupCompleteResponse>('/auth/password-setup/set', {
    body: JSON.stringify({
      continuationToken,
      newPassword,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}
