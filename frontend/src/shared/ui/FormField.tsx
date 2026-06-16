import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

type FormFieldProps = {
  children: ReactNode
  error?: string
  errorId?: string
  hint?: string
  hintId?: string
  htmlFor: string
  label: string
  labelHidden?: boolean
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
  labelHidden = false,
  required = false,
}: FormFieldProps) {
  const resolvedHintId = hintId ?? `${htmlFor}-hint`
  const resolvedErrorId = errorId ?? `${htmlFor}-error`

  return (
    <div>
      <label
        className={cn(
          'auth-text mb-2.5 block text-sm font-medium',
          labelHidden && 'sr-only',
        )}
        htmlFor={htmlFor}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-brand-700">
            {' '}
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint ? (
        <p
          className="auth-muted-text mt-2 text-sm leading-6"
          id={resolvedHintId}
        >
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          className="auth-field-message"
          id={resolvedErrorId}
          role="alert"
        >
          <span aria-hidden="true" className="auth-field-message__icon">
            <svg fill="none" viewBox="0 0 16 16">
              <path
                d="M8 1.75 14.25 13H1.75L8 1.75Z"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.4"
              />
              <path
                d="M8 5.7v3.2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.4"
              />
              <circle cx="8" cy="11.4" fill="currentColor" r="0.7" />
            </svg>
          </span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
