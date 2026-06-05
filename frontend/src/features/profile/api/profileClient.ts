const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Не удалось загрузить профиль. Проверьте подключение и попробуйте еще раз.'

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

type ProfileRequestOptions = {
  signal?: AbortSignal
}

export type UserProfile = {
  avatarUrl: string | null
  email: string
  fullName: string
  phoneNumber: string | null
  reason?: 'contact_unavailable'
  result: 'ready' | 'unavailable'
}

export type ProfileAvatarUpdateResponse = {
  avatarUrl: string
  result: 'updated'
}

export class ProfileApiClientError extends Error {
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

    this.name = 'ProfileApiClientError'
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
  {
    body,
    method = 'GET',
    networkErrorMessage = NETWORK_ERROR_MESSAGE,
    signal,
  }: {
    body?: BodyInit
    method?: 'GET' | 'POST'
    networkErrorMessage?: string
    signal?: AbortSignal
  } = {},
) {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      body,
      credentials: 'include',
      method,
      signal,
    })
  } catch {
    throw new ProfileApiClientError({
      message: networkErrorMessage,
      statusCode: 0,
    })
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new ProfileApiClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? networkErrorMessage,
      statusCode: response.status,
    })
  }

  return payload as TResponse
}

export async function getCurrentUserProfile({
  signal,
}: ProfileRequestOptions = {}) {
  return request<UserProfile>('/profile', {
    method: 'GET',
    signal,
  })
}

export async function updateProfileAvatar(file: File) {
  const formData = new FormData()

  formData.set('avatar', file)

  return request<ProfileAvatarUpdateResponse>('/profile/avatar', {
    body: formData,
    method: 'POST',
    networkErrorMessage:
      'Не удалось загрузить аватар. Проверьте файл и попробуйте еще раз.',
  })
}
