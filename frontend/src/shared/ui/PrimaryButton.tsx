import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/cn'

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  loading?: boolean
  loadingLabel?: string
}

export function PrimaryButton({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel,
  type = 'button',
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex min-h-14 w-full items-center justify-center rounded-[0.6rem] bg-brand-800 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-300',
        className,
      )}
      disabled={disabled || loading}
      type={type}
    >
      <span>{loading && loadingLabel ? loadingLabel : children}</span>

      {loading ? (
        <svg
          aria-hidden="true"
          className="ml-2 h-4 w-4 animate-spin text-white"
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z"
            fill="currentColor"
          />
        </svg>
      ) : null}
    </button>
  )
}
