import type { InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { inputClassName } from './inputStyles'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean
  isFilled?: boolean
  leadingIcon?: ReactNode
}

export function TextField({
  className,
  hasError,
  isFilled,
  leadingIcon,
  ...props
}: TextFieldProps) {
  if (!leadingIcon) {
    return (
      <input
        {...props}
        className={cn(
          inputClassName(Boolean(hasError), Boolean(isFilled)),
          className,
        )}
        data-filled={isFilled ? 'true' : undefined}
      />
    )
  }

  return (
    <div className="relative">
      <span
        className={cn(
          'auth-muted-text auth-field-icon pointer-events-none absolute left-5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center',
          hasError && 'auth-field-icon--error',
        )}
      >
        {leadingIcon}
      </span>

      <input
        {...props}
        className={cn(
          inputClassName(Boolean(hasError), Boolean(isFilled)),
          'pl-16',
          className,
        )}
        data-filled={isFilled ? 'true' : undefined}
      />
    </div>
  )
}
