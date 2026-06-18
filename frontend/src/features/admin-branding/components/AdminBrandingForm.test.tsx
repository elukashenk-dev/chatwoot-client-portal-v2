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
  supportPhoneDisplay: '+7 (846) 211-11-11',
} satisfies BrandingDraft

const legalDocuments = {
  privacy: null,
  terms: {
    activatedAt: '2026-06-18T10:00:00.000Z',
    bodyCharacterCount: 1200,
    documentType: 'terms',
    sourceContentType: 'application/pdf',
    sourceFileName: 'terms.pdf',
    sourceSha256: 'abc',
    title: 'Пользовательское соглашение',
    version: '20260618-abc',
  },
} satisfies Parameters<typeof AdminBrandingForm>[0]['legalDocuments']

function renderForm(
  overrides: Partial<Parameters<typeof AdminBrandingForm>[0]> = {},
) {
  const props = {
    areAssetActionsDisabled: false,
    areLegalDocumentActionsDisabled: false,
    assetActionKind: null,
    draft,
    isSaving: false,
    isSubmitDisabled: false,
    legalDocumentActionType: null,
    legalDocuments,
    onAssetDelete: vi.fn(),
    onAssetUpload: vi.fn(),
    onAssetValidationError: vi.fn(),
    onChange: vi.fn(),
    onLegalDocumentUpload: vi.fn(),
    onLegalDocumentValidationError: vi.fn(),
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
      screen.getByRole('region', { name: 'Юридические документы' }),
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

  it('emits support phone changes from the main fields', () => {
    const onChange = vi.fn()

    renderForm({ onChange })

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Телефон поддержки' }),
      {
        target: { value: '+7 (846) 222-22-22' },
      },
    )

    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      supportPhoneDisplay: '+7 (846) 222-22-22',
    })
  })

  it('uploads legal documents without inline editing controls', () => {
    const onLegalDocumentUpload = vi.fn()
    const file = new File(['legal text'], 'privacy.pdf', {
      type: 'application/pdf',
    })

    renderForm({ onLegalDocumentUpload })

    expect(screen.getByText(/Файл: terms\.pdf/u)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(/terms/u)).not.toBeInTheDocument()

    fireEvent.change(
      screen.getByLabelText('Загрузить политику обработки персональных данных'),
      {
        target: { files: [file] },
      },
    )

    expect(onLegalDocumentUpload).toHaveBeenCalledWith('privacy', file)
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
