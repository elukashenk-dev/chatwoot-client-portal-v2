import type { InputHTMLAttributes } from 'react'

import { cn } from '../lib/cn'
import { inputClassName } from './inputStyles'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean
}

export function TextField({
  className,
  hasError,
  ...props
}: TextFieldProps) {
  return <input {...props} className={cn(inputClassName(Boolean(hasError)), className)} />
}
