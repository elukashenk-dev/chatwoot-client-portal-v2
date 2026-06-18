import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { defaultBrandingColors } from '../../branding/lib/brandingDefaults'
import type { BrandingDraft } from '../lib/brandingState'
import { AdminBrandingForm } from './AdminBrandingForm'

const draft = {
  appearance: {
    authBackgroundOverlay: 'none',
    authButtonStyle: 'solid',
    authColorScheme: 'light',
    authFieldStyle: 'solid',
  },
  assets: {},
  colors: { ...defaultBrandingColors },
  copy: {
    authSubtitle: 'Войдите в кабинет.',
    authTitle: 'Кабинет клиента',
    chatEmptyBody: 'Напишите вопрос.',
    chatEmptyTitle: 'Начните диалог',
    chatInfoTitle: 'О диалоге',
  },
  layout: {
    authBrandPlacement: 'center',
  },
  portalName: 'Client portal',
  supportLabel: 'Support team',
} satisfies BrandingDraft

function renderForm(
  overrides: Partial<Parameters<typeof AdminBrandingForm>[0]> = {},
) {
  const props = {
    areAssetActionsDisabled: false,
    assetActionKind: null,
    draft,
    isSaving: false,
    isSubmitDisabled: false,
    onAssetDelete: vi.fn(),
    onAssetUpload: vi.fn(),
    onAssetValidationError: vi.fn(),
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof AdminBrandingForm>[0]

  render(<AdminBrandingForm {...props} />)

  return props
}

describe('AdminBrandingForm', () => {
  it('exposes the editable branding groups as named sections', () => {
    renderForm()

    expect(screen.getByRole('region', { name: 'Основное' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Цвета' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Изображения' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Экран входа' }),
    ).toBeInTheDocument()
  })

  it('emits top-level draft changes from the main fields', () => {
    const onChange = vi.fn()

    renderForm({ onChange })

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Название портала' }),
      {
        target: { value: 'Updated portal' },
      },
    )

    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      portalName: 'Updated portal',
    })
  })

  it('keeps readable chat header text while changing the header background', () => {
    const onChange = vi.fn()

    renderForm({ onChange })

    fireEvent.change(screen.getByRole('textbox', { name: 'Фон шапки чата' }), {
      target: { value: '#000000' },
    })

    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      colors: {
        ...draft.colors,
        chatHeaderBackground: '#000000',
        chatHeaderText: '#ffffff',
      },
    })
  })

  it('submits the current draft through the form action', () => {
    const onSubmit = vi.fn()

    renderForm({ onSubmit })

    fireEvent.submit(
      screen.getByRole('button', { name: 'Сохранить настройки' }),
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
