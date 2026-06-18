const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли загрузить юридический документ. Попробуйте обновить страницу.'

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

export type LegalDocumentId = 'privacy' | 'terms'

export type PublicLegalDocument = {
  bodyText: string
  documentType: LegalDocumentId
  title: string
  version: string
}

type PublicLegalDocumentResponse = {
  document: PublicLegalDocument
}

export class LegalDocumentClientError extends Error {
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

    this.name = 'LegalDocumentClientError'
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

export async function getPublicLegalDocument({
  documentType,
  signal,
}: {
  documentType: LegalDocumentId
  signal?: AbortSignal
}) {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/legal-documents/${documentType}`, {
      cache: 'no-store',
      credentials: 'include',
      method: 'GET',
      signal,
    })
  } catch {
    throw new LegalDocumentClientError({
      message: NETWORK_ERROR_MESSAGE,
      statusCode: 0,
    })
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new LegalDocumentClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? NETWORK_ERROR_MESSAGE,
      statusCode: response.status,
    })
  }

  return (payload as PublicLegalDocumentResponse).document
}
