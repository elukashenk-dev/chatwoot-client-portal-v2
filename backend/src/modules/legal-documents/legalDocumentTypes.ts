export const legalDocumentTypes = ['terms', 'privacy'] as const

export type LegalDocumentType = (typeof legalDocumentTypes)[number]

export const LEGAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const LEGAL_DOCUMENT_REQUEST_MAX_BYTES =
  LEGAL_DOCUMENT_MAX_BYTES + 128 * 1024
export const LEGAL_DOCUMENT_MAX_TEXT_LENGTH = 200_000
export const LEGAL_DOCUMENT_MIN_TEXT_LENGTH = 20
export const LEGAL_DOCUMENT_MAX_FILE_NAME_LENGTH = 180
export const LEGAL_DOCUMENT_MAX_CONTENT_TYPE_LENGTH = 120

export const legalDocumentTitles = {
  privacy: 'Политика обработки персональных данных',
  terms: 'Пользовательское соглашение',
} satisfies Record<LegalDocumentType, string>

export type LegalDocumentUpload = {
  data: Buffer
  fileName: string
  mimeType: string
}
