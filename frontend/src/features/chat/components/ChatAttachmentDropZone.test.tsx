import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChatAttachmentDropZone } from './ChatAttachmentDropZone'

function createTransferItem({
  file = null,
  kind,
}: {
  file?: File | null
  kind: 'file' | 'string'
}) {
  return {
    getAsFile: () => file,
    kind,
    type: file?.type ?? 'text/plain',
  }
}

describe('ChatAttachmentDropZone', () => {
  it('keeps the overlay stable across child transitions and adds files on drop', () => {
    const onFiles = vi.fn()
    const file = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })
    const fileItem = createTransferItem({ file, kind: 'file' })

    render(
      <ChatAttachmentDropZone disabled={false} onFiles={onFiles}>
        <div>Активный чат</div>
      </ChatAttachmentDropZone>,
    )

    const zone = screen.getByText('Активный чат').parentElement

    expect(zone).not.toBeNull()
    expect(
      fireEvent.dragEnter(zone!, {
        dataTransfer: { items: [fileItem] },
      }),
    ).toBe(false)
    fireEvent.dragEnter(zone!, {
      dataTransfer: { items: [fileItem] },
    })
    fireEvent.dragLeave(zone!, {
      dataTransfer: { items: [fileItem] },
    })

    expect(screen.getByText('Перетащите файлы сюда')).toBeVisible()
    expect(screen.getByText('До 5 файлов, общий размер до 40 МБ')).toBeVisible()

    expect(
      fireEvent.drop(zone!, {
        dataTransfer: { items: [fileItem] },
      }),
    ).toBe(false)
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([file])
    expect(screen.queryByText('Перетащите файлы сюда')).not.toBeInTheDocument()
  })

  it('does not intercept dragged text', () => {
    const onFiles = vi.fn()
    const stringItem = createTransferItem({ kind: 'string' })

    render(
      <ChatAttachmentDropZone disabled={false} onFiles={onFiles}>
        <div>Активный чат</div>
      </ChatAttachmentDropZone>,
    )

    const zone = screen.getByText('Активный чат').parentElement

    expect(
      fireEvent.dragEnter(zone!, {
        dataTransfer: { items: [stringItem] },
      }),
    ).toBe(true)
    expect(
      fireEvent.drop(zone!, {
        dataTransfer: { items: [stringItem] },
      }),
    ).toBe(true)
    expect(screen.queryByText('Перетащите файлы сюда')).not.toBeInTheDocument()
    expect(onFiles).not.toHaveBeenCalled()
  })
})
