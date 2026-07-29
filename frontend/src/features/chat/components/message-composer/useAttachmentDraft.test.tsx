import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAttachmentDraft } from './useAttachmentDraft'

function createFile({
  name,
  type,
}: {
  name: string
  type: string
}) {
  return new File(['content'], name, {
    lastModified: 1_777_000_000_000,
    type,
  })
}

describe('useAttachmentDraft', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    Object.defineProperties(URL, {
      createObjectURL: {
        configurable: true,
        value: vi.fn(),
        writable: true,
      },
      revokeObjectURL: {
        configurable: true,
        value: vi.fn(),
        writable: true,
      },
    })
    createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:preview-1')
      .mockReturnValueOnce('blob:preview-2')
      .mockReturnValueOnce('blob:preview-3')
    revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates image previews only and revokes the removed image URL', () => {
    const image = createFile({ name: 'photo.png', type: 'image/png' })
    const document = createFile({
      name: 'invoice.pdf',
      type: 'application/pdf',
    })
    const { result } = renderHook(() => useAttachmentDraft())

    act(() => {
      result.current.addFiles([image, document], 'picker')
    })

    expect(result.current.items.map((item) => item.file)).toEqual([
      image,
      document,
    ])
    expect(result.current.viewItems).toEqual([
      expect.objectContaining({
        file: image,
        previewUrl: 'blob:preview-1',
      }),
      expect.objectContaining({
        file: document,
        previewUrl: null,
      }),
    ])
    expect(result.current.totalBytes).toBe(image.size + document.size)
    expect(createObjectURL).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.removeItem(result.current.items[0]?.id ?? '')
    })

    expect(result.current.items.map((item) => item.file)).toEqual([document])
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview-1')
  })

  it('clear revokes all remaining image URLs', () => {
    const first = createFile({ name: 'first.png', type: 'image/png' })
    const second = createFile({ name: 'second.webp', type: 'image/webp' })
    const { result } = renderHook(() => useAttachmentDraft())

    act(() => {
      result.current.addFiles([first, second], 'clipboard')
    })
    act(() => {
      result.current.clearItems()
    })

    expect(result.current.items).toEqual([])
    expect(result.current.viewItems).toEqual([])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2')
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('unmount revokes leftover image URLs', () => {
    const image = createFile({ name: 'photo.png', type: 'image/png' })
    const { result, unmount } = renderHook(() => useAttachmentDraft())

    act(() => {
      result.current.addFiles([image], 'drop')
    })
    unmount()

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview-1')
  })

  it('keeps valid files and exposes one summarized rejection message', () => {
    const valid = createFile({ name: 'valid.txt', type: 'text/plain' })
    const invalid = createFile({
      name: 'invalid.exe',
      type: 'application/x-msdownload',
    })
    const { result } = renderHook(() => useAttachmentDraft())

    act(() => {
      result.current.addFiles([valid, invalid], 'picker')
    })

    expect(result.current.items.map((item) => item.file.name)).toEqual([
      'valid.txt',
    ])
    expect(result.current.errorMessage).toContain('invalid.exe')
    expect(result.current.errorMessage).toContain('нельзя отправить')
  })
})
