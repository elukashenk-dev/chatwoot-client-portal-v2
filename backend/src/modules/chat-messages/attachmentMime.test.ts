import { describe, expect, it } from 'vitest'

import {
  isAllowedAttachmentMimeType,
  normalizeAttachmentMimeType,
} from './attachmentMime.js'

describe('attachment mime normalization', () => {
  it('infers PNG mime type from a file extension when the browser reports octet-stream', () => {
    expect(
      normalizeAttachmentMimeType({
        fileName: 'Снимок экрана 2026-04-26 в 00.12.34.PNG',
        mimeType: 'application/octet-stream',
      }),
    ).toBe('image/png')
  })

  it('infers PNG mime type from file bytes when Apple omits both type and extension', () => {
    expect(
      normalizeAttachmentMimeType({
        data: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
        fileName: 'image',
        mimeType: '',
      }),
    ).toBe('image/png')
  })

  it('normalizes PNG aliases and keeps unsupported octet-stream files blocked', () => {
    expect(
      normalizeAttachmentMimeType({
        fileName: 'image.png',
        mimeType: 'Application/PNG',
      }),
    ).toBe('image/png')
    expect(isAllowedAttachmentMimeType('image/png')).toBe(true)
    expect(isAllowedAttachmentMimeType('application/octet-stream')).toBe(false)
  })
})
