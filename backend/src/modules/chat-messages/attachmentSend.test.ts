import { describe, expect, it } from 'vitest'

import {
  CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  createAttachmentPayloadSha256,
  normalizeAttachmentUploads,
} from './attachmentSend.js'
import type { PortalAttachmentUpload } from './types.js'

function createUpload({
  data = Buffer.from('file'),
  fileName = 'file.txt',
  mimeType = 'text/plain',
}: {
  data?: Buffer
  fileName?: string
  mimeType?: string
} = {}): PortalAttachmentUpload {
  return {
    data,
    fileName,
    mimeType,
    size: data.byteLength,
  }
}

describe('attachmentSend batches', () => {
  it('exports the approved bounded batch limits', () => {
    expect(CHAT_ATTACHMENT_MAX_FILES).toBe(5)
    expect(CHAT_ATTACHMENT_MAX_BYTES).toBe(40 * 1024 * 1024)
    expect(CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH).toBe(255)
  })

  it('normalizes an ordered attachment batch', () => {
    const first = createUpload({
      data: Buffer.from('first'),
      fileName: ' first.pdf ',
      mimeType: 'Application/PDF',
    })
    const second = createUpload({
      data: Buffer.from('second'),
      fileName: ' second.txt ',
      mimeType: 'Text/Plain',
    })

    expect(normalizeAttachmentUploads([first, second])).toMatchObject([
      {
        fileName: 'first.pdf',
        mimeType: 'application/pdf',
        size: 5,
      },
      {
        fileName: 'second.txt',
        mimeType: 'text/plain',
        size: 6,
      },
    ])
  })

  it.each([
    {
      attachments: () => [],
      code: 'attachment_required',
      name: 'zero files',
      statusCode: 400,
    },
    {
      attachments: () =>
        Array.from({ length: 6 }, (_, index) =>
          createUpload({ fileName: `file-${index}.txt` }),
        ),
      code: 'attachment_count_exceeded',
      name: 'six files',
      statusCode: 400,
    },
    {
      attachments: () => [createUpload({ data: Buffer.alloc(0) })],
      code: 'attachment_empty',
      name: 'an empty file',
      statusCode: 400,
    },
    {
      attachments: () => [
        createUpload({
          data: Buffer.alloc(CHAT_ATTACHMENT_MAX_BYTES),
          fileName: 'large.bin',
          mimeType: 'application/zip',
        }),
        createUpload({
          data: Buffer.alloc(1),
          fileName: 'overflow.bin',
          mimeType: 'application/zip',
        }),
      ],
      code: 'attachment_batch_too_large',
      name: 'an aggregate byte overflow',
      statusCode: 413,
    },
    {
      attachments: () => [
        createUpload({
          fileName: 'script.exe',
          mimeType: 'application/x-msdownload',
        }),
      ],
      code: 'attachment_type_not_allowed',
      name: 'an unsupported MIME type',
      statusCode: 415,
    },
  ])('rejects $name', ({ attachments, code, statusCode }) => {
    let error: unknown

    try {
      normalizeAttachmentUploads(attachments())
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toMatchObject({
      code,
      statusCode,
    })
  })

  it('binds file bytes, order, caption and reply target into the batch hash', () => {
    const first = createUpload({
      data: Buffer.from('first'),
      fileName: 'first.pdf',
      mimeType: 'application/pdf',
    })
    const second = createUpload({
      data: Buffer.from('second'),
      fileName: 'second.txt',
      mimeType: 'text/plain',
    })
    const baseHash = createAttachmentPayloadSha256(
      [first, second],
      'caption',
      77,
    )
    const changedBytes = createUpload({
      data: Buffer.from('FIRST'),
      fileName: 'first.pdf',
      mimeType: 'application/pdf',
    })

    for (const changedHash of [
      createAttachmentPayloadSha256(
        [changedBytes, second],
        'caption',
        77,
      ),
      createAttachmentPayloadSha256([second, first], 'caption', 77),
      createAttachmentPayloadSha256([first, second], 'changed', 77),
      createAttachmentPayloadSha256([first, second], 'caption', 78),
    ]) {
      expect(changedHash).not.toBe(baseHash)
    }
  })
})
