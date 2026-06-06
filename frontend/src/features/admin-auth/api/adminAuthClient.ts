const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

type AdminRequestOptions = {
  signal?: AbortSignal
}

export type PublicTenantAdmin = {
  chatwootAgentId: number
  email: string
  role: 'administrator'
}

export type AdminLoginRequestResponse = {
  delivery: 'sent' | 'existing_pending'
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'tenant_admin_login'
  resendAvailableInSeconds: number
  result: 'admin_login_challenge_requested'
}

export type AdminSessionResponse = {
  admin: PublicTenantAdmin
  session: {
    expiresAt: string
  }
}

export class AdminApiClientError extends Error {
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

    this.name = 'AdminApiClientError'
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
  init: RequestInit & AdminRequestOptions,
): Promise<TResponse> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
    })
  } catch {
    throw new AdminApiClientError({
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

    throw new AdminApiClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? NETWORK_ERROR_MESSAGE,
      statusCode: response.status,
    })
  }

  return payload as TResponse
}

export async function getCurrentAdminSession({
  signal,
}: AdminRequestOptions = {}) {
  try {
    return await request<AdminSessionResponse>('/admin/auth/me', {
      method: 'GET',
      signal,
    })
  } catch (error) {
    if (error instanceof AdminApiClientError && error.statusCode === 401) {
      return null
    }

    throw error
  }
}

export async function requestAdminLoginCode({ email }: { email: string }) {
  return request<AdminLoginRequestResponse>('/admin/auth/request', {
    body: JSON.stringify({ email }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

export async function verifyAdminLoginCode({
  code,
  email,
}: {
  code: string
  email: string
}) {
  return request<AdminSessionResponse>('/admin/auth/verify', {
    body: JSON.stringify({ code, email }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

export async function logoutAdmin() {
  await request<void>('/admin/auth/logout', {
    method: 'POST',
  })
}
