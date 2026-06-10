import type { FormEvent } from 'react'

import type {
  BrandingAssetKind,
  BrandingColors,
  BrandingCopy,
} from '../api/adminBrandingClient'
import { defaultBrandingColors } from '../../branding/lib/brandingDefaults'
import type { BrandingDraft } from '../lib/brandingState'
import { BrandingAssetControls } from './BrandingAssetControls'

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

type TextFieldProps = {
  disabled: boolean
  label: string
  name: string
  onChange: (value: string) => void
  value: string
}

type ColorValueKey = {
  [Key in keyof BrandingColors]: BrandingColors[Key] extends string
    ? Key
    : never
}[keyof BrandingColors]

type ColorFieldConfig = {
  key: ColorValueKey
  label: string
}

const validHexColorPattern = /^#[0-9a-fA-F]{6}$/u

type RgbColor = {
  b: number
  g: number
  r: number
}

const colorFieldGroups = [
  {
    fields: [
      { key: 'primary', label: 'Основной цвет' },
      { key: 'accent', label: 'Акцентный цвет' },
    ],
    title: 'Основные',
  },
  {
    fields: [
      { key: 'authBackground', label: 'Фон auth-страницы' },
      { key: 'authContentSurface', label: 'Фон области входа' },
      { key: 'authText', label: 'Цвет текста auth-экрана' },
      {
        key: 'authMutedText',
        label: 'Цвет вторичного текста auth-экрана',
      },
    ],
    title: 'Auth-экран',
  },
  {
    fields: [
      { key: 'chatBackground', label: 'Фон чата' },
      { key: 'chatText', label: 'Цвет текста чата' },
      { key: 'chatMutedText', label: 'Цвет вторичного текста чата' },
    ],
    title: 'Чат',
  },
  {
    fields: [
      { key: 'chatHeaderBackground', label: 'Фон шапки чата' },
      { key: 'chatHeaderText', label: 'Цвет текста шапки чата' },
    ],
    title: 'Шапка чата',
  },
] satisfies Array<{ fields: ColorFieldConfig[]; title: string }>

function TextField({ disabled, label, name, onChange, value }: TextFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-2 block h-11 w-full appearance-none rounded-[0.55rem] border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        disabled={disabled}
        name={name}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        type="text"
        value={value}
      />
    </label>
  )
}

function getColorPickerValue(value: string) {
  return validHexColorPattern.test(value) ? value : '#000000'
}

function parseHexColor(value: string): RgbColor | null {
  const normalized = value.trim()

  if (!validHexColorPattern.test(normalized)) {
    return null
  }

  return {
    b: Number.parseInt(normalized.slice(5, 7), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    r: Number.parseInt(normalized.slice(1, 3), 16),
  }
}

function getReadableChatHeaderText(backgroundColor: string) {
  const color = parseHexColor(backgroundColor)

  if (!color) {
    return defaultBrandingColors.chatHeaderText
  }

  const isDark =
    (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255 < 0.55

  return isDark ? '#ffffff' : '#0f172a'
}

function shouldSyncChatHeaderText(colors: BrandingColors) {
  const currentText = colors.chatHeaderText.toLowerCase()

  return (
    currentText === defaultBrandingColors.chatHeaderText ||
    currentText === getReadableChatHeaderText(colors.chatHeaderBackground)
  )
}

function ColorField({
  disabled,
  label,
  name,
  onChange,
  value,
}: TextFieldProps) {
  const colorValue = getColorPickerValue(value)
  const textInputId = `${name.replaceAll('.', '-')}-hex`

  return (
    <div className="block">
      <label
        className="text-sm font-medium text-slate-700"
        htmlFor={textInputId}
      >
        {label}
      </label>
      <span className="mt-2 flex h-11 items-center gap-2 rounded-[0.55rem] border border-slate-200 bg-white px-2 shadow-sm focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100 focus-within:outline-none">
        <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-slate-200">
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundColor: colorValue }}
          />
          <input
            aria-label={`Выбрать ${label.toLocaleLowerCase('ru-RU')}`}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 opacity-0 disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={(event) => {
              onChange(event.currentTarget.value)
            }}
            onInput={(event) => {
              onChange(event.currentTarget.value)
            }}
            type="color"
            value={colorValue}
          />
        </span>
        <input
          id={textInputId}
          className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent px-1 text-sm text-slate-950 shadow-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
          disabled={disabled}
          name={name}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          type="text"
          value={value}
        />
      </span>
    </div>
  )
}

function OpacityField({
  disabled,
  label,
  name,
  onChange,
  value,
}: {
  disabled: boolean
  label: string
  name: string
  onChange: (value: number) => void
  value: number
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="mt-2 grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3">
        <input
          aria-label={label}
          className="h-2 w-full accent-brand-800 disabled:cursor-not-allowed"
          disabled={disabled}
          max={100}
          min={0}
          name={name}
          onChange={(event) => {
            onChange(Number(event.currentTarget.value))
          }}
          type="range"
          value={value}
        />
        <input
          aria-label={`${label}, значение`}
          className="h-10 rounded-[0.55rem] border border-slate-200 bg-white px-2 text-sm text-slate-950 shadow-sm focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          disabled={disabled}
          max={100}
          min={0}
          onChange={(event) => {
            onChange(Number(event.currentTarget.value))
          }}
          type="number"
          value={value}
        />
      </span>
    </label>
  )
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

  function updateColor<Key extends keyof BrandingColors>(
    key: Key,
    value: BrandingColors[Key],
  ) {
    const nextColors: BrandingColors = {
      ...draft.colors,
      [key]: value,
    }

    if (
      key === 'chatHeaderBackground' &&
      typeof value === 'string' &&
      shouldSyncChatHeaderText(draft.colors)
    ) {
      nextColors.chatHeaderText = getReadableChatHeaderText(value)
    }

    onChange({
      ...draft,
      colors: nextColors,
    })
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

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <section
        className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm"
        id="main"
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Основное</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Название портала и подпись поддержки.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            disabled={isSaving}
            label="Название портала"
            name="portalName"
            onChange={(value) => {
              onChange({ ...draft, portalName: value })
            }}
            value={draft.portalName}
          />
          <TextField
            disabled={isSaving}
            label="Подпись поддержки"
            name="supportLabel"
            onChange={(value) => {
              onChange({ ...draft, supportLabel: value })
            }}
            value={draft.supportLabel}
          />
        </div>
      </section>

      <section
        className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm"
        id="colors"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Цвета</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Основные цвета auth-экранов, чата и шапки чата.
            </p>
          </div>
          <button
            className="inline-flex min-h-9 w-fit items-center justify-center rounded-[0.55rem] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-900 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={isSaving}
            onClick={resetColors}
            type="button"
          >
            Сбросить цвета
          </button>
        </div>
        <div className="space-y-5">
          {colorFieldGroups.map((group) => (
            <fieldset className="space-y-3" key={group.title}>
              <legend className="text-sm font-semibold text-slate-900">
                {group.title}
              </legend>
              <div className="grid gap-4 md:grid-cols-2">
                {group.fields.map((field) => (
                  <ColorField
                    disabled={isSaving}
                    key={field.key}
                    label={field.label}
                    name={`colors.${field.key}`}
                    onChange={(value) => {
                      updateColor(field.key, value)
                    }}
                    value={draft.colors[field.key]}
                  />
                ))}
              </div>
              {group.title === 'Auth-экран' ? (
                <OpacityField
                  disabled={isSaving}
                  label="Плотность области входа"
                  name="colors.authContentSurfaceOpacity"
                  onChange={(value) => {
                    updateColor('authContentSurfaceOpacity', value)
                  }}
                  value={draft.colors.authContentSurfaceOpacity}
                />
              ) : null}
            </fieldset>
          ))}
        </div>
      </section>

      <section
        className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm"
        id="assets"
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Изображения</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Логотип, PWA-иконка и фоны для auth-экранов и чата.
          </p>
        </div>
        <BrandingAssetControls
          assets={draft.assets}
          busyKind={assetActionKind}
          disabled={areAssetActionsDisabled}
          onDelete={onAssetDelete}
          onUpload={onAssetUpload}
          onValidationError={onAssetValidationError}
        />
      </section>

      <section
        className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm"
        id="auth"
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Auth-экран</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Текст входа и регистрации.
          </p>
        </div>
        <div className="grid gap-4">
          <TextField
            disabled={isSaving}
            label="Заголовок входа"
            name="copy.authTitle"
            onChange={(value) => {
              updateCopy('authTitle', value)
            }}
            value={draft.copy.authTitle}
          />
          <TextField
            disabled={isSaving}
            label="Подзаголовок входа"
            name="copy.authSubtitle"
            onChange={(value) => {
              updateCopy('authSubtitle', value)
            }}
            value={draft.copy.authSubtitle}
          />
        </div>
      </section>

      <div className="sticky bottom-0 -mx-6 border-t border-slate-200 bg-slate-100/95 px-6 py-4 backdrop-blur">
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-[0.6rem] bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isSubmitDisabled}
          type="submit"
        >
          {isSaving ? 'Сохраняем' : 'Сохранить настройки'}
        </button>
      </div>
    </form>
  )
}
