import type { InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { inputClassName } from './inputStyles'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean
  leadingIcon?: ReactNode
}

export function TextField({
  className,
  hasError,
  leadingIcon,
  ...props
}: TextFieldProps) {
  if (!leadingIcon) {
    return (
      <input
        {...props}
        className={cn(inputClassName(Boolean(hasError)), className)}
      />
    )
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-slate-500">
        {leadingIcon}
      </span>

      <input
        {...props}
        className={cn(inputClassName(Boolean(hasError)), 'pl-14', className)}
      />
    </div>
  )
}
