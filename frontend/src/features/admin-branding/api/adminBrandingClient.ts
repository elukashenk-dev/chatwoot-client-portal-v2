import { AdminApiClientError } from '../../admin-auth/api/adminAuthClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

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

export type BrandingAsset = {
  assetVersion: string
  contentType: string
  height: number | null
  id: number
  kind: BrandingAssetKind
  publicUrl: string
  width: number | null
}

export type BrandingAssets = Partial<Record<BrandingAssetKind, BrandingAsset>>

export type AdminBrandingResponse = {
  branding: {
    assets: BrandingAssets
    colors: BrandingColors
    copy: BrandingCopy
    portalName: string
    supportLabel: string
    version: number
  }
}

export type AdminBrandingAssetUploadResponse = {
  asset: BrandingAsset
}

export type AdminBrandingAssetDeleteResponse = {
  deleted: boolean
}

export type AdminBrandingPatch = Partial<{
  colors: Partial<BrandingColors>
  copy: Partial<BrandingCopy>
  portalName: string
  supportLabel: string
}>

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

async function request<TResponse>(path: string, init: RequestInit) {
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

export function getAdminBranding() {
  return request<AdminBrandingResponse>('/admin/branding', {
    method: 'GET',
  })
}

export function updateAdminBranding(input: AdminBrandingPatch) {
  return request<AdminBrandingResponse>('/admin/branding', {
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  })
}

export function uploadAdminBrandingAsset(
  kind: BrandingAssetKind,
  file: File,
) {
  const formData = new FormData()

  formData.set('asset', file)

  return request<AdminBrandingAssetUploadResponse>(
    `/admin/branding/assets/${kind}`,
    {
      body: formData,
      method: 'POST',
    },
  )
}

export function deleteAdminBrandingAsset(kind: BrandingAssetKind) {
  return request<AdminBrandingAssetDeleteResponse>(
    `/admin/branding/assets/${kind}`,
    {
      method: 'DELETE',
    },
  )
}
