import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ComposerAttachmentTray } from './ComposerAttachmentTray'

function createViewItem({
  id,
  name,
  previewUrl = null,
  type = 'text/plain',
}: {
  id: string
  name: string
  previewUrl?: string | null
  type?: string
}) {
  return {
    file: new File(['content'], name, {
      lastModified: 1_777_000_000_000,
      type,
    }),
    id,
    previewUrl,
    source: 'picker' as const,
  }
}

describe('ComposerAttachmentTray', () => {
  it('renders ordered previews, one summary and accessible batch controls', () => {
    const onClear = vi.fn()
    const onRemove = vi.fn()
    const { container } = render(
      <ComposerAttachmentTray
        disabled={false}
        items={[
          createViewItem({
            id: 'image',
            name: 'photo.png',
            previewUrl: 'blob:photo',
            type: 'image/png',
          }),
          createViewItem({ id: 'invoice', name: 'invoice.pdf' }),
          createViewItem({ id: 'notes', name: 'notes.txt' }),
        ]}
        onClear={onClear}
        onRemove={onRemove}
        totalBytes={Math.round(18.4 * 1024 * 1024)}
      />,
    )

    expect(screen.getByText('3/5 · 18,4 МБ')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Убрать файл invoice.pdf' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Очистить файлы' }),
    ).toBeVisible()
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(container.querySelector('img[alt=""]')).toHaveAttribute(
      'src',
      'blob:photo',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Убрать файл invoice.pdf' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Очистить файлы' }))

    expect(onRemove).toHaveBeenCalledExactlyOnceWith('invoice')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('renders nothing for an empty draft', () => {
    const { container } = render(
      <ComposerAttachmentTray
        disabled={false}
        items={[]}
        onClear={vi.fn()}
        onRemove={vi.fn()}
        totalBytes={0}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
