import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ComposerAttachmentMenu } from './ComposerAttachmentMenu'

describe('ComposerAttachmentMenu', () => {
  it('opens three native attachment sources with the correct input contracts', async () => {
    const user = userEvent.setup()

    render(
      <ComposerAttachmentMenu disabled={false} onFilesSelected={vi.fn()} />,
    )

    const mediaInput = screen.getByLabelText('Фото и видео')
    const cameraInput = screen.getByLabelText('Камера')
    const fileInput = screen.getByLabelText('Файл вложения')
    const mediaInputClick = vi.spyOn(mediaInput, 'click')
    const cameraInputClick = vi.spyOn(cameraInput, 'click')
    const fileInputClick = vi.spyOn(fileInput, 'click')

    expect(mediaInput).toHaveAttribute('accept', 'image/*,video/*')
    expect(mediaInput).toHaveAttribute('multiple')
    expect(cameraInput).toHaveAttribute('accept', 'image/*')
    expect(cameraInput).toHaveAttribute('capture', 'environment')
    expect(cameraInput).not.toHaveAttribute('multiple')
    expect(fileInput).toHaveAttribute('multiple')

    await user.click(screen.getByRole('button', { name: 'Прикрепить файл' }))
    await user.click(screen.getByRole('button', { name: 'Фото и видео' }))
    expect(mediaInputClick).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Прикрепить файл' }))
    await user.click(screen.getByRole('button', { name: 'Камера' }))
    expect(cameraInputClick).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Прикрепить файл' }))
    await user.click(screen.getByRole('button', { name: 'Файл' }))
    expect(fileInputClick).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and restores focus to the paperclip', async () => {
    const user = userEvent.setup()

    render(
      <ComposerAttachmentMenu disabled={false} onFilesSelected={vi.fn()} />,
    )

    const trigger = screen.getByRole('button', { name: 'Прикрепить файл' })

    trigger.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('dialog', { name: 'Добавить вложение' }),
    ).toBeVisible()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Добавить вложение' }),
      ).not.toBeInTheDocument()
    })
    expect(trigger).toHaveFocus()
  })

  it('routes media and files through picker admission and camera through camera admission', async () => {
    const user = userEvent.setup()
    const onFilesSelected = vi.fn()
    const media = new File(['media'], 'gallery.jpg', { type: 'image/jpeg' })
    const camera = new File(['camera'], 'camera.jpg', { type: 'image/jpeg' })
    const document = new File(['document'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    render(
      <ComposerAttachmentMenu
        disabled={false}
        onFilesSelected={onFilesSelected}
      />,
    )

    const mediaInput = screen.getByLabelText('Фото и видео')
    const cameraInput = screen.getByLabelText('Камера')
    const fileInput = screen.getByLabelText('Файл вложения')

    await user.upload(mediaInput, media)
    await user.upload(cameraInput, camera)
    await user.upload(fileInput, document)

    expect(onFilesSelected.mock.calls).toEqual([
      [[media], 'picker'],
      [[camera], 'camera'],
      [[document], 'picker'],
    ])
    expect(mediaInput).toHaveValue('')
    expect(cameraInput).toHaveValue('')
    expect(fileInput).toHaveValue('')
  })
})
