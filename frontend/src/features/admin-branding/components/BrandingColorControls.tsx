import type { BrandingColors } from '../api/adminBrandingClient'
import { defaultBrandingColors } from '../../branding/lib/brandingDefaults'

type ColorValueKey = {
  [Key in keyof BrandingColors]: BrandingColors[Key] extends string
    ? Key
    : never
}[keyof BrandingColors]

type ColorFieldConfig = {
  key: ColorValueKey
  label: string
}

type BrandingColorControlsProps = {
  disabled: boolean
  onChange: (colors: BrandingColors) => void
  value: BrandingColors
}

type ColorFieldProps = {
  disabled: boolean
  label: string
  name: string
  onChange: (value: string) => void
  value: string
}

type RgbColor = {
  b: number
  g: number
  r: number
}

const validHexColorPattern = /^#[0-9a-fA-F]{6}$/u

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
      { key: 'authBackground', label: 'Фон страницы входа' },
      { key: 'authText', label: 'Основной текст на входе' },
      {
        key: 'authMutedText',
        label: 'Подсказки на входе',
      },
    ],
    title: 'Экран входа',
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
}: ColorFieldProps) {
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

export function BrandingColorControls({
  disabled,
  onChange,
  value,
}: BrandingColorControlsProps) {
  function updateColor<Key extends keyof BrandingColors>(
    key: Key,
    nextValue: BrandingColors[Key],
  ) {
    const nextColors: BrandingColors = {
      ...value,
      [key]: nextValue,
    }

    if (
      key === 'chatHeaderBackground' &&
      typeof nextValue === 'string' &&
      shouldSyncChatHeaderText(value)
    ) {
      nextColors.chatHeaderText = getReadableChatHeaderText(nextValue)
    }

    onChange(nextColors)
  }

  return (
    <div className="space-y-5">
      {colorFieldGroups.map((group) => (
        <fieldset className="space-y-3" key={group.title}>
          <legend className="text-sm font-semibold text-slate-900">
            {group.title}
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            {group.fields.map((field) => (
              <ColorField
                disabled={disabled}
                key={field.key}
                label={field.label}
                name={`colors.${field.key}`}
                onChange={(nextValue) => {
                  updateColor(field.key, nextValue)
                }}
                value={value[field.key]}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
