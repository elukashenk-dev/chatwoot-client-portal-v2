type BrandingTextFieldProps = {
  disabled: boolean
  label: string
  name: string
  onChange: (value: string) => void
  value: string
}

export function BrandingTextField({
  disabled,
  label,
  name,
  onChange,
  value,
}: BrandingTextFieldProps) {
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
