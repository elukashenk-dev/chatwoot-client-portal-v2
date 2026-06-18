import type { ReactNode } from 'react'

import { cn } from '../../../../shared/lib/cn'

type ComposerSideButtonProps = {
  ariaLabel: string
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  shape: 'control' | 'round'
  tabIndex?: number
  title?: string
}

export function ComposerSideButton({
  ariaLabel,
  children,
  disabled = false,
  onClick,
  shape,
  tabIndex,
  title,
}: ComposerSideButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center text-chat-outgoing transition hover:bg-white/55 hover:text-chat-outgoing/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300',
        shape === 'control' ? 'rounded-chat-control' : 'rounded-full',
      )}
      disabled={disabled}
      onClick={onClick}
      tabIndex={tabIndex}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}
