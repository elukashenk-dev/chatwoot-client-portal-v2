import type { FormEvent } from 'react'

import type {
  BrandingAssetKind,
  BrandingAppearance,
  BrandingCopy,
  BrandingLayout,
} from '../api/adminBrandingClient'
import { defaultBrandingColors } from '../../branding/lib/brandingDefaults'
import type { BrandingDraft } from '../lib/brandingState'
import { AuthAppearanceControls } from './AuthAppearanceControls'
import { AuthBrandPlacementField } from './AuthBrandPlacementField'
import { BrandingAssetControls } from './BrandingAssetControls'
import { BrandingColorControls } from './BrandingColorControls'
import { BrandingFormSection } from './BrandingFormSection'
import { BrandingTextField } from './BrandingTextField'

type AdminBrandingFormProps = {
  areAssetActionsDisabled: boolean
  assetActionKind: BrandingAssetKind | null
  draft: BrandingDraft
  isSubmitDisabled: boolean
  isSaving: boolean
  onAssetDelete: (kind: BrandingAssetKind) => void
  onAssetUpload: (kind: BrandingAssetKind, file: File) => void
  onAssetValidationError: (message: string) => void
  onChange: (draft: BrandingDraft) => void
  onSubmit: () => void
}

export function AdminBrandingForm({
  areAssetActionsDisabled,
  assetActionKind,
  draft,
  isSubmitDisabled,
  isSaving,
  onAssetDelete,
  onAssetUpload,
  onAssetValidationError,
  onChange,
  onSubmit,
}: AdminBrandingFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  function resetColors() {
    onChange({
      ...draft,
      colors: { ...defaultBrandingColors },
    })
  }

  function updateCopy(key: keyof BrandingCopy, value: string) {
    onChange({
      ...draft,
      copy: {
        ...draft.copy,
        [key]: value,
      },
    })
  }

  function updateLayout<Key extends keyof BrandingLayout>(
    key: Key,
    value: BrandingLayout[Key],
  ) {
    onChange({
      ...draft,
      layout: {
        ...draft.layout,
        [key]: value,
      },
    })
  }

  function updateAppearance<Key extends keyof BrandingAppearance>(
    key: Key,
    value: BrandingAppearance[Key],
  ) {
    onChange({
      ...draft,
      appearance: {
        ...draft.appearance,
        [key]: value,
      },
    })
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <BrandingFormSection
        description="Как портал и команда поддержки называются для клиента."
        id="main"
        title="Основное"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <BrandingTextField
            disabled={isSaving}
            label="Название портала"
            name="portalName"
            onChange={(value) => {
              onChange({ ...draft, portalName: value })
            }}
            value={draft.portalName}
          />
          <BrandingTextField
            disabled={isSaving}
            label="Название команды поддержки"
            name="supportLabel"
            onChange={(value) => {
              onChange({ ...draft, supportLabel: value })
            }}
            value={draft.supportLabel}
          />
        </div>
      </BrandingFormSection>

      <BrandingFormSection
        description="Цвета страницы входа, чата и шапки чата."
        headerAction={
          <button
            className="inline-flex min-h-9 w-fit items-center justify-center rounded-[0.55rem] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-900 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={isSaving}
            onClick={resetColors}
            type="button"
          >
            Сбросить цвета
          </button>
        }
        id="colors"
        title="Цвета"
      >
        <BrandingColorControls
          disabled={isSaving}
          onChange={(colors) => {
            onChange({ ...draft, colors })
          }}
          value={draft.colors}
        />
      </BrandingFormSection>

      <BrandingFormSection
        description="Логотип, иконка приложения и фоны для входа и чата."
        id="assets"
        title="Изображения"
      >
        <BrandingAssetControls
          assets={draft.assets}
          busyKind={assetActionKind}
          disabled={areAssetActionsDisabled}
          onDelete={onAssetDelete}
          onUpload={onAssetUpload}
          onValidationError={onAssetValidationError}
        />
      </BrandingFormSection>

      <BrandingFormSection
        description="Заголовок и пояснение на странице входа."
        id="auth"
        title="Экран входа"
      >
        <div className="grid gap-4">
          <AuthBrandPlacementField
            disabled={isSaving}
            onChange={(value) => {
              updateLayout('authBrandPlacement', value)
            }}
            value={draft.layout.authBrandPlacement}
          />
          <AuthAppearanceControls
            disabled={isSaving}
            onChange={updateAppearance}
            value={draft.appearance}
          />
          <BrandingTextField
            disabled={isSaving}
            label="Заголовок входа"
            name="copy.authTitle"
            onChange={(value) => {
              updateCopy('authTitle', value)
            }}
            value={draft.copy.authTitle}
          />
          <BrandingTextField
            disabled={isSaving}
            label="Подзаголовок входа"
            name="copy.authSubtitle"
            onChange={(value) => {
              updateCopy('authSubtitle', value)
            }}
            value={draft.copy.authSubtitle}
          />
        </div>
      </BrandingFormSection>

      <div className="sticky bottom-0 -mx-6 border-t border-slate-200 bg-slate-100/95 px-6 py-4 backdrop-blur">
        <button
          aria-busy={isSaving ? true : undefined}
          className="inline-flex min-h-11 min-w-[10.75rem] items-center justify-center rounded-[0.6rem] bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isSubmitDisabled}
          type="submit"
        >
          Сохранить настройки
        </button>
      </div>
    </form>
  )
}
