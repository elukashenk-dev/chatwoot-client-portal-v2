import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BrandingAssetControls } from './BrandingAssetControls'

const logoAsset = {
  assetVersion: '7',
  contentType: 'image/png',
  height: null,
  id: 7,
  kind: 'logo',
  publicUrl: '/api/branding/assets/7?v=7',
  width: null,
} as const

function renderControls(
  overrides: Partial<Parameters<typeof BrandingAssetControls>[0]> = {},
) {
  const props = {
    assets: {},
    busyKind: null,
    disabled: false,
    onDelete: vi.fn(),
    onUpload: vi.fn(),
    onValidationError: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof BrandingAssetControls>[0]

  render(<BrandingAssetControls {...props} />)

  return props
}

describe('BrandingAssetControls', () => {
  it('renders upload, replace and delete actions by slot', () => {
    renderControls({
      assets: {
        logo: logoAsset,
      },
    })

    expect(screen.getByLabelText('Заменить логотип')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Удалить логотип' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Загрузить PWA-иконку')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Логотип' })).toHaveAttribute(
      'src',
      '/api/branding/assets/7?v=7',
    )
  })

  it('uploads a valid file for the selected slot', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn()
    const imageFile = new File(['logo-bytes'], 'logo.png', {
      type: 'image/png',
    })

    renderControls({ onUpload })

    await user.upload(screen.getByLabelText('Загрузить логотип'), imageFile)

    expect(onUpload).toHaveBeenCalledWith('logo', imageFile)
  })

  it('calls delete for a filled slot', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()

    renderControls({
      assets: {
        logo: logoAsset,
      },
      onDelete,
    })

    await user.click(screen.getByRole('button', { name: 'Удалить логотип' }))

    expect(onDelete).toHaveBeenCalledWith('logo')
  })

  it('rejects unsupported file types before upload', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const onUpload = vi.fn()
    const onValidationError = vi.fn()

    renderControls({ onUpload, onValidationError })

    await user.upload(
      screen.getByLabelText('Загрузить логотип'),
      new File(['bad'], 'logo.txt', { type: 'text/plain' }),
    )

    expect(onUpload).not.toHaveBeenCalled()
    expect(onValidationError).toHaveBeenCalledWith(
      'Можно загрузить PNG, JPG, GIF или WebP.',
    )
  })

  it('rejects files over five megabytes before upload', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn()
    const onValidationError = vi.fn()
    const oversizedFile = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      'large.png',
      { type: 'image/png' },
    )

    renderControls({ onUpload, onValidationError })

    await user.upload(screen.getByLabelText('Загрузить логотип'), oversizedFile)

    expect(onUpload).not.toHaveBeenCalled()
    expect(onValidationError).toHaveBeenCalledWith(
      'Файл брендинга должен быть не больше 5 МБ.',
    )
  })

  it('disables actions while an asset operation is active', () => {
    renderControls({
      assets: {
        logo: logoAsset,
      },
      busyKind: 'logo',
      disabled: true,
    })

    expect(screen.getByLabelText('Загружаем логотип')).toBeInTheDocument()
    expect(screen.getByLabelText('Загружаем логотип')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Удалить логотип' }),
    ).toBeDisabled()
  })
})
