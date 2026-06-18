import type { ReactNode } from 'react'

import { cn } from '../../../shared/lib/cn'

type NotificationSwitchProps = {
  checked: boolean
  description?: ReactNode
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}

const GLASS_CARD_CLASS = 'chat-glass-card-surface'
const GLASS_ROW_BORDER_CLASS = 'border-slate-300/45'

export function NotificationSwitch({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: NotificationSwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={`flex min-h-16 w-full items-center justify-between gap-4 border-b ${GLASS_ROW_BORDER_CLASS} px-4 py-3 text-left transition last:border-b-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60`}
      disabled={disabled}
      onClick={() => {
        onChange(!checked)
      }}
      role="switch"
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-5 text-slate-900">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-[12px] leading-4 text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 rounded-full p-0.5 transition',
          checked ? 'bg-brand-800' : 'bg-slate-200',
        )}
      >
        <span
          className={cn(
            'h-6 w-6 rounded-full bg-white shadow-sm transition',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}

type NotificationActionRowProps = {
  actionLabel?: string
  description?: ReactNode
  disabled?: boolean
  label: string
  onAction?: () => void
}

export function NotificationActionRow({
  actionLabel,
  description,
  disabled = false,
  label,
  onAction,
}: NotificationActionRowProps) {
  return (
    <div
      className={`flex min-h-16 w-full items-center justify-between gap-4 border-b ${GLASS_ROW_BORDER_CLASS} px-4 py-3 last:border-b-0`}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-5 text-slate-900">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-[12px] leading-4 text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
      {actionLabel && onAction ? (
        <button
          className="shrink-0 rounded-md border border-white/65 bg-white/60 px-3 py-1.5 text-[13px] font-medium text-brand-800 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md transition hover:border-white/80 hover:bg-white/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export function NotificationCard({ children }: { children: ReactNode }) {
  return (
    <div className={`overflow-hidden rounded-lg border ${GLASS_CARD_CLASS}`}>
      {children}
    </div>
  )
}
