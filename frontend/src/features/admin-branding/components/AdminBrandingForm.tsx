import type { FormEvent } from 'react'

import type { BrandingColors, BrandingCopy } from '../api/adminBrandingClient'
import type { BrandingDraft } from '../lib/brandingState'

type AdminBrandingFormProps = {
  draft: BrandingDraft
  isSaving: boolean
  onChange: (draft: BrandingDraft) => void
  onSubmit: () => void
}

type TextFieldProps = {
  label: string
  name: string
  onChange: (value: string) => void
  value: string
}

function TextField({ label, name, onChange, value }: TextFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-2 block h-11 w-full rounded-[0.55rem] border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100"
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

function ColorField({ label, name, onChange, value }: TextFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="mt-2 flex h-11 items-center gap-2 rounded-[0.55rem] border border-slate-200 bg-white px-2 shadow-sm focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100">
        <span
          aria-hidden="true"
          className="h-7 w-7 shrink-0 rounded-md border border-slate-200"
          style={{ backgroundColor: value }}
        />
        <input
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-950 outline-none"
          name={name}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          type="text"
          value={value}
        />
      </span>
    </label>
  )
}

export function AdminBrandingForm({
  draft,
  isSaving,
  onChange,
  onSubmit,
}: AdminBrandingFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  function updateColor(key: keyof BrandingColors, value: string) {
    onChange({
      ...draft,
      colors: {
        ...draft.colors,
        [key]: value,
      },
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
      <section className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Основное</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Название портала и подпись поддержки.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Название портала"
            name="portalName"
            onChange={(value) => {
              onChange({ ...draft, portalName: value })
            }}
            value={draft.portalName}
          />
          <TextField
            label="Label поддержки"
            name="supportLabel"
            onChange={(value) => {
              onChange({ ...draft, supportLabel: value })
            }}
            value={draft.supportLabel}
          />
        </div>
      </section>

      <section className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Цвета</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Основные цвета auth-экранов, чата и шапки чата.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ColorField
            label="Основной цвет"
            name="colors.primary"
            onChange={(value) => {
              updateColor('primary', value)
            }}
            value={draft.colors.primary}
          />
          <ColorField
            label="Цвет auth-фона"
            name="colors.authBackground"
            onChange={(value) => {
              updateColor('authBackground', value)
            }}
            value={draft.colors.authBackground}
          />
          <ColorField
            label="Фон чата"
            name="colors.chatBackground"
            onChange={(value) => {
              updateColor('chatBackground', value)
            }}
            value={draft.colors.chatBackground}
          />
          <ColorField
            label="Фон шапки чата"
            name="colors.chatHeaderBackground"
            onChange={(value) => {
              updateColor('chatHeaderBackground', value)
            }}
            value={draft.colors.chatHeaderBackground}
          />
        </div>
      </section>

      <section className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Auth-экран</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Текст входа и регистрации.
          </p>
        </div>
        <div className="grid gap-4">
          <TextField
            label="Заголовок входа"
            name="copy.authTitle"
            onChange={(value) => {
              updateCopy('authTitle', value)
            }}
            value={draft.copy.authTitle}
          />
          <TextField
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
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? 'Сохраняем' : 'Сохранить настройки'}
        </button>
      </div>
    </form>
  )
}
