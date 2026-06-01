import type { ReactNode } from 'react'

export function ChatMenuItem({
  destructive = false,
  disabled = false,
  icon,
  label,
  onSelect,
  secondaryLabel,
}: {
  destructive?: boolean
  disabled?: boolean
  icon: ReactNode
  label: string
  onSelect?: () => void
  secondaryLabel?: string
}) {
  const isDisabled = disabled || !onSelect

  return (
    <button
      aria-disabled={isDisabled ? true : undefined}
      className={[
        'flex min-h-10 w-full items-center gap-3 whitespace-nowrap border-b border-slate-200/80 px-1 py-2 text-left text-[15px] leading-5 transition last:border-b-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60',
        destructive
          ? 'text-red-600 hover:text-red-700'
          : 'text-slate-700 hover:text-brand-800',
      ].join(' ')}
      disabled={isDisabled}
      onClick={onSelect}
      role="menuitem"
      type="button"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {secondaryLabel ? (
          <span className="mt-0.5 block truncate text-[11px] leading-4 text-slate-400">
            {secondaryLabel}
          </span>
        ) : null}
      </span>
    </button>
  )
}
