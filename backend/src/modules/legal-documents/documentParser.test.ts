import { crc32 } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  LEGAL_DOCUMENT_MAX_BYTES,
  LEGAL_DOCUMENT_MAX_TEXT_LENGTH,
} from './legalDocumentTypes.js'
import {
  createLegalDocumentVersion,
  detectLegalDocumentSourceType,
  extractLegalDocumentText,
  normalizeExtractedLegalText,
  sanitizeLegalDocumentSourceFileName,
} from './documentParser.js'

const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function expectToThrowApiCode(callback: () => unknown, code: string) {
  try {
    callback()
  } catch (error) {
    expect(error).toMatchObject({ code })
    return
  }

  throw new Error(`Expected callback to throw ${code}.`)
}

function expectToRejectWithApiCode(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ code })
}

function createMinimalPdfBuffer(text: string) {
  const escaped = text
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)')
  const stream = `BT /F1 24 Tf 72 720 Td (${escaped}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object) => {
    const offset = Buffer.byteLength(pdf, 'ascii')
    pdf += object
    return offset
  })
  const xrefOffset = Buffer.byteLength(pdf, 'ascii')
  const xrefRows = offsets
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('')

  pdf += `xref\n0 6\n0000000000 65535 f \n${xrefRows}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'ascii')
}

function createMinimalDocxBuffer(text: string) {
  return createZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escapeXmlText(text)}</w:t></w:r></w:p></w:body></w:document>`,
    },
  ])
}

function createZip(entries: Array<{ data: string; name: string }>) {
  const fixedDate = new Date('2026-06-18T00:00:00Z')
  const dosTime =
    (fixedDate.getUTCHours() << 11) |
    (fixedDate.getUTCMinutes() << 5) |
    Math.floor(fixedDate.getUTCSeconds() / 2)
  const dosDate =
    ((fixedDate.getUTCFullYear() - 1980) << 9) |
    ((fixedDate.getUTCMonth() + 1) << 5) |
    fixedDate.getUTCDate()
  const fileParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data, 'utf8')
    const checksum = crc32(data) >>> 0
    const localHeader = Buffer.alloc(30 + name.length)

    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)
    name.copy(localHeader, 30)
    fileParts.push(localHeader, data)

    const centralHeader = Buffer.alloc(46 + name.length)

    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    name.copy(centralHeader, 46)
    centralParts.push(centralHeader)
    offset += localHeader.length + data.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const endRecord = Buffer.alloc(22)

  endRecord.writeUInt32LE(0x06054b50, 0)
  endRecord.writeUInt16LE(0, 4)
  endRecord.writeUInt16LE(0, 6)
  endRecord.writeUInt16LE(entries.length, 8)
  endRecord.writeUInt16LE(entries.length, 10)
  endRecord.writeUInt32LE(centralSize, 12)
  endRecord.writeUInt32LE(offset, 16)
  endRecord.writeUInt16LE(0, 20)

  return Buffer.concat([...fileParts, ...centralParts, endRecord])
}

function escapeXmlText(text: string) {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

describe('legal document parser helpers', () => {
  it('accepts txt uploads by extension and content type', () => {
    expect(
      detectLegalDocumentSourceType({
        data: Buffer.from('Пользовательское соглашение\n\nТекст документа.'),
        fileName: 'terms.txt',
        mimeType: 'text/plain',
      }),
    ).toBe('txt')
  })

  it('accepts pdf uploads only when the file starts with the PDF signature', () => {
    expect(
      detectLegalDocumentSourceType({
        data: Buffer.from('%PDF-1.7\nbody'),
        fileName: 'terms.pdf',
        mimeType: 'application/pdf',
      }),
    ).toBe('pdf')
  })

  it('accepts docx uploads only when the file has a ZIP signature', () => {
    expect(
      detectLegalDocumentSourceType({
        data: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
        fileName: 'privacy.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBe('docx')
  })

  it('rejects empty files before parser dependencies run', () => {
    expectToThrowApiCode(
      () =>
        detectLegalDocumentSourceType({
          data: Buffer.alloc(0),
          fileName: 'terms.pdf',
          mimeType: 'application/pdf',
        }),
      'LEGAL_DOCUMENT_EMPTY',
    )
  })

  it('rejects unsupported file extensions and MIME types', () => {
    expectToThrowApiCode(
      () =>
        detectLegalDocumentSourceType({
          data: Buffer.from('<script>alert(1)</script>'),
          fileName: 'terms.html',
          mimeType: 'text/html',
        }),
      'LEGAL_DOCUMENT_TYPE_UNSUPPORTED',
    )
  })

  it('sanitizes uploaded source filenames before storing metadata', () => {
    expect(
      sanitizeLegalDocumentSourceFileName('..\\nested/terms\u0000.pdf'),
    ).toBe('terms.pdf')
  })

  it('rejects source filenames that become empty after sanitization', () => {
    expectToThrowApiCode(
      () => sanitizeLegalDocumentSourceFileName('\u0000/'),
      'LEGAL_DOCUMENT_FILE_NAME_INVALID',
    )
  })

  it('normalizes extracted legal text without preserving unsafe markup', () => {
    expect(
      normalizeExtractedLegalText(
        '  Заголовок\r\n\r\n\r\nПункт 1\t\tПункт 2  ',
      ),
    ).toBe('Заголовок\n\nПункт 1 Пункт 2')
  })

  it('rejects parsed text that is too short to be a legal document', () => {
    expectToThrowApiCode(
      () => normalizeExtractedLegalText('коротко'),
      'LEGAL_DOCUMENT_TEXT_EMPTY',
    )
  })

  it('rejects parsed text above the stored text limit', () => {
    expectToThrowApiCode(
      () =>
        normalizeExtractedLegalText(
          'а'.repeat(LEGAL_DOCUMENT_MAX_TEXT_LENGTH + 1),
        ),
      'LEGAL_DOCUMENT_TEXT_TOO_LARGE',
    )
  })

  it('keeps upload size limit explicit for route limits', () => {
    expect(LEGAL_DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  it('generates distinct versions for repeated uploads of the same file', () => {
    const at = new Date('2026-06-18T10:20:30.456Z')
    const sourceSha256 = 'a'.repeat(64)

    expect(createLegalDocumentVersion({ at, sourceSha256 })).not.toBe(
      createLegalDocumentVersion({ at, sourceSha256 }),
    )
  })

  it('extracts selectable text from a PDF legal document', async () => {
    await expect(
      extractLegalDocumentText({
        data: createMinimalPdfBuffer('Legal terms text for upload'),
        fileName: 'sample-terms.pdf',
        mimeType: 'application/pdf',
      }),
    ).resolves.toContain('Legal terms text for upload')
  })

  it('extracts raw text from a DOCX legal document', async () => {
    await expect(
      extractLegalDocumentText({
        data: createMinimalDocxBuffer('Privacy policy text for upload'),
        fileName: 'sample-privacy.docx',
        mimeType: docxMime,
      }),
    ).resolves.toContain('Privacy policy text for upload')
  })

  it('maps malformed DOCX parser errors to a controlled upload error', async () => {
    await expectToRejectWithApiCode(
      extractLegalDocumentText({
        data: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
        fileName: 'broken.docx',
        mimeType: docxMime,
      }),
      'LEGAL_DOCUMENT_PARSE_FAILED',
    )
  })

  it('maps malformed PDF parser errors to a controlled upload error', async () => {
    await expectToRejectWithApiCode(
      extractLegalDocumentText({
        data: Buffer.from('%PDF-1.7\nbroken'),
        fileName: 'broken.pdf',
        mimeType: 'application/pdf',
      }),
      'LEGAL_DOCUMENT_PARSE_FAILED',
    )
  })
})
