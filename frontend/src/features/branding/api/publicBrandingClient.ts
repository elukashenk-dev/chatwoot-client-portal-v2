const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли загрузить оформление личного кабинета. Попробуйте обновить страницу.'

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

export type BrandingColors = {
  accent: string
  authBackground: string
  authContentSurface: string
  authContentSurfaceOpacity: number
  authMutedText: string
  authText: string
  chatBackground: string
  chatHeaderBackground: string
  chatHeaderText: string
  chatMutedText: string
  chatText: string
  primary: string
}

export type BrandingCopy = {
  authSubtitle: string
  authTitle: string
  chatEmptyBody: string
  chatEmptyTitle: string
  chatInfoTitle: string
}

export type BrandingAssetKind =
  | 'logo'
  | 'pwa_icon'
  | 'auth_header_image'
  | 'auth_footer_image'
  | 'auth_background_image'
  | 'chat_background_image'
  | 'chat_header_background_image'

export type PublicBrandingAsset = {
  assetVersion: string
  contentType: string
  height: number | null
  id: number
  kind: BrandingAssetKind
  publicUrl: string
  width: number | null
}

export type PublicBrandingAssets = Partial<
  Record<BrandingAssetKind, PublicBrandingAsset>
>

export type PublicBranding = {
  assets: PublicBrandingAssets
  colors: BrandingColors
  copy: BrandingCopy
  portalName: string
  supportLabel: string
  version: number
}

type PublicBrandingResponse = {
  branding: PublicBranding
}

export type PublicBrandingRequestOptions = {
  signal?: AbortSignal
}

export class PublicBrandingClientError extends Error {
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

    this.name = 'PublicBrandingClientError'
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

export async function getPublicBranding({
  signal,
}: PublicBrandingRequestOptions = {}) {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/branding`, {
      cache: 'no-store',
      credentials: 'include',
      method: 'GET',
      signal,
    })
  } catch {
    throw new PublicBrandingClientError({
      message: NETWORK_ERROR_MESSAGE,
      statusCode: 0,
    })
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new PublicBrandingClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? NETWORK_ERROR_MESSAGE,
      statusCode: response.status,
    })
  }

  return (payload as PublicBrandingResponse).branding
}
