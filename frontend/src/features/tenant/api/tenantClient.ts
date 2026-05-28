const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли загрузить данные личного кабинета. Попробуйте обновить страницу.'

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

export type PublicTenantContext = {
  displayName: string
  primaryDomain: string
  publicBaseUrl: string
  slug: string
}

type PublicTenantResponse = {
  tenant: PublicTenantContext
}

export type TenantRequestOptions = {
  signal?: AbortSignal
}

export class TenantClientError extends Error {
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

    this.name = 'TenantClientError'
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

export async function getPublicTenantContext({
  signal,
}: TenantRequestOptions = {}) {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/tenant`, {
      cache: 'no-store',
      credentials: 'include',
      method: 'GET',
      signal,
    })
  } catch {
    throw new TenantClientError({
      message: NETWORK_ERROR_MESSAGE,
      statusCode: 0,
    })
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new TenantClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? NETWORK_ERROR_MESSAGE,
      statusCode: response.status,
    })
  }

  return (payload as PublicTenantResponse).tenant
}
