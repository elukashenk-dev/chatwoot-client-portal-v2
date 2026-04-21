import type { InputHTMLAttributes } from 'react'
import { useState } from 'react'

import { cn } from '../lib/cn'
import { inputClassName } from './inputStyles'
import { EyeClosedIcon, EyeOpenIcon } from './icons'

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  hasError?: boolean
  hideLabel?: string
  showLabel?: string
}

export function PasswordField({
  className,
  hasError,
  hideLabel = 'Скрыть пароль',
  id,
  showLabel = 'Показать пароль',
  ...props
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative">
      <input
        {...props}
        className={cn(inputClassName(Boolean(hasError)), 'pr-16', className)}
        id={id}
        type={isVisible ? 'text' : 'password'}
      />

      <button
        aria-controls={id}
        aria-label={isVisible ? hideLabel : showLabel}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-3 my-auto inline-flex h-10 w-10 items-center justify-center rounded-[0.6rem] text-slate-400 transition hover:bg-slate-100 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        onClick={() => setIsVisible((currentValue) => !currentValue)}
        type="button"
      >
        {isVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
      </button>
    </div>
  )
}
