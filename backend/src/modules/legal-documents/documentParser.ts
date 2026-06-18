import { createHash, randomBytes } from 'node:crypto'

import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

import { ApiError } from '../../lib/errors.js'
import {
  LEGAL_DOCUMENT_MAX_BYTES,
  LEGAL_DOCUMENT_MAX_CONTENT_TYPE_LENGTH,
  LEGAL_DOCUMENT_MAX_FILE_NAME_LENGTH,
  LEGAL_DOCUMENT_MAX_TEXT_LENGTH,
  LEGAL_DOCUMENT_MIN_TEXT_LENGTH,
  type LegalDocumentUpload,
} from './legalDocumentTypes.js'

export type LegalDocumentSourceType = 'docx' | 'pdf' | 'txt'

const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function hasPdfSignature(data: Buffer) {
  return data.subarray(0, 5).toString('ascii') === '%PDF-'
}

function hasZipSignature(data: Buffer) {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b
}

function getExtension(fileName: string) {
  return fileName.trim().toLowerCase().split('.').pop() ?? ''
}

function removeControlCharacters(input: string) {
  return Array.from(input)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0

      return codePoint > 0x1f && codePoint !== 0x7f
    })
    .join('')
}

export function sanitizeLegalDocumentSourceFileName(fileName: string) {
  const sanitized = removeControlCharacters(fileName)
    .split(/[\\/]/u)
    .pop()
    ?.trim()

  if (!sanitized) {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_FILE_NAME_INVALID',
      'Некорректное имя файла документа.',
    )
  }

  if (sanitized.length > LEGAL_DOCUMENT_MAX_FILE_NAME_LENGTH) {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_FILE_NAME_TOO_LONG',
      'Имя файла документа слишком длинное.',
    )
  }

  return sanitized
}

export function sanitizeLegalDocumentContentType(contentType: string) {
  const sanitized = contentType.trim().toLowerCase()

  if (!sanitized || sanitized.length > LEGAL_DOCUMENT_MAX_CONTENT_TYPE_LENGTH) {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_CONTENT_TYPE_INVALID',
      'Некорректный тип файла документа.',
    )
  }

  return sanitized
}

export function detectLegalDocumentSourceType(
  upload: LegalDocumentUpload,
): LegalDocumentSourceType {
  const fileName = sanitizeLegalDocumentSourceFileName(upload.fileName)
  const mimeType = sanitizeLegalDocumentContentType(upload.mimeType)

  if (upload.data.byteLength === 0) {
    throw new ApiError(400, 'LEGAL_DOCUMENT_EMPTY', 'Файл документа пустой.')
  }

  if (upload.data.byteLength > LEGAL_DOCUMENT_MAX_BYTES) {
    throw new ApiError(
      413,
      'LEGAL_DOCUMENT_TOO_LARGE',
      'Документ должен быть не больше 10 МБ.',
    )
  }

  const extension = getExtension(fileName)

  if (extension === 'txt' && mimeType.startsWith('text/plain')) {
    return 'txt'
  }

  if (
    extension === 'pdf' &&
    mimeType === 'application/pdf' &&
    hasPdfSignature(upload.data)
  ) {
    return 'pdf'
  }

  if (
    extension === 'docx' &&
    mimeType === docxMime &&
    hasZipSignature(upload.data)
  ) {
    return 'docx'
  }

  throw new ApiError(
    415,
    'LEGAL_DOCUMENT_TYPE_UNSUPPORTED',
    'Загрузите документ в формате PDF, DOCX или TXT.',
  )
}

export function normalizeExtractedLegalText(input: string) {
  const normalized = input
    .replace(/\r\n?/gu, '\n')
    .replace(/[\t ]+/gu, ' ')
    .replace(/\n[\t ]+/gu, '\n')
    .replace(/[\t ]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()

  if (normalized.length < LEGAL_DOCUMENT_MIN_TEXT_LENGTH) {
    throw new ApiError(
      422,
      'LEGAL_DOCUMENT_TEXT_EMPTY',
      'Не удалось извлечь текст документа. Проверьте, что файл содержит текст, а не только скан.',
    )
  }

  if (normalized.length > LEGAL_DOCUMENT_MAX_TEXT_LENGTH) {
    throw new ApiError(
      413,
      'LEGAL_DOCUMENT_TEXT_TOO_LARGE',
      'Извлеченный текст документа слишком большой.',
    )
  }

  return normalized
}

export function createLegalDocumentVersion({
  at,
  sourceSha256,
}: {
  at: Date
  sourceSha256: string
}) {
  const timestamp = at.toISOString().replace(/[-:.]/gu, '')
  const randomSuffix = randomBytes(4).toString('hex')

  return `${timestamp}-${sourceSha256.slice(0, 16)}-${randomSuffix}`
}

export function createLegalDocumentSourceSha256(data: Buffer) {
  return createHash('sha256').update(data).digest('hex')
}

export async function extractLegalDocumentText(upload: LegalDocumentUpload) {
  const sourceType = detectLegalDocumentSourceType(upload)

  if (sourceType === 'txt') {
    return normalizeExtractedLegalText(upload.data.toString('utf8'))
  }

  if (sourceType === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: upload.data })

      return normalizeExtractedLegalText(result.value)
    } catch {
      throw new ApiError(
        422,
        'LEGAL_DOCUMENT_PARSE_FAILED',
        'Не удалось прочитать документ. Проверьте файл и попробуйте снова.',
      )
    }
  }

  const parser = new PDFParse({ data: upload.data })

  try {
    const result = await parser.getText()

    return normalizeExtractedLegalText(result.text)
  } catch {
    throw new ApiError(
      422,
      'LEGAL_DOCUMENT_PARSE_FAILED',
      'Не удалось прочитать документ. Проверьте файл и попробуйте снова.',
    )
  } finally {
    await parser.destroy()
  }
}
