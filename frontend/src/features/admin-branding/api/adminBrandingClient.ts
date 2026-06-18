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

export type BrandingLayout = {
  authBrandPlacement: 'center' | 'left' | 'right'
}

export type BrandingAppearance = {
  authBackgroundOverlay: 'dark' | 'light' | 'none'
  authButtonStyle: 'gradient' | 'solid'
  authColorScheme: 'dark' | 'light'
  authFieldStyle: 'outline' | 'solid' | 'translucent'
}

export type BrandingAssetKind =
  | 'logo'
  | 'pwa_icon'
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

export type SupportContact = {
  phoneDisplay: string | null
  phoneHref: string | null
}

export type AdminBrandingResponse = {
  branding: {
    appearance: BrandingAppearance
    assets: BrandingAssets
    colors: BrandingColors
    copy: BrandingCopy
    layout: BrandingLayout
    portalName: string
    supportContact: SupportContact
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
  appearance: Partial<BrandingAppearance>
  colors: Partial<BrandingColors>
  copy: Partial<BrandingCopy>
  layout: Partial<BrandingLayout>
  portalName: string
  supportLabel: string
  supportPhoneDisplay: string
}>

export type AdminLegalDocumentType = 'privacy' | 'terms'

export type AdminLegalDocumentSummary = {
  activatedAt: string
  bodyCharacterCount: number
  documentType: AdminLegalDocumentType
  sourceContentType: string
  sourceFileName: string
  sourceSha256: string
  title: string
  version: string
}

export type AdminLegalDocumentsResponse = {
  documents: Record<AdminLegalDocumentType, AdminLegalDocumentSummary | null>
}

export type AdminLegalDocumentUploadResponse = {
  document: AdminLegalDocumentSummary
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

export function uploadAdminBrandingAsset(kind: BrandingAssetKind, file: File) {
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

export function getAdminLegalDocuments() {
  return request<AdminLegalDocumentsResponse>('/admin/legal-documents', {
    method: 'GET',
  })
}

export function uploadAdminLegalDocument(
  documentType: AdminLegalDocumentType,
  file: File,
) {
  const formData = new FormData()

  formData.set('document', file)

  return request<AdminLegalDocumentUploadResponse>(
    `/admin/legal-documents/${documentType}`,
    {
      body: formData,
      method: 'POST',
    },
  )
}
