import type { ClipboardEvent, FocusEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import { useMemo, useRef, useState } from 'react'

import { cn } from '../../../shared/lib/cn'

type OtpInputGroupProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'value'
> & {
  onChange: (value: string) => void
  value: string
}

const OTP_LENGTH = 6

function normalizeOtpValue(value: string) {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

export function OtpInputGroup({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  className,
  disabled,
  id,
  onBlur,
  onChange,
  value,
  ...props
}: OtpInputGroupProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const normalizedValue = normalizeOtpValue(value)
  const digits = useMemo(
    () => Array.from({ length: OTP_LENGTH }, (_, index) => normalizedValue[index] ?? ''),
    [normalizedValue],
  )

  function focusInput(index: number) {
    const input = inputRefs.current[index]

    if (!input) {
      return
    }

    input.focus()
    input.select()
  }

  function commitDigits(nextDigits: string[]) {
    onChange(nextDigits.join(''))
  }

  function handleInputChange(index: number, nextRawValue: string) {
    const nextDigit = normalizeOtpValue(nextRawValue)
    const nextDigits = [...digits]

    nextDigits[index] = nextDigit
    commitDigits(nextDigits)

    if (nextDigit && index < OTP_LENGTH - 1) {
      focusInput(index + 1)
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1)
      return
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusInput(index - 1)
      return
    }

    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault()
      focusInput(index + 1)
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()

    const pastedDigits = normalizeOtpValue(event.clipboardData.getData('text'))

    if (!pastedDigits) {
      return
    }

    const nextDigits = [...digits]

    Array.from(pastedDigits).forEach((digit, digitIndex) => {
      const targetIndex = index + digitIndex

      if (targetIndex < OTP_LENGTH) {
        nextDigits[targetIndex] = digit
      }
    })

    commitDigits(nextDigits)

    const lastFilledIndex = Math.min(index + pastedDigits.length - 1, OTP_LENGTH - 1)
    focusInput(lastFilledIndex)
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setFocusedIndex(null)
    onBlur?.(event)
  }

  return (
    <div className={cn('grid grid-cols-6 gap-2.5 sm:gap-3', className)}>
      {digits.map((digit, index) => (
        <input
          {...props}
          aria-describedby={index === 0 ? ariaDescribedBy : undefined}
          aria-invalid={index === 0 ? ariaInvalid : undefined}
          aria-label={index === 0 ? ariaLabel : `Код из письма, цифра ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          className={cn(
            'block h-16 w-full rounded-[1rem] border text-center text-[22px] font-semibold text-slate-900 shadow-sm transition focus:outline-none',
            focusedIndex === index
              ? 'border-brand-700 bg-slate-50 ring-4 ring-brand-100'
              : 'border-slate-300',
            digit
              ? 'bg-slate-100'
              : focusedIndex === index
                ? 'bg-slate-50'
                : 'bg-white',
            disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : '',
          )}
          disabled={disabled}
          id={index === 0 ? id : undefined}
          inputMode="numeric"
          key={index}
          maxLength={1}
          onBlur={handleBlur}
          onChange={(event) => handleInputChange(index, event.target.value)}
          onFocus={() => setFocusedIndex(index)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          pattern="\d*"
          ref={(node) => {
            inputRefs.current[index] = node
          }}
          type="text"
          value={digit}
        />
      ))}
    </div>
  )
}
