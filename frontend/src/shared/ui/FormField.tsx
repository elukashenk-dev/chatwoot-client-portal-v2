import type { ReactNode } from 'react'

type FormFieldProps = {
  children: ReactNode
  error?: string
  errorId?: string
  hint?: string
  hintId?: string
  htmlFor: string
  label: string
  required?: boolean
}

export function FormField({
  children,
  error,
  errorId,
  hint,
  hintId,
  htmlFor,
  label,
  required = false,
}: FormFieldProps) {
  const resolvedHintId = hintId ?? `${htmlFor}-hint`
  const resolvedErrorId = errorId ?? `${htmlFor}-error`

  return (
    <div>
      <label className="mb-2.5 block text-sm font-medium text-slate-700" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true" className="text-brand-700"> *</span> : null}
      </label>

      {children}

      {hint ? (
        <p className="mt-2 text-sm leading-6 text-slate-500" id={resolvedHintId}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-2 text-sm font-medium text-rose-700"
          id={resolvedErrorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
