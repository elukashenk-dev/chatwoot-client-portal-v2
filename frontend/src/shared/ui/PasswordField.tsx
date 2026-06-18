import type { InputHTMLAttributes, ReactNode } from 'react'
import { useState } from 'react'

import { cn } from '../lib/cn'
import { inputClassName } from './inputStyles'
import { EyeClosedIcon, EyeOpenIcon } from './icons'

type PasswordFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> & {
  hasError?: boolean
  hideLabel?: string
  isFilled?: boolean
  leadingIcon?: ReactNode
  showLabel?: string
}

export function PasswordField({
  className,
  hasError,
  hideLabel = 'Скрыть пароль',
  id,
  isFilled,
  leadingIcon,
  showLabel = 'Показать пароль',
  ...props
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative">
      {leadingIcon ? (
        <span
          className={cn(
            'auth-muted-text auth-field-icon pointer-events-none absolute left-5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center',
            hasError && 'auth-field-icon--error',
          )}
        >
          {leadingIcon}
        </span>
      ) : null}

      <input
        {...props}
        className={cn(
          inputClassName(Boolean(hasError), Boolean(isFilled)),
          Boolean(leadingIcon) && 'pl-16',
          'pr-16',
          className,
        )}
        data-filled={isFilled ? 'true' : undefined}
        id={id}
        type={isVisible ? 'text' : 'password'}
      />

      <button
        aria-controls={id}
        aria-label={isVisible ? hideLabel : showLabel}
        aria-pressed={isVisible}
        className="auth-muted-text absolute inset-y-0 right-3 my-auto inline-flex h-10 w-10 items-center justify-center rounded-[0.6rem] transition hover:bg-slate-100 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        onClick={() => setIsVisible((currentValue) => !currentValue)}
        type="button"
      >
        {isVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
      </button>
    </div>
  )
}
