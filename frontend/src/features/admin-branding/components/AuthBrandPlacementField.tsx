import type { BrandingLayout } from '../api/adminBrandingClient'

const authBrandPlacementOptions = [
  { label: 'Слева', value: 'left' },
  { label: 'Центр', value: 'center' },
  { label: 'Справа', value: 'right' },
] satisfies Array<{
  label: string
  value: BrandingLayout['authBrandPlacement']
}>

type AuthBrandPlacementFieldProps = {
  disabled: boolean
  onChange: (value: BrandingLayout['authBrandPlacement']) => void
  value: BrandingLayout['authBrandPlacement']
}

export function AuthBrandPlacementField({
  disabled,
  onChange,
  value,
}: AuthBrandPlacementFieldProps) {
  return (
    <fieldset className="block">
      <legend className="text-sm font-medium text-slate-700">
        Положение логотипа
      </legend>
      <div className="mt-2 grid grid-cols-3 rounded-[0.6rem] border border-slate-200 bg-slate-50 p-1">
        {authBrandPlacementOptions.map((option) => (
          <label
            className={[
              'relative flex min-h-9 items-center justify-center rounded-[0.45rem] px-2 text-center text-sm font-semibold transition',
              'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-100',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              value === option.value
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900',
            ].join(' ')}
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="sr-only"
              disabled={disabled}
              name="layout.authBrandPlacement"
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
