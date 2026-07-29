import { describe, expect, it } from 'vitest'

import {
  CHAT_ATTACHMENT_MAX_BYTES,
  admitAttachmentFiles,
  createAttachmentBatchSignature,
  normalizeAttachmentFile,
  type AttachmentDraftItem,
} from './attachmentDraft'

function createFile({
  bytes = 'file',
  lastModified = 1_777_000_000_000,
  name = 'file.txt',
  size,
  type = 'text/plain',
}: {
  bytes?: BlobPart
  lastModified?: number
  name?: string
  size?: number
  type?: string
} = {}) {
  return new File([size === undefined ? bytes : new Uint8Array(size)], name, {
    lastModified,
    type,
  })
}

function createItem(
  file: File,
  id = `existing-${file.name}`,
): AttachmentDraftItem {
  return {
    file,
    id,
    source: 'picker',
  }
}

describe('attachment draft admission', () => {
  it('preserves existing items and accepts new files in source order', () => {
    const existing = createItem(createFile({ name: 'existing.pdf' }))
    const second = createFile({ name: 'second.png', type: 'image/png' })
    const third = createFile({ name: 'third.txt' })
    let nextId = 0

    const result = admitAttachmentFiles({
      createId: () => `new-${(nextId += 1)}`,
      currentItems: [existing],
      files: [second, third],
      source: 'picker',
    })

    expect(result.items.map((item) => item.file.name)).toEqual([
      'existing.pdf',
      'second.png',
      'third.txt',
    ])
    expect(result.accepted.map((item) => item.id)).toEqual(['new-1', 'new-2'])
    expect(result.rejections).toEqual([])
  })

  it('accepts five files in order and rejects the sixth without removing accepted files', () => {
    let nextId = 0
    const result = admitAttachmentFiles({
      createId: () => `file-${(nextId += 1)}`,
      currentItems: [],
      files: Array.from({ length: 6 }, (_, index) =>
        createFile({ name: `${index + 1}.txt` }),
      ),
      source: 'picker',
    })

    expect(result.items.map((item) => item.file.name)).toEqual([
      '1.txt',
      '2.txt',
      '3.txt',
      '4.txt',
      '5.txt',
    ])
    expect(result.rejections).toEqual([
      expect.objectContaining({
        code: 'attachment_count_exceeded',
        fileName: '6.txt',
      }),
    ])
  })

  it('accepts exactly 40 MiB and rejects the next byte', () => {
    const exactLimit = createFile({
      name: 'exact.zip',
      size: CHAT_ATTACHMENT_MAX_BYTES,
      type: 'application/zip',
    })
    const firstResult = admitAttachmentFiles({
      createId: () => 'exact',
      currentItems: [],
      files: [exactLimit],
      source: 'picker',
    })
    const overflowResult = admitAttachmentFiles({
      createId: () => 'overflow',
      currentItems: firstResult.items,
      files: [createFile({ name: 'one-byte.txt', size: 1 })],
      source: 'picker',
    })

    expect(firstResult.items).toHaveLength(1)
    expect(firstResult.rejections).toEqual([])
    expect(overflowResult.items).toEqual(firstResult.items)
    expect(overflowResult.rejections).toEqual([
      expect.objectContaining({
        code: 'attachment_batch_too_large',
        fileName: 'one-byte.txt',
      }),
    ])
  })

  it.each([
    {
      code: 'attachment_empty',
      file: () => createFile({ name: 'empty.txt', size: 0 }),
      name: 'an empty file',
    },
    {
      code: 'attachment_file_name_required',
      file: () => createFile({ name: '' }),
      name: 'an empty file name',
    },
    {
      code: 'attachment_file_name_too_long',
      file: () => createFile({ name: `${'a'.repeat(252)}.txt` }),
      name: 'a 256-character file name',
    },
    {
      code: 'attachment_type_not_allowed',
      file: () =>
        createFile({
          name: 'program.exe',
          type: 'application/x-msdownload',
        }),
      name: 'an unsupported MIME and extension',
    },
  ])('rejects $name', ({ code, file }) => {
    const result = admitAttachmentFiles({
      currentItems: [],
      files: [file()],
      source: 'picker',
    })

    expect(result.items).toEqual([])
    expect(result.rejections).toEqual([
      expect.objectContaining({
        code,
      }),
    ])
  })

  it('suppresses an exact duplicate but accepts identical bytes under another name', () => {
    const existingFile = createFile({
      bytes: 'same bytes',
      lastModified: 123,
      name: 'invoice.pdf',
      type: 'application/pdf',
    })
    const exactDuplicate = createFile({
      bytes: 'same bytes',
      lastModified: 123,
      name: 'invoice.pdf',
      type: 'APPLICATION/PDF',
    })
    const renamedCopy = createFile({
      bytes: 'same bytes',
      lastModified: 123,
      name: 'invoice-copy.pdf',
      type: 'application/pdf',
    })
    const result = admitAttachmentFiles({
      createId: () => 'renamed-copy',
      currentItems: [createItem(existingFile)],
      files: [exactDuplicate, renamedCopy],
      source: 'picker',
    })

    expect(result.items.map((item) => item.file.name)).toEqual([
      'invoice.pdf',
      'invoice-copy.pdf',
    ])
    expect(result.accepted).toEqual([
      expect.objectContaining({
        id: 'renamed-copy',
      }),
    ])
    expect(result.rejections).toEqual([
      expect.objectContaining({
        code: 'attachment_duplicate',
        fileName: 'invoice.pdf',
      }),
    ])
  })

  it('keeps valid candidates when another candidate is rejected', () => {
    let nextId = 0
    const result = admitAttachmentFiles({
      createId: () => `accepted-${(nextId += 1)}`,
      currentItems: [],
      files: [
        createFile({ name: 'first.txt' }),
        createFile({ name: 'bad.exe', type: 'application/x-msdownload' }),
        createFile({ name: 'second.pdf', type: 'application/pdf' }),
      ],
      source: 'drop',
    })

    expect(result.items.map((item) => item.file.name)).toEqual([
      'first.txt',
      'second.pdf',
    ])
    expect(result.rejections).toEqual([
      expect.objectContaining({
        code: 'attachment_type_not_allowed',
        fileName: 'bad.exe',
      }),
    ])
  })

  it('infers a known MIME type only when the browser type is empty or generic', () => {
    const emptyType = normalizeAttachmentFile(
      createFile({ name: 'invoice.pdf', type: '' }),
    )
    const genericType = normalizeAttachmentFile(
      createFile({
        name: 'notes.txt',
        type: 'application/octet-stream',
      }),
    )
    const explicitType = normalizeAttachmentFile(
      createFile({
        name: 'invoice.pdf',
        type: 'application/x-msdownload',
      }),
    )

    expect(emptyType.type).toBe('application/pdf')
    expect(genericType.type).toBe('text/plain')
    expect(explicitType.type).toBe('application/x-msdownload')
  })

  it('creates an order-sensitive signature from normalized file identity', () => {
    const first = createItem(
      createFile({ name: 'first.pdf', type: 'application/pdf' }),
      'first',
    )
    const second = createItem(createFile({ name: 'second.txt' }), 'second')

    expect(createAttachmentBatchSignature([first, second])).not.toBe(
      createAttachmentBatchSignature([second, first]),
    )
  })
})
