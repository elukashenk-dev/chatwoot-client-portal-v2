import type { BrandingAppearance } from '../api/adminBrandingClient'

type AuthAppearanceControlsProps = {
  disabled: boolean
  onChange: <Key extends keyof BrandingAppearance>(
    key: Key,
    value: BrandingAppearance[Key],
  ) => void
  value: BrandingAppearance
}

type SegmentedOption<TValue extends string> = {
  label: string
  value: TValue
}

type SegmentedControlProps<TValue extends string> = {
  disabled: boolean
  legend: string
  name: string
  onChange: (value: TValue) => void
  options: readonly SegmentedOption<TValue>[]
  value: TValue
}

const colorSchemeOptions = [
  { label: 'Светлая', value: 'light' },
  { label: 'Темная', value: 'dark' },
] as const satisfies readonly SegmentedOption<
  BrandingAppearance['authColorScheme']
>[]

const overlayOptions = [
  { label: 'Без защиты', value: 'none' },
  { label: 'Светлая дымка', value: 'light' },
  { label: 'Темная дымка', value: 'dark' },
] as const satisfies readonly SegmentedOption<
  BrandingAppearance['authBackgroundOverlay']
>[]

const fieldStyleOptions = [
  { label: 'Светлые', value: 'solid' },
  { label: 'Полупрозрачные', value: 'translucent' },
  { label: 'Контур', value: 'outline' },
] as const satisfies readonly SegmentedOption<
  BrandingAppearance['authFieldStyle']
>[]

const buttonStyleOptions = [
  { label: 'Сплошная', value: 'solid' },
  { label: 'Градиент', value: 'gradient' },
] as const satisfies readonly SegmentedOption<
  BrandingAppearance['authButtonStyle']
>[]

function SegmentedControl<TValue extends string>({
  disabled,
  legend,
  name,
  onChange,
  options,
  value,
}: SegmentedControlProps<TValue>) {
  return (
    <fieldset className="block">
      <legend className="text-sm font-medium text-slate-700">{legend}</legend>
      <div
        className="mt-2 grid rounded-[0.6rem] border border-slate-200 bg-white p-1"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option) => (
          <label
            className={[
              'relative flex min-h-9 items-center justify-center rounded-[0.45rem] px-2 text-center text-sm font-semibold transition',
              'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-100',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              value === option.value
                ? 'bg-brand-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900',
            ].join(' ')}
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="sr-only"
              disabled={disabled}
              name={name}
              onChange={() => {
                onChange(option.value)
              }}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function AuthAppearanceControls({
  disabled,
  onChange,
  value,
}: AuthAppearanceControlsProps) {
  return (
    <div
      aria-labelledby="auth-appearance-controls-title"
      className="space-y-4 rounded-[0.6rem] border border-slate-200 bg-slate-50/70 p-3"
      role="group"
    >
      <div>
        <h4
          className="text-sm font-semibold text-slate-900"
          id="auth-appearance-controls-title"
        >
          Оформление входа
        </h4>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Эти настройки помогают сохранить читаемость формы поверх общего фона.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SegmentedControl
          disabled={disabled}
          legend="Цветовая схема"
          name="appearance.authColorScheme"
          onChange={(nextValue) => {
            onChange('authColorScheme', nextValue)
          }}
          options={colorSchemeOptions}
          value={value.authColorScheme}
        />
        <SegmentedControl
          disabled={disabled}
          legend="Защита фона"
          name="appearance.authBackgroundOverlay"
          onChange={(nextValue) => {
            onChange('authBackgroundOverlay', nextValue)
          }}
          options={overlayOptions}
          value={value.authBackgroundOverlay}
        />
        <SegmentedControl
          disabled={disabled}
          legend="Стиль полей"
          name="appearance.authFieldStyle"
          onChange={(nextValue) => {
            onChange('authFieldStyle', nextValue)
          }}
          options={fieldStyleOptions}
          value={value.authFieldStyle}
        />
        <SegmentedControl
          disabled={disabled}
          legend="Стиль кнопки"
          name="appearance.authButtonStyle"
          onChange={(nextValue) => {
            onChange('authButtonStyle', nextValue)
          }}
          options={buttonStyleOptions}
          value={value.authButtonStyle}
        />
      </div>
    </div>
  )
}
